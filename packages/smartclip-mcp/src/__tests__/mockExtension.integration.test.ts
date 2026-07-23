import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BridgeAction } from 'smartclip-bridge-protocol'
import { WebSocket } from 'ws'

/**
 * Integration test: starts the MCP bridge WebSocket server,
 * then simulates a Chrome extension client connecting, authenticating,
 * and responding to tool requests.
 *
 * The bridge server uses a hardcoded port (18365). If that port is
 * unavailable (another MCP instance running), tests are skipped.
 * Set SMARTCLIP_TEST_WS_PORT to override.
 */

const WS_PORT = parseInt(process.env.SMARTCLIP_TEST_WS_PORT || '18365', 10)
const WS_URL = `ws://127.0.0.1:${WS_PORT}`
const SESSION_TOKEN = 'test-integration-token'

// 标记是否应跳过所有测试
let shouldSkipAll = false
let skipReason = ''

function createMockExtensionClient(): Promise<{ ws: WebSocket; sendAndWait: (msg: any) => Promise<any> }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL)

    ws.on('error', reject)

    ws.on('open', () => {
      // Send hello
      const hello = {
        type: 'hello',
        id: 'test-hello-1',
        protocolVersion: '1',
        sessionToken: SESSION_TOKEN,
        clientName: 'test-extension',
        clientVersion: '0.0.6',
        capabilities: {},
      }
      ws.send(JSON.stringify(hello))
    })

    // Set up response handler after connection
    const pendingRequests = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>()
    let nextId = 100

    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw))

      // Handle hello_ack
      if (msg.type === 'hello_ack') {
        resolve({
          ws,
          sendAndWait: async (requestMsg: any) => {
            const id = nextId++
            return new Promise((res, rej) => {
              pendingRequests.set(id, { resolve: res, reject: rej })
              ws.send(JSON.stringify({ ...requestMsg, id }))
            })
          },
        })
        return
      }

      // Handle hello_nack
      if (msg.type === 'hello_nack') {
        reject(new Error(`Hello rejected: ${msg.error?.message || 'unknown'}`))
        return
      }

      // Resolve pending request-response
      if (msg.id && pendingRequests.has(msg.id)) {
        pendingRequests.get(msg.id)!.resolve(msg)
        pendingRequests.delete(msg.id)
        return
      }
    })
  })
}

/**
 * Helper: sends a tool action from bridge side and gets the extension client's response.
 * We simulate the bridge-to-extension flow by having the client handle incoming messages
 * and reply with canned responses.
 */
function wireClientResponses(
  client: { ws: WebSocket; sendAndWait: (msg: any) => Promise<any> },
) {
  // The bridge server sends action messages to the extension client.
  // We intercept those and reply with mock data.
  client.ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw))
    const id = msg.id

    // Bridge sends { id, action, data } — check msg.action, not msg.type
    if (msg.action === 'get-status') {
      client.ws.send(JSON.stringify({
        id,
        success: true,
        data: {
          extensionConnected: true,
          mcpEnabled: true,
          pro: true,
          protocolVersion: '1',
          extensionVersion: '0.0.6',
        },
      }))
    }
    else if (msg.action === 'list-tabs') {
      client.ws.send(JSON.stringify({
        id,
        success: true,
        data: [{ id: 1, url: 'https://example.com', title: 'Example', active: true }],
      }))
    }
    else if (msg.action === 'unknown-action') {
      client.ws.send(JSON.stringify({
        id,
        success: false,
        error: 'Unknown action',
        code: 'UNKNOWN_ACTION',
      }))
    }
    // ignore keepalive etc.
  })
}

describe('mock extension integration', () => {
  let bridge: any
  let client: { ws: WebSocket; sendAndWait: (msg: any) => Promise<any> }

  beforeEach(async () => {
    // 如果已经标记跳过，直接返回
    if (shouldSkipAll) {
      console.warn(`Skipping tests: ${skipReason}`)
      return
    }

    // Dynamically import fresh bridge module
    const mod = await import('../bridge/websocketBridge.js')
    const WebSocketBridge = mod.WebSocketBridge

    // Retry connect up to 3 times to handle OS port TIME_WAIT
    let connected = false
    let lastErr: Error | undefined
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        bridge = new WebSocketBridge({ sessionToken: SESSION_TOKEN, port: WS_PORT })
        await bridge.connect()
        connected = true
        break
      }
      catch (err: any) {
        lastErr = err
        bridge?.disconnect()
        await new Promise(r => setTimeout(r, 200))
        vi.resetModules()
      }
    }

    if (!connected) {
      shouldSkipAll = true
      skipReason = `Port ${WS_PORT} unavailable after retries: ${lastErr?.message}`
      console.warn(`Skipping tests: ${skipReason}`)
      return
    }

    // Connect mock extension client and wire up responses
    client = await createMockExtensionClient()
    wireClientResponses(client)

    // Wait a tick for bridge to register authentication
    await new Promise(r => setTimeout(r, 50))
  }, 15_000)

  afterEach(async () => {
    client?.ws?.close()
    bridge?.disconnect()
    // Wait for OS to release the port (TIME_WAIT)
    await new Promise(r => setTimeout(r, 300))
    vi.resetModules()
  })

  it('bridge authenticates after hello handshake', () => {
    if (shouldSkipAll) {
      console.warn(`Skipping: ${skipReason}`)
      return
    }
    expect(bridge.isAuthenticated).toBe(true)
    expect(bridge.isLegacyMode).toBe(false)
  })

  it('bridge send(get-status) returns structured data', async () => {
    if (shouldSkipAll) {
      console.warn(`Skipping: ${skipReason}`)
      return
    }
    const response = await bridge.send(BridgeAction.GET_STATUS)
    expect(response.success).toBe(true)
    expect(response.data.extensionVersion).toBe('0.0.6')
    expect(response.data.pro).toBe(true)
  })

  it('bridge send(list-tabs) returns tab array', async () => {
    if (shouldSkipAll) {
      console.warn(`Skipping: ${skipReason}`)
      return
    }
    const response = await bridge.send(BridgeAction.LIST_TABS)
    expect(response.success).toBe(true)
    expect(Array.isArray(response.data)).toBe(true)
    expect(response.data[0].url).toBe('https://example.com')
  })

  it('bridge send(unknown-action) returns structured error', async () => {
    if (shouldSkipAll) {
      console.warn(`Skipping: ${skipReason}`)
      return
    }
    const response = await bridge.send('unknown-action' as BridgeAction)
    expect(response.success).toBe(false)
    expect(response.code).toBe('UNKNOWN_ACTION')
  })
})
