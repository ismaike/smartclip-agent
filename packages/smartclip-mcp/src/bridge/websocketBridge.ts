/**
 * WebSocket Bridge
 *
 * MCP Server 启动一个本地 WebSocket server，Chrome 扩展作为客户端连接。
 * 完全替代之前的 Native Messaging + IPC socket 方案，解决了：
 * - Service Worker 休眠导致 Native Host 退出的问题
 * - 需要注册 Native Messaging Host 的复杂安装步骤
 *
 * 通信链路：
 * Claude Code <--stdio/MCP--> MCP Server (含 WS server) <--WebSocket--> Chrome Extension Background
 */

import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import {
  BRIDGE_PROTOCOL_VERSION,
  BridgeErrorCode,
  bridgeErrorToCloseCode,
  actionEnvelopeSchema,
  bridgeErrorSchema,
  bridgeResponseSchema,
  helloRequestSchema,
  type HelloRequest,
  type BridgeResponse,
} from 'smartclip-bridge-protocol'
import { type WebSocket, WebSocketServer } from 'ws'

const WS_PORT = 18365
const HELLO_TIMEOUT_MS = 5000
const WS_CONNECT_HOST = '127.0.0.1'
const WS_BIND_HOST = process.env.SMARTCLIP_MCP_WS_BIND_HOST ?? WS_CONNECT_HOST
const REQUEST_TIMEOUT_MS = 60000

interface PendingRequest {
  resolve: (value: any) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface BridgeOptions {
  sessionToken?: string
  port?: number
}

interface ClientMetadata {
  protocolVersion: string
  clientName: string
  clientVersion: string
  capabilities: Record<string, boolean>
}

interface LastHandshakeFailure {
  code: BridgeErrorCode | null
  message: string | null
}

interface LastDisconnectFailure {
  closeCode: number | null
  reason: string | null
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error
    && 'code' in error
}

export class WebSocketBridge {
  private wss: WebSocketServer | null = null
  private extensionSocket: WebSocket | null = null
  private pendingRequests = new Map<string, PendingRequest>()
  private _connected = false
  private _listening = false
  private readonly sessionToken?: string
  private readonly port: number
  private _authenticated = false
  private _legacyMode = false
  private _clientMetadata: ClientMetadata | null = null
  private helloTimeout: ReturnType<typeof setTimeout> | null = null
  private serverVersion: string = '0.7.0' // Use current fallback as initial value
  private lastHandshakeFailure: LastHandshakeFailure = { code: null, message: null }
  private lastDisconnectFailure: LastDisconnectFailure = { closeCode: null, reason: null }

  constructor(options: BridgeOptions = {}) {
    this.sessionToken = options.sessionToken
    this.port = options.port ?? WS_PORT
    this.loadVersion()
  }

  private async loadVersion(): Promise<void> {
    try {
      // 读取 package.json 获取版本
      const packageJsonPath = new URL('../../package.json', import.meta.url)
      const content = await readFile(packageJsonPath, 'utf-8')
      const pkg = JSON.parse(content)
      this.serverVersion = pkg.version || '0.7.0'
    }
    catch {
      // 如果读取失败，使用默认版本
      this.serverVersion = '0.7.0'
    }
  }

  async connect(): Promise<void> {
    if (this.wss)
      return

    return await new Promise<void>((resolve, reject) => {
      this.wss = new WebSocketServer({ port: this.port, host: WS_BIND_HOST })

      this.wss.on('listening', () => {
        this._listening = true
        process.stderr.write(`[smartclip-mcp] WebSocket server listening on ws://${WS_CONNECT_HOST}:${this.port} (bind: ${WS_BIND_HOST})\n`)
        resolve()
      })

      this.wss.on('connection', (ws) => {
        this.attachConnection(ws)
      })

      this.wss.on('error', (err) => {
        process.stderr.write(`[smartclip-mcp] WebSocket server error: ${err.message}\n`)
        if (!this._listening) {
          const friendly = isErrnoException(err) && err.code === 'EADDRINUSE'
            ? `端口 ${this.port} 已被占用。请关闭其他 smartclip-mcp 实例后重试。`
            : err.message
          reject(new Error(friendly))
        }
      })
    })
  }

  attachTestConnection(ws: WebSocket): void {
    this.attachConnection(ws)
  }

  private attachConnection(ws: WebSocket): void {
    // 处理新连接替换旧连接
    if (this.extensionSocket && this.extensionSocket !== ws) {
      process.stderr.write('[smartclip-mcp] New connection replacing previous extension\n')
      // 清理旧的 hello timeout
      if (this.helloTimeout) {
        clearTimeout(this.helloTimeout)
        this.helloTimeout = null
      }
      // 拒绝所有 pending requests，避免它们 hung
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
        process.stderr.write('[smartclip-mcp] No hello received within 5s, entering legacy mode\n')
        this._legacyMode = true
        this.lastHandshakeFailure = {
          code: BridgeErrorCode.HANDSHAKE_TIMEOUT,
          message: 'No hello received within timeout, fell back to legacy mode',
        }
        this.helloTimeout = null
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
        // 清理 hello timeout
        if (this.helloTimeout) {
          clearTimeout(this.helloTimeout)
          this.helloTimeout = null
        }
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
        // 清理 hello timeout
        if (this.helloTimeout) {
          clearTimeout(this.helloTimeout)
          this.helloTimeout = null
        }
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
      const message = JSON.parse(raw)

      if (message?.type === 'hello') {
        this.handleHello(message)
        return
      }

      if (!this._authenticated) {
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
      this.sendBridgeError(BridgeErrorCode.AUTH_FAILED, 'Invalid hello handshake payload')
      return
    }

    const hello = result.data
    if (hello.protocolVersion !== BRIDGE_PROTOCOL_VERSION) {
      this.sendBridgeError(BridgeErrorCode.PROTOCOL_MISMATCH, `Unsupported protocol version: ${hello.protocolVersion}`)
      return
    }

    if (this.sessionToken && hello.sessionToken !== this.sessionToken) {
      this.sendBridgeError(BridgeErrorCode.AUTH_FAILED, 'Invalid session token')
      return
    }

    // 清理 hello timeout
    if (this.helloTimeout) {
      clearTimeout(this.helloTimeout)
      this.helloTimeout = null
    }

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
    // 验证 response schema
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
   * 扩展通过 Chrome Alarms 定期尝试重连（实际最小间隔常被限制为 1 分钟，且可能被延迟），这里多等一会儿。
   */
  private async waitForExtension(): Promise<void> {
    if (this._connected && this.extensionSocket)
      return

    process.stderr.write('[smartclip-mcp] Waiting for Chrome extension to connect...\n')

    const maxWaitMs = 90000
    const checkIntervalMs = 1000
    const startTime = Date.now()

    while (Date.now() - startTime < maxWaitMs) {
      if (this._connected && this.extensionSocket) {
        return
      }
      await new Promise(r => setTimeout(r, checkIntervalMs))
    }

    const waitedSec = Math.round(maxWaitMs / 1000)
    const extraDiagnostics = [
      this.lastHandshakeFailure.code
        ? `最近一次握手失败: ${this.lastHandshakeFailure.code}${this.lastHandshakeFailure.message ? ` - ${this.lastHandshakeFailure.message}` : ''}`
        : null,
      this.lastDisconnectFailure.closeCode
        ? `最近一次断开: close code ${this.lastDisconnectFailure.closeCode}${this.lastDisconnectFailure.reason ? ` - ${this.lastDisconnectFailure.reason}` : ''}`
        : null,
    ].filter(Boolean).join('\n')

    throw new Error(
      `Chrome 扩展未连接（等待 ${waitedSec} 秒超时）。\n`
      + `MCP WebSocket: ws://${WS_CONNECT_HOST}:${this.port}\n`
      + (extraDiagnostics ? `${extraDiagnostics}\n` : '')
      + '请确保：\n'
      + '1. Chrome 浏览器已打开\n'
      + '2. SmartClip 扩展已安装并启用\n'
      + '3. 在 chrome://extensions 中刷新 SmartClip 扩展（确保后台 Service Worker 运行）\n'
      + '4. 如果扩展诊断面板提示 token 校验失败，请同步扩展 Session Token 与 SMARTCLIP_MCP_SESSION_TOKEN\n'
      + '\n'
      + '如果你在 Docker/WSL/远程环境里运行 smartclip-mcp：\n'
      + `- 需要把端口 ${this.port} 映射到宿主机，并设置 SMARTCLIP_MCP_WS_BIND_HOST=0.0.0.0`,
    )
  }

  async send(action: string, data?: any): Promise<any> {
    await this.waitForExtension()

    if (!this._authenticated && !this._legacyMode) {
      const detail = this.lastHandshakeFailure.code
        ? `${this.lastHandshakeFailure.code}${this.lastHandshakeFailure.message ? ` - ${this.lastHandshakeFailure.message}` : ''}`
        : 'unknown reason'
      throw new Error(`Chrome extension connected but handshake not completed: ${detail}`)
    }

    const id = randomUUID()
    const message = JSON.stringify({ id, action, data })

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`Request timeout: ${action} (${REQUEST_TIMEOUT_MS}ms)`))
      }, REQUEST_TIMEOUT_MS)

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

  get isConnected(): boolean {
    return this._connected
  }

  get isAuthenticated(): boolean {
    return this._authenticated
  }

  get isLegacyMode(): boolean {
    return this._legacyMode
  }

  get clientMetadata(): ClientMetadata | null {
    return this._clientMetadata
  }

  /** @internal For testing only */
  get handshakeFailure(): { code: BridgeErrorCode | null; message: string | null } {
    return this.lastHandshakeFailure
  }

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer)
      pending.reject(error)
      this.pendingRequests.delete(id)
    }
  }

  async disconnect(): Promise<void> {
    this._connected = false
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
  }
}
