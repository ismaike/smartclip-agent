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
import { type WebSocket, WebSocketServer } from 'ws'

const WS_PORT = 18365
const WS_CONNECT_HOST = '127.0.0.1'
const WS_CONNECT_URL = `ws://${WS_CONNECT_HOST}:${WS_PORT}`
const WS_BIND_HOST = process.env.SMARTCLIP_MCP_WS_BIND_HOST ?? WS_CONNECT_HOST
const REQUEST_TIMEOUT_MS = 60000

interface PendingRequest {
  resolve: (value: any) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
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

  async connect(): Promise<void> {
    if (this.wss)
      return

    return await new Promise<void>((resolve, reject) => {
      this.wss = new WebSocketServer({ port: WS_PORT, host: WS_BIND_HOST })

      this.wss.on('listening', () => {
        this._listening = true
        process.stderr.write(`[smartclip-mcp] WebSocket server listening on ${WS_CONNECT_URL} (bind: ${WS_BIND_HOST})\n`)
        resolve()
      })

      this.wss.on('connection', (ws) => {
        process.stderr.write('[smartclip-mcp] Chrome extension connected\n')
        this.extensionSocket = ws
        this._connected = true

        ws.on('message', (data) => {
          const raw = data.toString()
          if (raw === 'keepalive')
            return

          try {
            const response = JSON.parse(raw)
            this.handleResponse(response)
          }
          catch {
            process.stderr.write(`[smartclip-mcp] Failed to parse message from extension\n`)
          }
        })

        ws.on('close', () => {
          process.stderr.write('[smartclip-mcp] Chrome extension disconnected\n')
          if (this.extensionSocket === ws) {
            this.extensionSocket = null
            this._connected = false
            this.rejectAllPending(new Error('Chrome extension disconnected'))
          }
        })

        ws.on('error', (err) => {
          process.stderr.write(`[smartclip-mcp] WebSocket error: ${err.message}\n`)
          if (this.extensionSocket === ws) {
            this.extensionSocket = null
            this._connected = false
            this.rejectAllPending(err)
          }
        })
      })

      this.wss.on('error', (err) => {
        process.stderr.write(`[smartclip-mcp] WebSocket server error: ${err.message}\n`)
        if (!this._listening) {
          const friendly = isErrnoException(err) && err.code === 'EADDRINUSE'
            ? `端口 ${WS_PORT} 已被占用。请关闭其他 smartclip-mcp 实例后重试。`
            : err.message
          reject(new Error(friendly))
        }
      })
    })
  }

  private handleResponse(response: any): void {
    const { id } = response
    if (!id)
      return

    const pending = this.pendingRequests.get(id)
    if (!pending)
      return

    this.pendingRequests.delete(id)
    clearTimeout(pending.timer)
    pending.resolve(response)
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
    throw new Error(
      `Chrome 扩展未连接（等待 ${waitedSec} 秒超时）。\n`
      + `MCP WebSocket: ${WS_CONNECT_URL}\n`
      + '请确保：\n'
      + '1. Chrome 浏览器已打开\n'
      + '2. SmartClip 扩展已安装并启用\n'
      + '3. 在 chrome://extensions 中刷新 SmartClip 扩展（确保后台 Service Worker 运行）\n'
      + '\n'
      + '如果你在 Docker/WSL/远程环境里运行 smartclip-mcp：\n'
      + `- 需要把端口 ${WS_PORT} 映射到宿主机，并设置 SMARTCLIP_MCP_WS_BIND_HOST=0.0.0.0`,
    )
  }

  async send(action: string, data?: any): Promise<any> {
    await this.waitForExtension()

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

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer)
      pending.reject(error)
      this.pendingRequests.delete(id)
    }
  }

  async disconnect(): Promise<void> {
    this._connected = false
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
