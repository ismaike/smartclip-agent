import { randomUUID, timingSafeEqual } from 'node:crypto'
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { BridgeAction, bridgeStatusSchema, type BridgeStatus } from 'smartclip-bridge-protocol'
import {
  DEFAULT_WS_PORT,
  WebSocketBridge,
  parseAllowedOriginsEnv,
  type BridgeHealthSnapshot,
} from '../bridge/websocketBridge.js'
import { createSmartClipMcpServer } from '../server.js'
import {
  generateHubSecret,
  hashSessionToken,
  normalizeAllowedOrigins,
  removeHubStateIfOwned,
  writeHubState,
} from './hubState.js'

const DEFAULT_HUB_HOST = '127.0.0.1'
const MAX_HTTP_BODY_BYTES = 10 * 1024 * 1024
const VALID_BRIDGE_ACTIONS = new Set<string>(Object.values(BridgeAction))

export interface HubHealthPayload {
  ok: boolean
  hub: {
    pid: number
    version: string
    startedAt: string
    uptimeSec: number
    activeMcpSessions: number
    port: number
    host: string
    tokenFingerprint?: string | null
    allowedOrigins?: string[] | null
    bindHost?: string
  }
  bridge: BridgeHealthSnapshot
  extensionStatus?: BridgeStatus
  probeError?: string
}

export interface HubServerOptions {
  port?: number
  host?: string
  sessionToken?: string
  allowedOrigins?: readonly string[]
  hubSecret?: string
  version?: string
  smartclipHome?: string
  /** 默认 true；测试时可保持 true 并传隔离的 smartclipHome */
  persistState?: boolean
}

interface HttpSessionEntry {
  transport: StreamableHTTPServerTransport
  server: McpServer
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(payload)
}

function isLoopbackHttpOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin)
    const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:'
    const isLoopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '[::1]'
    return isHttp && isLoopback
  }
  catch {
    return false
  }
}

function safeSecretEquals(actual: string | undefined, expected: string): boolean {
  if (!actual)
    return false
  const actualBuf = Buffer.from(actual, 'utf8')
  const expectedBuf = Buffer.from(expected, 'utf8')
  if (actualBuf.length !== expectedBuf.length)
    return false
  return timingSafeEqual(actualBuf, expectedBuf)
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let totalBytes = 0

    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length
      if (totalBytes > MAX_HTTP_BODY_BYTES) {
        reject(new Error('Request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })

    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (!raw) {
        resolve(undefined)
        return
      }
      try {
        resolve(JSON.parse(raw))
      }
      catch {
        reject(new Error('Invalid JSON request body'))
      }
    })

    req.on('error', reject)
  })
}

export class HubServer {
  readonly bridge: WebSocketBridge
  private readonly port: number
  private readonly host: string
  private readonly hubSecret: string
  private readonly version: string
  private readonly smartclipHome?: string
  private readonly persistState: boolean
  private readonly tokenFingerprint: string | null
  private readonly allowedOriginsList: string[] | null
  private readonly startedAtMs = Date.now()
  private readonly startedAt = new Date(this.startedAtMs).toISOString()
  private httpServer: http.Server | null = null
  private sessions = new Map<string, HttpSessionEntry>()
  private stopping = false

  constructor(options: HubServerOptions = {}) {
    this.port = options.port ?? DEFAULT_WS_PORT
    this.host = options.host ?? process.env.SMARTCLIP_MCP_WS_BIND_HOST ?? DEFAULT_HUB_HOST
    this.hubSecret = options.hubSecret ?? generateHubSecret()
    this.version = options.version ?? '1.6.1'
    this.smartclipHome = options.smartclipHome
    this.persistState = options.persistState ?? true
    this.tokenFingerprint = hashSessionToken(options.sessionToken)
    this.allowedOriginsList = normalizeAllowedOrigins(
      options.allowedOrigins ?? parseAllowedOriginsEnv(process.env.SMARTCLIP_MCP_ALLOWED_ORIGINS),
    )

    this.bridge = new WebSocketBridge({
      sessionToken: options.sessionToken,
      port: this.port,
      host: this.host,
      allowedOrigins: options.allowedOrigins,
      noListen: true,
    })
  }

  get secret(): string {
    return this.hubSecret
  }

  get actualPort(): number {
    const addr = this.httpServer?.address()
    if (addr && typeof addr === 'object')
      return addr.port
    return this.port
  }

  async start(): Promise<void> {
    if (this.httpServer)
      return

    await this.bridge.connect()

    const server = http.createServer((req, res) => {
      void this.handleHttpRequest(req, res)
    })

    server.on('upgrade', (req, socket, head) => {
      const url = this.parseUrl(req.url)
      if (url.pathname === '/' || url.pathname === '/ws') {
        this.bridge.handleUpgrade(req, socket, head)
        return
      }
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
      socket.destroy()
    })

    await new Promise<void>((resolve, reject) => {
      server.once('error', (err) => {
        const msg = err instanceof Error ? err.message : String(err)
        reject(new Error(`Hub server failed to listen on ${this.host}:${this.port}: ${msg}`))
      })

      server.listen(this.port, this.host, () => {
        this.httpServer = server
        resolve()
      })
    })

    if (this.persistState) {
      await writeHubState({
        pid: process.pid,
        port: this.actualPort,
        host: this.host === '0.0.0.0' ? DEFAULT_HUB_HOST : this.host,
        hubSecret: this.hubSecret,
        version: this.version,
        startedAt: this.startedAt,
        tokenFingerprint: this.tokenFingerprint,
        allowedOrigins: this.allowedOriginsList,
        bindHost: this.host,
      }, this.smartclipHome)
    }

    process.stderr.write(`[smartclip-hub] Listening on http://${this.host}:${this.actualPort} (WS: /, MCP: /mcp, Health: /health)\n`)
  }

  private parseUrl(rawUrl: string | undefined): URL {
    return new URL(rawUrl || '/', `http://${DEFAULT_HUB_HOST}:${this.actualPort || this.port || DEFAULT_WS_PORT}`)
  }

  private async handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = this.parseUrl(req.url)
    const method = req.method ?? 'GET'
    const origin = req.headers.origin

    // 内部控制面接口绝不允许携带 Origin（防止浏览器端 CSRF / DNS Rebinding）
    if (url.pathname === '/bridge/invoke' || url.pathname === '/hub/shutdown') {
      if (origin !== undefined) {
        sendJson(res, 403, { error: 'Browser origin is forbidden for internal hub endpoints' })
        return
      }
      const headerSecret = Array.isArray(req.headers['x-smartclip-hub-secret'])
        ? req.headers['x-smartclip-hub-secret'][0]
        : req.headers['x-smartclip-hub-secret']
      if (!safeSecretEquals(headerSecret, this.hubSecret)) {
        sendJson(res, 401, { error: 'Unauthorized: invalid hub secret' })
        return
      }
    }
    else if (origin !== undefined && !isLoopbackHttpOrigin(origin)) {
      sendJson(res, 403, { error: 'Forbidden origin' })
      return
    }

    if (url.pathname === '/health' && method === 'GET') {
      await this.handleHealth(url, res)
      return
    }

    if (url.pathname === '/bridge/invoke' && method === 'POST') {
      await this.handleBridgeInvoke(req, res)
      return
    }

    if (url.pathname === '/hub/shutdown' && method === 'POST') {
      sendJson(res, 200, { ok: true })
      setImmediate(() => {
        void this.stop()
      })
      return
    }

    if (url.pathname === '/mcp') {
      await this.handleMcpRequest(req, res)
      return
    }

    sendJson(res, 404, { error: 'Not Found' })
  }

  private async handleHealth(url: URL, res: ServerResponse): Promise<void> {
    const snapshot = this.bridge.getHealthSnapshot(this.actualPort)
    const payload: HubHealthPayload = {
      ok: snapshot.ok,
      hub: {
        pid: process.pid,
        version: this.version,
        startedAt: this.startedAt,
        uptimeSec: Math.round((Date.now() - this.startedAtMs) / 1000),
        activeMcpSessions: this.sessions.size,
        port: this.actualPort,
        host: this.host,
        tokenFingerprint: this.tokenFingerprint,
        allowedOrigins: this.allowedOriginsList,
        bindHost: this.host,
      },
      bridge: snapshot,
    }

    if (url.searchParams.get('probe') === '1' && snapshot.extensionConnected && (snapshot.authenticated || snapshot.legacyMode)) {
      try {
        const probeResp = await this.bridge.send(BridgeAction.GET_STATUS, undefined, {
          waitForExtensionMs: 1000,
          requestTimeoutMs: 3000,
        })
        if (probeResp.success) {
          const parsedStatus = bridgeStatusSchema.safeParse(probeResp.data)
          if (parsedStatus.success) {
            payload.extensionStatus = parsedStatus.data
          }
        }
        else {
          payload.probeError = probeResp.error
        }
      }
      catch (err) {
        payload.probeError = err instanceof Error ? err.message : String(err)
      }
    }

    sendJson(res, 200, payload)
  }

  private async handleBridgeInvoke(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body: unknown
    try {
      body = await readJsonBody(req)
    }
    catch (err) {
      sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) })
      return
    }

    const record = (typeof body === 'object' && body !== null ? body : {}) as {
      action?: unknown
      data?: unknown
      waitForExtensionMs?: unknown
      requestTimeoutMs?: unknown
    }

    if (typeof record.action !== 'string' || !VALID_BRIDGE_ACTIONS.has(record.action)) {
      sendJson(res, 400, { error: `Invalid bridge action: ${String(record.action)}` })
      return
    }

    const waitForExtensionMs = typeof record.waitForExtensionMs === 'number' ? record.waitForExtensionMs : undefined
    const requestTimeoutMs = typeof record.requestTimeoutMs === 'number' ? record.requestTimeoutMs : undefined

    try {
      const response = await this.bridge.send(record.action as BridgeAction, record.data, {
        waitForExtensionMs,
        requestTimeoutMs,
      })
      sendJson(res, 200, response)
    }
    catch (err) {
      sendJson(res, 503, { error: err instanceof Error ? err.message : String(err) })
    }
  }

  private async handleMcpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const sessionHeader = req.headers['mcp-session-id']
    const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader
    const method = req.method ?? 'GET'

    if (method === 'POST') {
      let parsedBody: unknown
      try {
        parsedBody = await readJsonBody(req)
      }
      catch (err) {
        sendJson(res, 400, {
          jsonrpc: '2.0',
          error: { code: -32700, message: err instanceof Error ? err.message : 'Parse error' },
          id: null,
        })
        return
      }

      if (sessionId) {
        const entry = this.sessions.get(sessionId)
        if (!entry) {
          sendJson(res, 404, {
            jsonrpc: '2.0',
            error: { code: -32001, message: 'Session not found' },
            id: null,
          })
          return
        }
        await entry.transport.handleRequest(req, res, parsedBody)
        return
      }

      if (!isInitializeRequest(parsedBody)) {
        sendJson(res, 400, {
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
          id: null,
        })
        return
      }

      const server = createSmartClipMcpServer({
        version: this.version,
        transport: this.bridge,
      })

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          this.sessions.set(newSessionId, { transport, server })
        },
      })

      transport.onclose = () => {
        if (transport.sessionId) {
          this.sessions.delete(transport.sessionId)
        }
      }

      await server.connect(transport)
      await transport.handleRequest(req, res, parsedBody)
      return
    }

    if (method === 'GET' || method === 'DELETE') {
      if (!sessionId) {
        sendJson(res, 400, { error: 'Missing mcp-session-id header' })
        return
      }
      const entry = this.sessions.get(sessionId)
      if (!entry) {
        sendJson(res, 404, { error: 'Session not found' })
        return
      }
      await entry.transport.handleRequest(req, res)
      return
    }

    sendJson(res, 405, { error: 'Method Not Allowed' })
  }

  async stop(): Promise<void> {
    if (this.stopping)
      return
    this.stopping = true

    for (const [id, entry] of this.sessions) {
      this.sessions.delete(id)
      try {
        await entry.transport.close()
      }
      catch {
        // 忽略关闭异常
      }
      try {
        await entry.server.close()
      }
      catch {
        // 忽略关闭异常
      }
    }

    await this.bridge.disconnect()

    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve())
      })
      this.httpServer = null
    }

    if (this.persistState) {
      await removeHubStateIfOwned(process.pid, this.smartclipHome)
    }
  }
}
