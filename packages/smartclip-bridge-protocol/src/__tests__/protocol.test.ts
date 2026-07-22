import { describe, expect, it } from 'vitest'
import {
  BRIDGE_PROTOCOL_VERSION,
  BridgeAction,
  BridgeErrorCode,
  actionEnvelopeSchema,
  clipAllDailyTasksResultSchema,
  clipPageResultSchema,
  getDailyTasksResultSchema,
  getTasksResultSchema,
  helloRequestSchema,
  helloResponseSchema,
  listTabsResultSchema,
  statusResultSchema,
} from '../index.js'

describe('bridge protocol', () => {
  it('defines a stable protocol version and action enum', () => {
    expect(BRIDGE_PROTOCOL_VERSION).toBe('1')
    expect(BridgeAction.CLIP_PAGE).toBe('clip-page')
  })

  it('validates hello handshake payloads', () => {
    expect(() => helloRequestSchema.parse({
      type: 'hello',
      protocolVersion: '1',
      sessionToken: 'token',
      clientName: 'smartclip-extension',
      clientVersion: '1.2.3',
      capabilities: { clipPage: true },
    })).not.toThrow()

    expect(() => helloResponseSchema.parse({
      type: 'hello_ack',
      protocolVersion: '1',
      serverName: 'smartclip-mcp',
      serverVersion: '0.7.0',
      accepted: true,
    })).not.toThrow()
  })

  it('defines structured action envelopes and error codes', () => {
    expect(() => actionEnvelopeSchema.parse({
      id: 'req-1',
      action: 'clip-page',
      data: {},
    })).not.toThrow()
    expect(BridgeErrorCode.EXTENSION_NOT_CONNECTED).toBeDefined()
  })

  it('defines tool result schemas for structured MCP outputs', () => {
    expect(() => listTabsResultSchema.parse({
      tabs: [{ id: 1, url: 'https://example.com', title: 'Example', active: true, windowId: 1 }],
      count: 1,
    })).not.toThrow()

    expect(() => getTasksResultSchema.parse({
      tasks: [{ id: 'task-1', status: 'queued', destination: 'markdown', clip: { title: 'A' } }],
      count: 1,
    })).not.toThrow()

    expect(() => getDailyTasksResultSchema.parse({
      tasks: [{ id: 'daily-1', title: 'Read', url: 'https://example.com', status: 'pending' }],
      count: 1,
      lastSyncAt: 123,
    })).not.toThrow()

    expect(() => statusResultSchema.parse({
      serverListening: true,
      extensionConnected: false,
      mcpEnabled: true,
      pro: true,
      protocolVersion: '1',
      extensionVersion: '1.2.3',
      lastErrorCode: null,
      lastErrorMessage: null,
      capabilities: { clipPage: true },
    })).not.toThrow()

    expect(() => clipPageResultSchema.parse({
      url: 'https://example.com',
      title: 'Example',
      markdown: '# Example',
      saved: false,
    })).not.toThrow()

    expect(() => clipAllDailyTasksResultSchema.parse({
      summary: { total: 2, succeeded: 1, failed: 1 },
      results: [{ taskId: '1', title: 'A', url: 'https://a.com', success: true }],
    })).not.toThrow()
  })
})

describe('bridgeStatusSchema pro/premium 归一化（向后兼容）', () => {
  const base = {
    serverListening: true,
    extensionConnected: false,
    mcpEnabled: true,
    protocolVersion: '1',
  }

  it('新版扩展发 pro:true → 输出 pro:true', () => {
    const result = statusResultSchema.parse({ ...base, pro: true })
    expect(result.pro).toBe(true)
    expect(result).not.toHaveProperty('premium')
  })

  it('旧版扩展发 premium:true → 归一化为 pro:true', () => {
    const result = statusResultSchema.parse({ ...base, premium: true })
    expect(result.pro).toBe(true)
    expect(result).not.toHaveProperty('premium')
  })

  it('两者皆缺 → 默认 pro:false（无 Pro 权益）', () => {
    const result = statusResultSchema.parse({ ...base })
    expect(result.pro).toBe(false)
  })

  it('两者同时存在 → pro 优先', () => {
    const result = statusResultSchema.parse({ ...base, pro: true, premium: false })
    expect(result.pro).toBe(true)
  })
})
