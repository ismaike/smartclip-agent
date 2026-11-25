import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BRIDGE_PROTOCOL_VERSION, BridgeAction, BridgeCloseCode, BridgeErrorCode } from 'smartclip-bridge-protocol'
import type { WebSocket } from 'ws'
import { WebSocketBridge, isOriginAllowed } from '../websocketBridge.js'

/**
 * Minimal WebSocket interface for testing
 */
interface TestWebSocket {
  on: (event: string, handler: (value: unknown) => void) => void
  send: (payload: string) => void
  close: (code?: number, reason?: string) => void
}

class MockSocket implements TestWebSocket {
  handlers: Record<string, ((value: unknown) => void)[]> = {}
  sent: string[] = []
  closedWith: { code?: number, reason?: string } | null = null

  on(event: string, handler: (value: unknown) => void): void {
    this.handlers[event] ??= []
    this.handlers[event].push(handler)
  }

  send(payload: string): void {
    this.sent.push(payload)
  }

  emitMessage(payload: unknown): void {
    for (const handler of this.handlers.message || []) {
      handler(Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)))
    }
  }

  close(code?: number, reason?: string): void {
    this.closedWith = { code, reason }
  }
}

describe('isOriginAllowed', () => {
  it('allows missing Origin header (Node CLI / non-browser client)', () => {
    expect(isOriginAllowed(undefined)).toBe(true)
  })

  it('allows browser extension origins by default', () => {
    expect(isOriginAllowed('chrome-extension://abcdefghijklmnop')).toBe(true)
    expect(isOriginAllowed('moz-extension://1234-5678')).toBe(true)
    expect(isOriginAllowed('safari-web-extension://uuid-here')).toBe(true)
  })

  it('rejects webpage, null, and malformed origins by default', () => {
    expect(isOriginAllowed('https://evil.example.com')).toBe(false)
    expect(isOriginAllowed('http://127.0.0.1:3000')).toBe(false)
    expect(isOriginAllowed('null')).toBe(false)
    expect(isOriginAllowed('file://')).toBe(false)
    expect(isOriginAllowed('chrome-extension://')).toBe(false)
  })

  it('enforces explicit allowedOrigins whitelist when configured', () => {
    const allowed = ['chrome-extension://exact-id']
    expect(isOriginAllowed('chrome-extension://exact-id', allowed)).toBe(true)
    expect(isOriginAllowed('chrome-extension://other-id', allowed)).toBe(false)
    expect(isOriginAllowed('https://evil.example.com', allowed)).toBe(false)
  })
})

describe('WebSocketBridge handshake', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('accepts a valid hello handshake and stores client metadata', async () => {
    const bridge = new WebSocketBridge({ sessionToken: 'expected-token' })
    const socket = new MockSocket()

    bridge.attachTestConnection(socket satisfies TestWebSocket as unknown as WebSocket)
    socket.emitMessage({
      type: 'hello',
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      sessionToken: 'expected-token',
      clientName: 'smartclip-extension',
      clientVersion: '1.2.3',
      capabilities: { clipPage: true },
    })

    expect(bridge.isAuthenticated).toBe(true)
    expect(bridge.isLegacyMode).toBe(false)
    expect(bridge.clientMetadata).toMatchObject({
      clientName: 'smartclip-extension',
      clientVersion: '1.2.3',
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      capabilities: { clipPage: true },
    })

    const ack = JSON.parse(socket.sent[0])
    expect(ack.type).toBe('hello_ack')
    expect(ack.accepted).toBe(true)
  })

  it('rejects connections with wrong token', async () => {
    const bridge = new WebSocketBridge({ sessionToken: 'expected-token' })
    const socket = new MockSocket()

    bridge.attachTestConnection(socket satisfies TestWebSocket as unknown as WebSocket)
    socket.emitMessage({
      type: 'hello',
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      sessionToken: 'wrong-token',
      clientName: 'smartclip-extension',
      clientVersion: '1.2.3',
      capabilities: {},
    })

    const error = JSON.parse(socket.sent[0])
    expect(error.success).toBe(false)
    expect(error.code).toBe(BridgeErrorCode.AUTH_FAILED)
    expect(bridge.isAuthenticated).toBe(false)
    expect(socket.closedWith?.code).toBe(BridgeCloseCode.HANDSHAKE_FAILED)
  })

  it('rejects protocol mismatches', async () => {
    const bridge = new WebSocketBridge({ sessionToken: 'expected-token' })
    const socket = new MockSocket()

    bridge.attachTestConnection(socket satisfies TestWebSocket as unknown as WebSocket)
    socket.emitMessage({
      type: 'hello',
      protocolVersion: '999',
      sessionToken: 'expected-token',
      clientName: 'smartclip-extension',
      clientVersion: '1.2.3',
      capabilities: {},
    })

    const error = JSON.parse(socket.sent[0])
    expect(error.code).toBe(BridgeErrorCode.PROTOCOL_MISMATCH)
    expect(socket.closedWith?.code).toBe(BridgeCloseCode.PROTOCOL_MISMATCH)
  })

  it('rejects non-hello action payloads when sessionToken is configured (prevents auth bypass)', async () => {
    const bridge = new WebSocketBridge({ sessionToken: 'expected-token' })
    const socket = new MockSocket()

    bridge.attachTestConnection(socket satisfies TestWebSocket as unknown as WebSocket)
    socket.emitMessage({ id: 'req-1', action: BridgeAction.LIST_TABS, data: {} })

    expect(bridge.isLegacyMode).toBe(false)
    expect(bridge.isAuthenticated).toBe(false)
    const error = JSON.parse(socket.sent[0])
    expect(error.code).toBe(BridgeErrorCode.AUTH_FAILED)
    expect(socket.closedWith?.code).toBe(BridgeCloseCode.HANDSHAKE_FAILED)
  })

  it('closes connection on hello timeout when sessionToken is configured (prevents legacy downgrade)', async () => {
    vi.useFakeTimers()
    const bridge = new WebSocketBridge({ sessionToken: 'expected-token' })
    const socket = new MockSocket()

    bridge.attachTestConnection(socket satisfies TestWebSocket as unknown as WebSocket)
    vi.advanceTimersByTime(5000)

    expect(bridge.isLegacyMode).toBe(false)
    expect(bridge.isAuthenticated).toBe(false)
    expect(bridge.handshakeFailure.code).toBe(BridgeErrorCode.HANDSHAKE_TIMEOUT)
    const error = JSON.parse(socket.sent[0])
    expect(error.code).toBe(BridgeErrorCode.HANDSHAKE_TIMEOUT)
    expect(socket.closedWith?.code).toBe(BridgeCloseCode.HANDSHAKE_FAILED)

    vi.useRealTimers()
  })

  it('enters legacy mode when no sessionToken is configured and first message is an action payload', async () => {
    const bridge = new WebSocketBridge()
    const socket = new MockSocket()
    const warnSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    bridge.attachTestConnection(socket satisfies TestWebSocket as unknown as WebSocket)
    socket.emitMessage({ id: 'req-1', action: BridgeAction.LIST_TABS, data: {} })

    expect(bridge.isLegacyMode).toBe(true)
    expect(bridge.isAuthenticated).toBe(false)
    expect(warnSpy).toHaveBeenCalled()
  })

  it('enters legacy mode and records HANDSHAKE_TIMEOUT when no sessionToken is configured', async () => {
    vi.useFakeTimers()
    const bridge = new WebSocketBridge()
    const socket = new MockSocket()
    const warnSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    bridge.attachTestConnection(socket satisfies TestWebSocket as unknown as WebSocket)
    vi.advanceTimersByTime(5000)

    expect(bridge.isLegacyMode).toBe(true)
    expect(bridge.isAuthenticated).toBe(false)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('No hello received within 5s'))
    expect(bridge.handshakeFailure.code).toBe(BridgeErrorCode.HANDSHAKE_TIMEOUT)
    expect(bridge.handshakeFailure.message).toContain('fell back to legacy mode')

    vi.useRealTimers()
  })

  it('fails fast (~3s) on GET_STATUS when extension is disconnected', async () => {
    vi.useFakeTimers()
    const bridge = new WebSocketBridge()

    const sendPromise = bridge.send(BridgeAction.GET_STATUS).catch((err: unknown) => err)
    await vi.advanceTimersByTimeAsync(3100)

    const error = await sendPromise
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('等待 3 秒超时')

    vi.useRealTimers()
  })
})
