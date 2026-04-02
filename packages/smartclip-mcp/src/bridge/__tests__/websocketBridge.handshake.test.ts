import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BRIDGE_PROTOCOL_VERSION, BridgeAction, BridgeCloseCode, BridgeErrorCode } from 'smartclip-bridge-protocol'
import type { WebSocket } from 'ws'
import { WebSocketBridge } from '../websocketBridge.js'

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

  it('enters legacy mode when first message is an action payload', async () => {
    const bridge = new WebSocketBridge({ sessionToken: 'expected-token' })
    const socket = new MockSocket()
    const warnSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    bridge.attachTestConnection(socket satisfies TestWebSocket as unknown as WebSocket)
    socket.emitMessage({ id: 'req-1', action: BridgeAction.LIST_TABS, data: {} })

    expect(bridge.isLegacyMode).toBe(true)
    expect(bridge.isAuthenticated).toBe(false)
    expect(warnSpy).toHaveBeenCalled()
  })

  it('enters legacy mode and records HANDSHAKE_TIMEOUT when no hello received within 5s', async () => {
    vi.useFakeTimers()
    const bridge = new WebSocketBridge({ sessionToken: 'expected-token' })
    const socket = new MockSocket()
    const warnSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    bridge.attachTestConnection(socket satisfies TestWebSocket as unknown as WebSocket)
    // 不发送 hello，让 timeout 触发

    // 快进 5 秒
    vi.advanceTimersByTime(5000)

    expect(bridge.isLegacyMode).toBe(true)
    expect(bridge.isAuthenticated).toBe(false)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('No hello received within 5s'))
    expect(bridge.handshakeFailure.code).toBe(BridgeErrorCode.HANDSHAKE_TIMEOUT)
    expect(bridge.handshakeFailure.message).toContain('fell back to legacy mode')

    vi.useRealTimers()
  })
})
