import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { BridgeAction, BridgeResponse, BridgeTransport } from 'smartclip-bridge-protocol'
import { DEFAULT_WS_PORT } from '../bridge/websocketBridge.js'
import type { HubHealthPayload } from './hubServer.js'
import {
  hashSessionToken,
  normalizeAllowedOrigins,
  readHubState,
} from './hubState.js'

const DEFAULT_HUB_HOST = '127.0.0.1'

export interface ProbeHubOptions {
  host?: string
  port?: number
  probeExtension?: boolean
  timeoutMs?: number
}

export interface EnsureHubOptions {
  host?: string
  port?: number
  smartclipHome?: string
  entryScriptPath?: string
  waitTimeoutMs?: number
  expectedVersion?: string
  sessionToken?: string
  allowedOrigins?: readonly string[]
  bindHost?: string
}

export interface HubConsistencyTarget {
  version?: string
  tokenFingerprint?: string | null
  allowedOrigins?: readonly string[] | null
  bindHost?: string
}

/**
 * 比较运行中 Hub 与当前期望配置，判断是否需要重启 Hub。
 * 返回重启原因字符串，无需重启则返回 null。
 */
export function shouldRestartHub(
  existing: {
    version: string
    tokenFingerprint?: string | null
    allowedOrigins?: readonly string[] | null
    bindHost?: string
  },
  desired: HubConsistencyTarget,
): string | null {
  if (desired.version && existing.version !== desired.version) {
    return `version changed (${existing.version} -> ${desired.version})`
  }
  // 仅当新客户端显式要求 sessionToken 时才校对指纹，避免无 token 客户端把已有安全 Hub 降级
  if (desired.tokenFingerprint && existing.tokenFingerprint !== desired.tokenFingerprint) {
    return 'sessionToken changed'
  }
  const normalizedDesiredOrigins = normalizeAllowedOrigins(desired.allowedOrigins ?? undefined)
  if (normalizedDesiredOrigins) {
    const normalizedExistingOrigins = normalizeAllowedOrigins(existing.allowedOrigins ?? undefined)
    if (JSON.stringify(normalizedExistingOrigins) !== JSON.stringify(normalizedDesiredOrigins)) {
      return 'allowedOrigins changed'
    }
  }
  if (desired.bindHost && existing.bindHost && existing.bindHost !== desired.bindHost) {
    return `bindHost changed (${existing.bindHost} -> ${desired.bindHost})`
  }
  return null
}

export interface EnsureHubResult {
  host: string
  port: number
  hubSecret: string
  health: HubHealthPayload
  spawned: boolean
}

export async function probeHub(options: ProbeHubOptions = {}): Promise<HubHealthPayload | null> {
  const host = options.host ?? DEFAULT_HUB_HOST
  const port = options.port ?? DEFAULT_WS_PORT
  const timeoutMs = options.timeoutMs ?? 1500
  const query = options.probeExtension ? '?probe=1' : ''
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`http://${host}:${port}/health${query}`, {
      signal: controller.signal,
    })
    if (!response.ok)
      return null
    return await response.json() as HubHealthPayload
  }
  catch {
    return null
  }
  finally {
    clearTimeout(timer)
  }
}

export async function stopHub(options: { host?: string, port?: number, smartclipHome?: string } = {}): Promise<{ stopped: boolean, reason?: string }> {
  const state = await readHubState(options.smartclipHome)
  const host = options.host ?? state?.host ?? DEFAULT_HUB_HOST
  const port = options.port ?? state?.port ?? DEFAULT_WS_PORT
  const health = await probeHub({ host, port, timeoutMs: 1000 })

  if (!health) {
    return { stopped: false, reason: 'Hub 未运行' }
  }

  if (!state?.hubSecret) {
    return { stopped: false, reason: '未找到 hub.json 密钥，无法安全关闭' }
  }

  try {
    const res = await fetch(`http://${host}:${port}/hub/shutdown`, {
      method: 'POST',
      headers: {
        'x-smartclip-hub-secret': state.hubSecret,
      },
    })
    if (!res.ok) {
      return { stopped: false, reason: `关闭失败 (HTTP ${res.status})` }
    }
    return { stopped: true }
  }
  catch (err) {
    return { stopped: false, reason: err instanceof Error ? err.message : String(err) }
  }
}

export async function ensureHubRunning(options: EnsureHubOptions = {}): Promise<EnsureHubResult> {
  const host = options.host ?? DEFAULT_HUB_HOST
  const port = options.port ?? DEFAULT_WS_PORT
  const waitTimeoutMs = options.waitTimeoutMs ?? 5000
  const desiredTokenFingerprint = hashSessionToken(options.sessionToken)
  const desiredAllowedOrigins = normalizeAllowedOrigins(options.allowedOrigins)

  const existingState = await readHubState(options.smartclipHome)
  if (existingState && existingState.port === port) {
    const existingHealth = await probeHub({ host, port, timeoutMs: 800 })
    if (existingHealth && existingHealth.hub.pid === existingState.pid) {
      const restartReason = shouldRestartHub(
        {
          version: existingHealth.hub.version || existingState.version,
          tokenFingerprint: existingHealth.hub.tokenFingerprint !== undefined
            ? existingHealth.hub.tokenFingerprint
            : existingState.tokenFingerprint,
          allowedOrigins: existingHealth.hub.allowedOrigins !== undefined
            ? existingHealth.hub.allowedOrigins
            : existingState.allowedOrigins,
          bindHost: existingHealth.hub.bindHost ?? existingState.bindHost,
        },
        {
          version: options.expectedVersion,
          tokenFingerprint: desiredTokenFingerprint,
          allowedOrigins: desiredAllowedOrigins,
          bindHost: options.bindHost,
        },
      )

      if (!restartReason) {
        return {
          host,
          port,
          hubSecret: existingState.hubSecret,
          health: existingHealth,
          spawned: false,
        }
      }

      process.stderr.write(`[smartclip-mcp] Restarting Local Hub (${restartReason})...\n`)
      await stopHub({ host, port, smartclipHome: options.smartclipHome })
      const stopDeadline = Date.now() + 1500
      while (Date.now() < stopDeadline) {
        const stillUp = await probeHub({ host, port, timeoutMs: 300 })
        if (!stillUp)
          break
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
  }

  const entryScript = options.entryScriptPath ?? fileURLToPath(new URL('../index.js', import.meta.url))
  const child = spawn(process.execPath, [entryScript, 'daemon', 'run', '--port', String(port)], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      ...(options.smartclipHome ? { SMARTCLIP_HOME: options.smartclipHome } : {}),
      ...(options.sessionToken !== undefined ? { SMARTCLIP_MCP_SESSION_TOKEN: options.sessionToken } : {}),
      ...(desiredAllowedOrigins ? { SMARTCLIP_MCP_ALLOWED_ORIGINS: desiredAllowedOrigins.join(',') } : {}),
      ...(options.bindHost !== undefined ? { SMARTCLIP_MCP_WS_BIND_HOST: options.bindHost } : {}),
    },
  })
  child.unref()

  const deadline = Date.now() + waitTimeoutMs
  while (Date.now() < deadline) {
    const state = await readHubState(options.smartclipHome)
    const health = await probeHub({ host, port, timeoutMs: 500 })
    if (state && health && state.port === port && health.hub.pid === state.pid) {
      return {
        host,
        port,
        hubSecret: state.hubSecret,
        health,
        spawned: true,
      }
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  throw new Error(`无法在 ${waitTimeoutMs}ms 内启动或连接 SmartClip Local Hub (ws://${host}:${port})`)
}

export interface HttpBridgeTransportOptions {
  host?: string
  port?: number
  hubSecret: string
  smartclipHome?: string
  autoReconnect?: boolean
  expectedVersion?: string
  sessionToken?: string
  allowedOrigins?: readonly string[]
  bindHost?: string
}

/**
 * 薄 stdio MCP 代理使用的 BridgeTransport：通过本地 HTTP POST /bridge/invoke 转发给 Hub。
 */
export class HttpBridgeTransport implements BridgeTransport {
  private readonly host: string
  private readonly port: number
  private hubSecret: string
  private readonly smartclipHome?: string
  private readonly autoReconnect: boolean
  private readonly expectedVersion?: string
  private readonly sessionToken?: string
  private readonly allowedOrigins?: readonly string[]
  private readonly bindHost?: string

  constructor(options: HttpBridgeTransportOptions) {
    this.host = options.host ?? DEFAULT_HUB_HOST
    this.port = options.port ?? DEFAULT_WS_PORT
    this.hubSecret = options.hubSecret
    this.smartclipHome = options.smartclipHome
    this.autoReconnect = options.autoReconnect ?? true
    this.expectedVersion = options.expectedVersion
    this.sessionToken = options.sessionToken
    this.allowedOrigins = options.allowedOrigins
    this.bindHost = options.bindHost
  }

  async send(action: BridgeAction, data?: unknown): Promise<BridgeResponse> {
    try {
      return await this.invokeOnce(action, data)
    }
    catch (err) {
      if (this.autoReconnect && err instanceof HubUnavailableError) {
        const recovered = await ensureHubRunning({
          host: this.host,
          port: this.port,
          smartclipHome: this.smartclipHome,
          expectedVersion: this.expectedVersion,
          sessionToken: this.sessionToken,
          allowedOrigins: this.allowedOrigins,
          bindHost: this.bindHost,
        })
        this.hubSecret = recovered.hubSecret
        return await this.invokeOnce(action, data)
      }
      throw err
    }
  }

  private async invokeOnce(action: BridgeAction, data?: unknown): Promise<BridgeResponse> {
    let response: Response
    try {
      response = await fetch(`http://${this.host}:${this.port}/bridge/invoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-smartclip-hub-secret': this.hubSecret,
        },
        body: JSON.stringify({ action, data }),
      })
    }
    catch (err) {
      throw new HubUnavailableError(err instanceof Error ? err.message : String(err))
    }

    if (response.status === 401 && this.autoReconnect) {
      const latestState = await readHubState(this.smartclipHome)
      if (latestState?.hubSecret && latestState.hubSecret !== this.hubSecret) {
        this.hubSecret = latestState.hubSecret
        return this.invokeOnce(action, data)
      }
    }

    const payload = await response.json().catch(() => ({})) as { error?: string } & Partial<BridgeResponse>
    if (!response.ok) {
      throw new Error(payload.error || `Hub invoke failed (HTTP ${response.status})`)
    }

    return payload as BridgeResponse
  }
}

class HubUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HubUnavailableError'
  }
}
