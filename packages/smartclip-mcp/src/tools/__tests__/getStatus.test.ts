import { BridgeAction, BridgeErrorCode } from 'smartclip-bridge-protocol'
import { describe, expect, it } from 'vitest'
import type { ToolContext } from '../../tools/defineTool.js'
import getStatusTool from '../getStatus.js'

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
  clientVersion: null,
  lastCloseCode: null,
  lastCloseReason: null,
}

/** mock invoke：返回预设的归一化 get-status 结果 */
function createInvoke(statusOverrides: Record<string, unknown> = {}): ToolContext['invoke'] {
  return ((async (action: BridgeAction) => {
    expect(action).toBe(BridgeAction.GET_STATUS)
    return { ...baseStatus, ...statusOverrides }
  }) as ToolContext['invoke'])
}

describe('getStatus', () => {
  it('returns structured smartclip health data', async () => {
    const result = await getStatusTool.execute({}, {
      invoke: createInvoke({
        lastErrorCode: BridgeErrorCode.MCP_SERVER_UNAVAILABLE,
        lastErrorMessage: 'offline',
        reconnectAttempts: 3,
        nextReconnectAt: 1_710_000_000_000,
      }),
    })

    expect(result.structured?.status.serverListening).toBe(true)
    expect(result.structured?.status.extensionConnected).toBe(false)
    expect(result.structured?.status.lastErrorCode).toBe(BridgeErrorCode.MCP_SERVER_UNAVAILABLE)
  })

  it('renders pro:true status as Pro', async () => {
    const result = await getStatusTool.execute({}, {
      invoke: createInvoke({ pro: true }),
    })

    expect(result.structured?.status.pro).toBe(true)
    expect(result.text).toContain('Pro')
  })

  describe('renderSuggestion', () => {
    it.each([
      [BridgeErrorCode.MCP_SERVER_UNAVAILABLE, '18365'],
      [BridgeErrorCode.AUTH_FAILED, 'Session Token'],
      [BridgeErrorCode.PROTOCOL_MISMATCH, '同一版本'],
      [BridgeErrorCode.HANDSHAKE_TIMEOUT, '重启'],
      [BridgeErrorCode.PREMIUM_REQUIRED, 'Pro'],
    ])('includes suggestion for %s', async (errorCode, expectedHint) => {
      const result = await getStatusTool.execute({}, {
        invoke: createInvoke({ lastErrorCode: errorCode }),
      })
      expect(result.text).toContain('建议')
      expect(result.text).toContain(expectedHint)
    })

    it('omits suggestion when no known error code', async () => {
      const result = await getStatusTool.execute({}, {
        invoke: createInvoke({ lastErrorCode: null }),
      })
      expect(result.text).not.toContain('建议')
    })
  })
})
