/**
 * WebSocket Bridge
 *
 * MCP Server（或 Local Bridge Hub）提供本地 WebSocket 服务，Chrome 扩展作为客户端连接。
 *
 * 通信链路：
 * AI Clients <--stdio/HTTP--> smartclip-mcp / Hub <--WebSocket--> Chrome Extension Background
 */

import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import http, { type IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import {
  BRIDGE_PROTOCOL_VERSION,
  BridgeAction,
  BridgeErrorCode,
  bridgeErrorToCloseCode,
  actionEnvelopeSchema,
  bridgeErrorSchema,
  bridgeResponseSchema,
  helloRequestSchema,
  type BridgeResponse,
  type BridgeTransport,
  type HelloRequest,
} from 'smartclip-bridge-protocol'
import { type WebSocket, WebSocketServer } from 'ws'

export const DEFAULT_WS_PORT = 18365
const HELLO_TIMEOUT_MS = 5000
const WS_CONNECT_HOST = '127.0.0.1'
const DEFAULT_WAIT_FOR_EXTENSION_MS = 90000
const DEFAULT_REQUEST_TIMEOUT_MS = 60000

const EXTENSION_ORIGIN_PROTOCOLS = new Set([
  'chrome-extension:',
  'moz-extension:',
  'safari-web-extension:',
])

/** 会读写标签页状态或触发剪藏副作用的动作，需在多客户端并发时串行排队 */
const SERIALIZED_BRIDGE_ACTIONS = new Set<BridgeAction>([
  BridgeAction.CLIP_PAGE,
  BridgeAction.CLIP_DAILY_TASK,
  BridgeAction.CLIP_ALL_DAILY_TASKS,
  BridgeAction.SAVE_CLIP,
  BridgeAction.EXTRACT_PAGE,
])

interface PendingRequest {
  resolve: (value: BridgeResponse) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export interface BridgeOptions {
  sessionToken?: string
  port?: number
  host?: string
  allowedOrigins?: readonly string[]
  /** 为 true 时不自建 http.Server，由外部 HubServer 调用 handleUpgrade */
  noListen?: boolean
}

export interface SendOptions {
  waitForExtensionMs?: number
  requestTimeoutMs?: number
}

export interface ClientMetadata {
  protocolVersion: string
  clientName: string
  clientVersion: string
  capabilities: Record<string, boolean>
}

export interface LastHandshakeFailure {
  code: BridgeErrorCode | null
  message: string | null
}

export interface LastDisconnectFailure {
  closeCode: number | null
  reason: string | null
}

export interface BridgeHealthSnapshot {
  ok: boolean
  serverListening: boolean
  port: number
  bindHost: string
  extensionConnected: boolean
  authenticated: boolean
  legacyMode: boolean
  tokenRequired: boolean
  clientMetadata: ClientMetadata | null
  lastHandshakeFailure: LastHandshakeFailure
  lastDisconnectFailure: LastDisconnectFailure
  pendingRequestCount: number
  serverVersion: string
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error
    && 'code' in error
}

export function parseAllowedOriginsEnv(raw: string | undefined): string[] | undefined {
  if (!raw)
    return undefined
  const parsed = raw.split(',').map(s => s.trim()).filter(Boolean)
  return parsed.length > 0 ? parsed : undefined
}

/**
 * 校验 WebSocket Upgrade 请求的 Origin，防止浏览器网页发起跨站 WebSocket 劫持（CSWSH）。
 *
 * - 无 Origin 头（Node.js / CLI / 测试客户端）：允许
 * - 显式配置了 allowedOrigins：严格精确匹配
 * - 默认策略：仅允许浏览器扩展 Origin（chrome-extension:// / moz-extension:// / safari-web-extension://）
 */
export function isOriginAllowed(origin: string | undefined, allowedOrigins?: readonly string[]): boolean {
  if (origin === undefined)
    return true

  if (allowedOrigins && allowedOrigins.length > 0)
    return allowedOrigins.includes(origin)

  try {
    const parsed = new URL(origin)
    return EXTENSION_ORIGIN_PROTOCOLS.has(parsed.protocol) && parsed.hostname.length > 0
  }
  catch {
    return false
  }
}

export class WebSocketBridge implements BridgeTransport {
  private httpServer: http.Server | null = null
  private wss: WebSocketServer | null = null
  private extensionSocket: WebSocket | null = null
  private pendingRequests = new Map<string, PendingRequest>()
  private serializedTail: Promise<void> = Promise.resolve()
  private _connected = false
  private _listening = false
  private readonly sessionToken?: string
  private readonly port: number
  private readonly bindHost: string
  private readonly allowedOrigins?: readonly string[]
  private readonly noListen: boolean
  private _authenticated = false
  private _legacyMode = false
  private _clientMetadata: ClientMetadata | null = null
  private helloTimeout: ReturnType<typeof setTimeout> | null = null
  private serverVersion = '1.6.1'
  private lastHandshakeFailure: LastHandshakeFailure = { code: null, message: null }
  private lastDisconnectFailure: LastDisconnectFailure = { closeCode: null, reason: null }

  constructor(options: BridgeOptions = {}) {
    this.sessionToken = options.sessionToken || undefined
    this.port = options.port ?? DEFAULT_WS_PORT
    this.bindHost = options.host ?? process.env.SMARTCLIP_MCP_WS_BIND_HOST ?? WS_CONNECT_HOST
    this.allowedOrigins = options.allowedOrigins ?? parseAllowedOriginsEnv(process.env.SMARTCLIP_MCP_ALLOWED_ORIGINS)
    this.noListen = Boolean(options.noListen)

    if (this.noListen) {
      this.ensureWss()
    }

    void this.loadVersion()
  }

  private async loadVersion(): Promise<void> {
    try {
      const packageJsonPath = new URL('../../package.json', import.meta.url)
      const content = await readFile(packageJsonPath, 'utf-8')
      const pkg = JSON.parse(content) as { version?: string }
      if (pkg.version)
        this.serverVersion = pkg.version
    }
    catch {
      // 保留默认版本
    }
  }

  private ensureWss(): WebSocketServer {
    if (!this.wss) {
      this.wss = new WebSocketServer({ noServer: true })
      this.wss.on('connection', (ws) => {
        this.attachConnection(ws)
      })
    }
    return this.wss
  }

  async connect(): Promise<void> {
    if (this.noListen) {
      this.ensureWss()
      this._listening = true
      return
    }

    if (this.httpServer)
      return

    const wss = this.ensureWss()

    await new Promise<void>((resolve, reject) => {
      const server = http.createServer((_req, res) => {
        res.writeHead(426, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('WebSocket upgrade required')
      })

      server.on('upgrade', (req, socket, head) => {
        const pathname = this.extractPathname(req.url)
        if (pathname === '/' || pathname === '/ws') {
          this.handleUpgrade(req, socket, head)
          return
        }
        socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
        socket.destroy()
      })

      server.on('error', (err) => {
        process.stderr.write(`[smartclip-mcp] WebSocket server error: ${err.message}\n`)
        if (!this._listening) {
          const friendly = isErrnoException(err) && err.code === 'EADDRINUSE'
            ? `端口 ${this.port} 已被占用。请关闭其他 smartclip-mcp 实例后重试。`
            : err.message
          this.httpServer = null
          wss.close()
          this.wss = null
          reject(new Error(friendly))
        }
      })

      server.listen(this.port, this.bindHost, () => {
        this.httpServer = server
        this._listening = true
        process.stderr.write(`[smartclip-mcp] WebSocket server listening on ws://${WS_CONNECT_HOST}:${this.actualPort} (bind: ${this.bindHost})\n`)
        resolve()
      })
    })
  }

  private extractPathname(rawUrl: string | undefined): string {
    if (!rawUrl)
      return '/'
    try {
      return new URL(rawUrl, 'http://127.0.0.1').pathname
    }
    catch {
      return '/'
    }
  }

  /**
   * 处理 WebSocket Upgrade 请求。供自建 httpServer 与外部 HubServer 共用。
   */
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const origin = req.headers.origin
    if (!isOriginAllowed(origin, this.allowedOrigins)) {
      const message = `Rejected WebSocket origin: ${origin ?? 'unknown'}`
      this.lastHandshakeFailure = {
        code: BridgeErrorCode.AUTH_FAILED,
        message,
      }
      process.stderr.write(`[smartclip-mcp] ${message}\n`)
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }

    const wss = this.ensureWss()
    this._listening = true
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  }

  attachTestConnection(ws: WebSocket): void {
    this.attachConnection(ws)
  }

  private clearHelloTimeout(): void {
    if (this.helloTimeout) {
      clearTimeout(this.helloTimeout)
      this.helloTimeout = null
    }
  }

  private attachConnection(ws: WebSocket): void {
    if (this.extensionSocket && this.extensionSocket !== ws) {
      process.stderr.write('[smartclip-mcp] New connection replacing previous extension\n')
      this.clearHelloTimeout()
      this.rejectAllPending(new Error('Connection replaced by new extension'))
      this.extensionSocket.close()
    }

    process.stderr.write('[smartclip-mcp] Chrome extension connected\n')
    this.extensionSocket = ws
    this._connected = true
    this._authenticated = false
    this._legacyMode = false
    this._clientMetadata = null
    this.lastHandshakeFailure = { code: null, message: null }
    this.lastDisconnectFailure = { closeCode: null, reason: null }

    // 设置 hello handshake timeout
    this.helloTimeout = setTimeout(() => {
      if (!this._authenticated && this.extensionSocket === ws) {
        this.helloTimeout = null
        if (this.sessionToken) {
          const message = 'Handshake timeout: hello with sessionToken is required'
          process.stderr.write(`[smartclip-mcp] ${message}\n`)
          this.sendBridgeError(BridgeErrorCode.HANDSHAKE_TIMEOUT, message)
          return
        }

        process.stderr.write('[smartclip-mcp] No hello received within 5s, entering legacy mode\n')
        this._legacyMode = true
        this.lastHandshakeFailure = {
          code: BridgeErrorCode.HANDSHAKE_TIMEOUT,
          message: 'No hello received within timeout, fell back to legacy mode',
        }
      }
    }, HELLO_TIMEOUT_MS)

    ws.on('message', (data) => {
      const raw = data.toString()
      if (raw === 'keepalive')
        return

      this.handleIncomingMessage(raw)
    })

    ws.on('close', (code, reasonBuffer) => {
      const reason = reasonBuffer.toString() || null
      process.stderr.write(`[smartclip-mcp] Chrome extension disconnected (code=${code}${reason ? `, reason=${reason}` : ''})\n`)
      if (this.extensionSocket === ws) {
        this.clearHelloTimeout()
        this.lastDisconnectFailure = {
          closeCode: code,
          reason,
        }
        this.extensionSocket = null
        this._connected = false
        this._authenticated = false
        this._legacyMode = false
        this._clientMetadata = null
        this.rejectAllPending(new Error('Chrome extension disconnected'))
      }
    })

    ws.on('error', (err) => {
      process.stderr.write(`[smartclip-mcp] WebSocket error: ${err.message}\n`)
      if (this.extensionSocket === ws) {
        this.clearHelloTimeout()
        this.extensionSocket = null
        this._connected = false
        this._authenticated = false
        this._legacyMode = false
        this._clientMetadata = null
        this.rejectAllPending(err)
      }
    })
  }

  private handleIncomingMessage(raw: string): void {
    try {
      const message = JSON.parse(raw) as { type?: string }

      if (message?.type === 'hello') {
        this.handleHello(message)
        return
      }

      if (!this._authenticated) {
        if (this.sessionToken) {
          // 配置了 sessionToken 时严禁绕过认证降级到 legacyMode
          this.clearHelloTimeout()
          this.sendBridgeError(BridgeErrorCode.AUTH_FAILED, 'Authentication required: send hello handshake first')
          return
        }

        const actionResult = actionEnvelopeSchema.safeParse(message)
        if (actionResult.success) {
          this._legacyMode = true
          process.stderr.write('[smartclip-mcp] Deprecated legacy extension connection detected; please upgrade the extension to use hello handshake.\n')
        }
      }

      this.handleResponse(message)
    }
    catch {
      process.stderr.write('[smartclip-mcp] Failed to parse message from extension\n')
    }
  }

  private handleHello(message: unknown): void {
    const result = helloRequestSchema.safeParse(message)
    if (!result.success) {
      this.clearHelloTimeout()
      this.sendBridgeError(BridgeErrorCode.AUTH_FAILED, 'Invalid hello handshake payload')
      return
    }

    const hello = result.data
    if (hello.protocolVersion !== BRIDGE_PROTOCOL_VERSION) {
      this.clearHelloTimeout()
      this.sendBridgeError(BridgeErrorCode.PROTOCOL_MISMATCH, `Unsupported protocol version: ${hello.protocolVersion}`)
      return
    }

    if (this.sessionToken && hello.sessionToken !== this.sessionToken) {
      this.clearHelloTimeout()
      this.sendBridgeError(BridgeErrorCode.AUTH_FAILED, 'Invalid session token')
      return
    }

    this.clearHelloTimeout()

    this._authenticated = true
    this._legacyMode = false
    this._clientMetadata = this.toClientMetadata(hello)
    this.extensionSocket?.send(JSON.stringify({
      id: hello.id,
      type: 'hello_ack',
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      serverName: 'smartclip-mcp',
      serverVersion: this.serverVersion,
      accepted: true,
      capabilities: {},
      legacyMode: false,
    }))
  }

  private toClientMetadata(hello: HelloRequest): ClientMetadata {
    return {
      protocolVersion: hello.protocolVersion,
      clientName: hello.clientName,
      clientVersion: hello.clientVersion,
      capabilities: hello.capabilities || {},
    }
  }

  private sendBridgeError(code: BridgeErrorCode, error: string): void {
    const payload = bridgeErrorSchema.parse({
      success: false,
      code,
      error,
    })
    this.lastHandshakeFailure = { code, message: error }
    this.extensionSocket?.send(JSON.stringify(payload))
    this.extensionSocket?.close(bridgeErrorToCloseCode(code), error.slice(0, 120))
  }

  private handleResponse(response: unknown): void {
    const result = bridgeResponseSchema.safeParse(response)
    if (!result.success) {
      process.stderr.write('[smartclip-mcp] Invalid response schema from extension\n')
      return
    }

    const validatedResponse = result.data
    const { id } = validatedResponse
    if (!id)
      return

    const pending = this.pendingRequests.get(id)
    if (!pending)
      return

    this.pendingRequests.delete(id)
    clearTimeout(pending.timer)
    pending.resolve(validatedResponse)
  }

  /**
   * 等待 Chrome 扩展连接。
   */
  private async waitForExtension(maxWaitMs = DEFAULT_WAIT_FOR_EXTENSION_MS): Promise<void> {
    if (this._connected && this.extensionSocket)
      return

    if (maxWaitMs <= 0) {
      throw new Error(this.formatNotConnectedError(0))
    }

    process.stderr.write('[smartclip-mcp] Waiting for Chrome extension to connect...\n')

    const checkIntervalMs = 200
    const startTime = Date.now()

    while (Date.now() - startTime < maxWaitMs) {
      if (this._connected && this.extensionSocket) {
        return
      }
      await new Promise(r => setTimeout(r, checkIntervalMs))
    }

    throw new Error(this.formatNotConnectedError(Math.round(maxWaitMs / 1000)))
  }

  private formatNotConnectedError(waitedSec: number): string {
    const extraDiagnostics = [
      this.lastHandshakeFailure.code
        ? `最近一次握手失败: ${this.lastHandshakeFailure.code}${this.lastHandshakeFailure.message ? ` - ${this.lastHandshakeFailure.message}` : ''}`
        : null,
      this.lastDisconnectFailure.closeCode
        ? `最近一次断开: close code ${this.lastDisconnectFailure.closeCode}${this.lastDisconnectFailure.reason ? ` - ${this.lastDisconnectFailure.reason}` : ''}`
        : null,
    ].filter(Boolean).join('\n')

    return (
      `Chrome 扩展未连接（等待 ${waitedSec} 秒超时）。\n`
      + `MCP WebSocket: ws://${WS_CONNECT_HOST}:${this.actualPort}\n`
      + (extraDiagnostics ? `${extraDiagnostics}\n` : '')
      + '请确保：\n'
      + '1. Chrome 浏览器已打开\n'
      + '2. SmartClip 扩展已安装并启用\n'
      + '3. 在 chrome://extensions 中刷新 SmartClip 扩展（确保后台 Service Worker 运行）\n'
      + '4. 如果扩展诊断面板提示 token 校验失败，请同步扩展 Session Token 与 SMARTCLIP_MCP_SESSION_TOKEN\n'
      + '\n'
      + '如果你在 Docker/WSL/远程环境里运行 smartclip-mcp：\n'
      + `- 需要把端口 ${this.actualPort} 映射到宿主机，并设置 SMARTCLIP_MCP_WS_BIND_HOST=0.0.0.0`
    )
  }

  private enqueueExclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.serializedTail.then(task, task)
    this.serializedTail = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  async send(action: BridgeAction, data?: unknown, options: SendOptions = {}): Promise<BridgeResponse> {
    if (SERIALIZED_BRIDGE_ACTIONS.has(action)) {
      return this.enqueueExclusive(() => this.sendImmediate(action, data, options))
    }
    return this.sendImmediate(action, data, options)
  }

  private async sendImmediate(action: BridgeAction, data: unknown, options: SendOptions): Promise<BridgeResponse> {
    const waitMs = options.waitForExtensionMs ?? (action === BridgeAction.GET_STATUS ? 3000 : DEFAULT_WAIT_FOR_EXTENSION_MS)
    await this.waitForExtension(waitMs)

    if (!this._authenticated && !this._legacyMode) {
      const detail = this.lastHandshakeFailure.code
        ? `${this.lastHandshakeFailure.code}${this.lastHandshakeFailure.message ? ` - ${this.lastHandshakeFailure.message}` : ''}`
        : 'unknown reason'
      throw new Error(`Chrome extension connected but handshake not completed: ${detail}`)
    }

    const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
    const id = randomUUID()
    const message = JSON.stringify({ id, action, data })

    return new Promise<BridgeResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`Request timeout: ${action} (${requestTimeoutMs}ms)`))
      }, requestTimeoutMs)

      this.pendingRequests.set(id, { resolve, reject, timer })

      try {
        this.extensionSocket!.send(message)
      }
      catch (err) {
        this.pendingRequests.delete(id)
        clearTimeout(timer)
        reject(err)
      }
    })
  }

  get actualPort(): number {
    const addr = this.httpServer?.address()
    if (addr && typeof addr === 'object')
      return addr.port
    return this.port
  }

  get isConnected(): boolean {
    return this._connected
  }

  get isAuthenticated(): boolean {
    return this._authenticated
  }

  get isLegacyMode(): boolean {
    return this._legacyMode
  }

  get isListening(): boolean {
    return this._listening
  }

  get clientMetadata(): ClientMetadata | null {
    return this._clientMetadata
  }

  /** @internal For testing only */
  get handshakeFailure(): LastHandshakeFailure {
    return this.lastHandshakeFailure
  }

  getHealthSnapshot(portOverride?: number): BridgeHealthSnapshot {
    return {
      ok: this._listening && this._connected && (this._authenticated || this._legacyMode),
      serverListening: this._listening,
      port: portOverride ?? this.actualPort,
      bindHost: this.bindHost,
      extensionConnected: this._connected,
      authenticated: this._authenticated,
      legacyMode: this._legacyMode,
      tokenRequired: Boolean(this.sessionToken),
      clientMetadata: this._clientMetadata,
      lastHandshakeFailure: this.lastHandshakeFailure,
      lastDisconnectFailure: this.lastDisconnectFailure,
      pendingRequestCount: this.pendingRequests.size,
      serverVersion: this.serverVersion,
    }
  }

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer)
      pending.reject(error)
      this.pendingRequests.delete(id)
    }
  }

  async disconnect(): Promise<void> {
    this.clearHelloTimeout()
    this._connected = false
    this._listening = false
    this._authenticated = false
    this._legacyMode = false
    this._clientMetadata = null
    this.lastHandshakeFailure = { code: null, message: null }
    this.lastDisconnectFailure = { closeCode: null, reason: null }
    this.rejectAllPending(new Error('Bridge disconnected'))
    if (this.extensionSocket) {
      this.extensionSocket.close()
      this.extensionSocket = null
    }
    if (this.wss) {
      this.wss.close()
      this.wss = null
    }
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve())
      })
      this.httpServer = null
    }
  }
}
