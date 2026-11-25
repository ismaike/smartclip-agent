import os from 'node:os'
import { DEFAULT_WS_PORT } from '../bridge/websocketBridge.js'
import { probeHub } from '../hub/hubClient.js'
import type { HubHealthPayload } from '../hub/hubServer.js'
import { inspectClientConfigs } from './clientConfigs.js'

export interface DoctorCheckItem {
  name: string
  ok: boolean
  detail: string
}

export interface DoctorReport {
  ok: boolean
  cwd: string
  checks: DoctorCheckItem[]
  hubHealth: HubHealthPayload | null
}

export interface RunMcpDoctorOptions {
  cwd?: string
  home?: string
  host?: string
  port?: number
  checkHealth?: boolean
  probeHubFn?: typeof probeHub
}

export async function runMcpDoctor(options: RunMcpDoctorOptions = {}): Promise<DoctorReport> {
  const cwd = options.cwd ?? process.cwd()
  const home = options.home ?? os.homedir()
  const host = options.host ?? '127.0.0.1'
  const port = options.port ?? DEFAULT_WS_PORT
  const checkHealth = options.checkHealth ?? true
  const probe = options.probeHubFn ?? probeHub

  const checks: DoctorCheckItem[] = []
  const configs = await inspectClientConfigs({ home, cwd })
  const configuredTargets = configs.filter(c => c.configured)

  checks.push({
    name: 'client-configs',
    ok: configuredTargets.length > 0,
    detail: configuredTargets.length > 0
      ? `已在 ${configuredTargets.map(c => c.id).join(', ')} 中找到 smartclip MCP 配置`
      : '未在 .mcp.json / Claude / Cursor / Gemini / Windsurf 中找到 smartclip 配置（可运行 smartclip-mcp setup）',
  })

  let hubHealth: HubHealthPayload | null = null
  if (checkHealth) {
    hubHealth = await probe({ host, port, probeExtension: true, timeoutMs: 1500 })

    checks.push({
      name: 'hub-daemon',
      ok: Boolean(hubHealth),
      detail: hubHealth
        ? `Local Hub 运行中 (pid=${hubHealth.hub.pid}, port=${hubHealth.hub.port}, sessions=${hubHealth.hub.activeMcpSessions})`
        : `Local Hub 未运行 (ws://${host}:${port})，可运行 smartclip-mcp daemon start 或由 AI 客户端自动拉起`,
    })

    if (hubHealth) {
      const connected = hubHealth.bridge.extensionConnected
      const authed = hubHealth.bridge.authenticated || hubHealth.bridge.legacyMode
      checks.push({
        name: 'extension-connection',
        ok: connected && authed,
        detail: !connected
          ? 'SmartClip Chrome 扩展尚未连接到 Local Hub'
          : authed
            ? `扩展已连接 (${hubHealth.bridge.clientMetadata?.clientVersion ?? 'legacy'})`
            : `扩展已连接但未完成握手 (${hubHealth.bridge.lastHandshakeFailure.code ?? 'unknown'})`,
      })

      if (hubHealth.extensionStatus) {
        const status = hubHealth.extensionStatus
        const proReady = status.mcpEnabled && status.pro
        checks.push({
          name: 'extension-capability',
          ok: proReady,
          detail: proReady
            ? `扩展 MCP 开关已开启且具备 Pro 权限 (ext=${status.extensionVersion ?? '?'})`
            : `扩展状态异常: mcpEnabled=${status.mcpEnabled}, pro=${status.pro}`,
        })
      }
    }
  }

  return {
    ok: checks.every(c => c.ok),
    cwd,
    checks,
    hubHealth,
  }
}

export function formatDoctorHuman(report: DoctorReport): string {
  const lines = [report.ok ? '✅ SmartClip MCP doctor passed' : '❌ SmartClip MCP doctor found issues']
  for (const check of report.checks) {
    lines.push(`${check.ok ? '✅' : '❌'} ${check.name}: ${check.detail}`)
  }
  return lines.join('\n')
}

export async function runHealthcheck(options: {
  host?: string
  port?: number
  json?: boolean
  probeHubFn?: typeof probeHub
} = {}): Promise<number> {
  const host = options.host ?? '127.0.0.1'
  const port = options.port ?? DEFAULT_WS_PORT
  const probe = options.probeHubFn ?? probeHub

  const health = await probe({ host, port, probeExtension: true, timeoutMs: 1500 })
  const healthy = Boolean(health && health.ok)

  if (options.json) {
    console.log(JSON.stringify({
      ok: healthy,
      host,
      port,
      hubRunning: Boolean(health),
      health,
    }, null, 2))
  }
  else if (!health) {
    console.log(`❌ SmartClip Local Hub 未运行 (http://${host}:${port})`)
  }
  else if (!health.ok) {
    console.log(`⚠️ SmartClip Local Hub 运行中 (pid=${health.hub.pid})，但扩展尚未就绪`)
  }
  else {
    console.log(`✅ SmartClip Local Hub 与 Chrome 扩展连接健康 (pid=${health.hub.pid}, port=${health.hub.port})`)
  }

  return healthy ? 0 : 1
}
