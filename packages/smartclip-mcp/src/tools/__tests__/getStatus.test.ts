import { describe, expect, it } from 'vitest'
import { getStatus } from '../getStatus.js'

describe('getStatus', () => {
  it('returns structured smartclip health data', async () => {
    const bridge = {
      async send(action: string) {
        expect(action).toBe('get-status')
        return {
          success: true,
          data: {
            serverListening: true,
            extensionConnected: false,
            mcpEnabled: true,
            premium: true,
            protocolVersion: '1',
            extensionVersion: '1.2.3',
            lastErrorCode: 'MCP_DISABLED',
            lastErrorMessage: 'disabled',
            capabilities: { clipPage: true },
          },
        }
      },
    } as any

    const response = await getStatus(bridge)
    expect(response.structuredContent?.status.serverListening).toBe(true)
    expect(response.structuredContent?.status.extensionConnected).toBe(false)
    expect(response.structuredContent?.status.lastErrorCode).toBe('MCP_DISABLED')
  })
})
