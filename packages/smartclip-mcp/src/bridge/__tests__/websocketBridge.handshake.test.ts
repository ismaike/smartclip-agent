import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BRIDGE_PROTOCOL_VERSION, BridgeAction, BridgeErrorCode } from 'smartclip-bridge-protocol'
import { WebSocketBridge } from '../websocketBridge.js'

class MockSocket {
  handlers: Record<string, ((value: any) => void)[]> = {}
  sent: string[] = []

  on(event: string, handler: (value: any) => void) {
    this.handlers[event] ??= []
    this.handlers[event].push(handler)
  }

  send(payload: string) {
    this.sent.push(payload)
  }

  emitMessage(payload: unknown) {
    for (const handler of this.handlers.message || []) {
      handler(Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)))
    }
  }

  close() {}
}

describe('WebSocketBridge handshake', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('accepts a valid hello handshake and stores client metadata', async () => {
    const bridge = new WebSocketBridge({ sessionToken: 'expected-token' })
    const socket = new MockSocket()

    bridge.attachTestConnection(socket as any)
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

    bridge.attachTestConnection(socket as any)
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
  })

  it('rejects protocol mismatches', async () => {
    const bridge = new WebSocketBridge({ sessionToken: 'expected-token' })
    const socket = new MockSocket()

    bridge.attachTestConnection(socket as any)
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
  })

  it('enters legacy mode when first message is an action payload', async () => {
    const bridge = new WebSocketBridge({ sessionToken: 'expected-token' })
    const socket = new MockSocket()
    const warnSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    bridge.attachTestConnection(socket as any)
    socket.emitMessage({ id: 'req-1', action: BridgeAction.LIST_TABS, data: {} })

    expect(bridge.isLegacyMode).toBe(true)
    expect(bridge.isAuthenticated).toBe(false)
    expect(warnSpy).toHaveBeenCalled()
  })
})
