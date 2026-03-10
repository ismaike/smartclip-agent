#!/usr/bin/env node
/**
 * SmartClip MCP Native Messaging Host
 *
 * 此进程可以由 Chrome 浏览器通过 Native Messaging 启动，
 * 也可以由 MCP Server 作为子进程启动。
 *
 * 它监听一个 IPC socket（Unix Domain Socket / Named Pipe），
 * 使 MCP Server 能够通过 IPC 发送请求。
 *
 * 当 Chrome 扩展通过 connectNative 连接时，stdin/stdout 用于与扩展通信。
 * 当 stdin 关闭（Chrome 断开）时，进程不退出，继续保持 IPC socket 运行，
 * 等待 Chrome 重新连接（通过新的 connectNative 调用启动新进程，
 * 新进程会接管 IPC socket）。
 *
 * 数据流（Chrome 已连接时）：
 * MCP Server --IPC socket--> 此进程 --stdout--> Chrome --port.onMessage--> 扩展
 * 扩展 --port.postMessage--> Chrome --stdin--> 此进程 --IPC socket--> MCP Server
 *
 * 数据流（Chrome 未连接时）：
 * MCP Server --IPC socket--> 此进程 --返回错误--> MCP Server
 *
 * stdin/stdout 使用 Chrome Native Messaging 的长度前缀二进制协议：
 * - 4 字节小端序长度头 + JSON UTF-8 消息体
 */

import { type Server, type Socket, createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { existsSync, unlinkSync } from 'node:fs'

const SOCKET_PATH = process.platform === 'win32'
  ? '\\\\.\\pipe\\smartclip-mcp'
  : join(tmpdir(), 'smartclip-mcp.sock')

// Chrome 连接是否可用
let chromeConnected = false

// 存储等待扩展响应的回调（按请求 ID）
const pendingResponses = new Map<string, (response: any) => void>()

let ipcServer: Server | null = null
let ipcClient: Socket | null = null

// ─── Native Messaging 协议（stdin/stdout） ───

function writeToExtension(msg: any): void {
  if (!chromeConnected)
    return
  try {
    const json = JSON.stringify(msg)
    const buf = Buffer.from(json, 'utf-8')
    const header = Buffer.alloc(4)
    header.writeUInt32LE(buf.length, 0)
    process.stdout.write(header)
    process.stdout.write(buf)
  }
  catch (e) {
    process.stderr.write(`[native-host] Failed to write to stdout: ${e}\n`)
    chromeConnected = false
  }
}

function startStdinReader(): void {
  let buffer = Buffer.alloc(0)

  process.stdin.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk])

    while (buffer.length >= 4) {
      const messageLength = buffer.readUInt32LE(0)

      if (buffer.length < 4 + messageLength) {
        break
      }

      const messageData = buffer.subarray(4, 4 + messageLength)
      buffer = buffer.subarray(4 + messageLength)

      try {
        const response = JSON.parse(messageData.toString('utf-8'))
        handleExtensionResponse(response)
      }
      catch (e) {
        process.stderr.write(`[native-host] Failed to parse stdin message: ${e}\n`)
      }
    }
  })

  process.stdin.on('end', () => {
    process.stderr.write('[native-host] stdin closed (Chrome disconnected)\n')
    chromeConnected = false
    rejectAllPending('Chrome extension disconnected')
  })

  process.stdin.on('error', (err) => {
    process.stderr.write(`[native-host] stdin error: ${err.message}\n`)
    chromeConnected = false
    rejectAllPending('Chrome extension connection error')
  })
}

function handleExtensionResponse(response: any): void {
  const { id } = response
  if (!id) {
    process.stderr.write(`[native-host] Response without id: ${JSON.stringify(response).substring(0, 200)}\n`)
    return
  }

  const callback = pendingResponses.get(id)
  if (callback) {
    pendingResponses.delete(id)
    callback(response)
  }
  else {
    process.stderr.write(`[native-host] No pending request for id: ${id}\n`)
  }
}

function rejectAllPending(reason: string): void {
  for (const [id, callback] of pendingResponses) {
    callback({ id, success: false, error: reason })
  }
  pendingResponses.clear()
}

// ─── IPC Server（与 MCP Server 通信） ───

function startIpcServer(): void {
  if (process.platform !== 'win32' && existsSync(SOCKET_PATH)) {
    try { unlinkSync(SOCKET_PATH) }
    catch { /* ignore */ }
  }

  ipcServer = createServer((socket) => {
    ipcClient = socket
    process.stderr.write('[native-host] MCP Server connected via IPC\n')

    let buffer = ''

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf-8')

      while (true) {
        const newlineIdx = buffer.indexOf('\n')
        if (newlineIdx === -1)
          break

        const line = buffer.substring(0, newlineIdx).trim()
        buffer = buffer.substring(newlineIdx + 1)

        if (!line)
          continue

        try {
          const request = JSON.parse(line)
          handleMcpRequest(request, socket)
        }
        catch (e) {
          process.stderr.write(`[native-host] Failed to parse IPC message: ${e}\n`)
        }
      }
    })

    socket.on('close', () => {
      process.stderr.write('[native-host] MCP Server disconnected\n')
      ipcClient = null
    })

    socket.on('error', (err) => {
      process.stderr.write(`[native-host] IPC socket error: ${err.message}\n`)
    })
  })

  ipcServer.listen(SOCKET_PATH, () => {
    process.stderr.write(`[native-host] IPC server listening on ${SOCKET_PATH}\n`)
  })

  ipcServer.on('error', (err) => {
    process.stderr.write(`[native-host] IPC server error: ${err.message}\n`)
  })
}

function handleMcpRequest(request: any, socket: Socket): void {
  const { id } = request

  if (!chromeConnected) {
    const line = `${JSON.stringify({
      id,
      success: false,
      error: 'Chrome extension not connected. Please ensure Chrome is open and SmartClip extension is enabled.',
      code: 'CHROME_NOT_CONNECTED',
    })}\n`
    try { socket.write(line) }
    catch { /* ignore */ }
    return
  }

  pendingResponses.set(id, (response) => {
    const line = `${JSON.stringify(response)}\n`
    try {
      socket.write(line)
    }
    catch (e) {
      process.stderr.write(`[native-host] Failed to send IPC response: ${e}\n`)
    }
  })

  writeToExtension(request)
}

// ─── 生命周期管理 ───

function cleanup(): void {
  rejectAllPending('Native host shutting down')

  if (ipcServer) {
    ipcServer.close()
    ipcServer = null
  }

  if (process.platform !== 'win32' && existsSync(SOCKET_PATH)) {
    try { unlinkSync(SOCKET_PATH) }
    catch { /* ignore */ }
  }

  process.exit(0)
}

process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)

// ─── 启动 ───

process.stdin.resume()

// Chrome 通过 Native Messaging 启动时，会传递 chrome-extension://<id>/ 作为参数
const launchedByChrome = process.argv.some(arg => arg.startsWith('chrome-extension://'))
chromeConnected = launchedByChrome

startIpcServer()
startStdinReader()

process.stderr.write(`[native-host] SmartClip MCP Native Host started (chrome=${chromeConnected})\n`)
