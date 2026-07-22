import { BridgeErrorCode } from 'smartclip-bridge-protocol'
import { describe, expect, it } from 'vitest'
import type { WebSocketBridge } from '../../bridge/websocketBridge.js'
import { getStatus } from '../getStatus.js'

interface MockBridge {
  send: (action: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
}

function createBridge(statusOverrides: Record<string, unknown> = {}): WebSocketBridge {
  const baseStatus = {
    serverListening: true,
    extensionConnected: false,
    socketConnected: true,
    handshakeAcknowledged: false,
    connectionPhase: 'waiting-retry',
    mcpEnabled: true,
    pro: true,
    protocolVersion: '1',
    extensionVersion: '1.2.3',
    lastErrorCode: null,
    lastErrorMessage: null,
    reconnectAttempts: 0,
    nextReconnectAt: null,
    capabilities: { clipPage: true },
  }

  return {
    async send(action: string) {
      expect(action).toBe('get-status')
      return { success: true, data: { ...baseStatus, ...statusOverrides } }
    },
  } satisfies MockBridge as unknown as WebSocketBridge
}

describe('getStatus', () => {
  it('returns structured smartclip health data', async () => {
    const bridge = createBridge({
      lastErrorCode: BridgeErrorCode.MCP_SERVER_UNAVAILABLE,
      lastErrorMessage: 'offline',
      reconnectAttempts: 3,
      nextReconnectAt: 1_710_000_000_000,
    })

    const response = await getStatus(bridge)
    expect(response.structuredContent?.status.serverListening).toBe(true)
    expect(response.structuredContent?.status.extensionConnected).toBe(false)
    expect(response.structuredContent?.status.lastErrorCode).toBe(BridgeErrorCode.MCP_SERVER_UNAVAILABLE)
  })

  it('returns error content when bridge reports failure', async () => {
    const bridge = {
      async send() {
        return { success: false, error: 'connection lost' }
      },
    } satisfies MockBridge as unknown as WebSocketBridge

    const response = await getStatus(bridge)
    expect(response.isError).toBe(true)
    expect(response.content[0].text).toContain('获取状态失败')
  })

  it('renders legacy premium:true status as Pro (backward compat)', async () => {
    // 旧版扩展发送 premium 字段（无 pro），应归一化并渲染为 Pro
    const legacyStatus = {
      serverListening: true,
      extensionConnected: false,
      socketConnected: true,
      mcpEnabled: true,
      premium: true,
      protocolVersion: '1',
      extensionVersion: '1.2.3',
      lastErrorCode: null,
      lastErrorMessage: null,
      reconnectAttempts: 0,
      nextReconnectAt: null,
      capabilities: { clipPage: true },
    }
    const bridge = {
      async send() {
        return { success: true, data: legacyStatus }
      },
    } satisfies MockBridge as unknown as WebSocketBridge

    const response = await getStatus(bridge)
    // 结构化输出归一化为 pro（格式无关，兼容详细/精简两种渲染文案）
    expect(response.structuredContent?.status.pro).toBe(true)
    expect(response.content[0].text).not.toContain('Premium')
  })

  describe('renderSuggestion', () => {
    it.each([
      [BridgeErrorCode.MCP_SERVER_UNAVAILABLE, '18365 端口'],
      [BridgeErrorCode.AUTH_FAILED, 'Session Token'],
      [BridgeErrorCode.PROTOCOL_MISMATCH, '同一版本线'],
      [BridgeErrorCode.HANDSHAKE_TIMEOUT, '未完成握手'],
      [BridgeErrorCode.PREMIUM_REQUIRED, 'Pro'],
    ])('includes suggestion for %s', async (errorCode, expectedHint) => {
      const bridge = createBridge({ lastErrorCode: errorCode })
      const response = await getStatus(bridge)
      expect(response.content[0].text).toContain('建议')
      expect(response.content[0].text).toContain(expectedHint)
    })

    it('omits suggestion when no known error code', async () => {
      const bridge = createBridge({ lastErrorCode: null })
      const response = await getStatus(bridge)
      expect(response.content[0].text).not.toContain('建议')
    })
  })
})
