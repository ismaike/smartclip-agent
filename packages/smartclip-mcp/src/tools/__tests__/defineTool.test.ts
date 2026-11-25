import { describe, expect, it } from 'vitest'
import { BridgeAction } from 'smartclip-bridge-protocol'
import type { BridgeResponse } from 'smartclip-bridge-protocol'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { WebSocketBridge } from '../../bridge/websocketBridge.js'
import { registerTool, type ToolDescriptor } from '../defineTool.js'

/** 最小化的 mock MCP server——捕获 registerTool 注册的 handler 与配置供测试调用 */
function createMockServer() {
  const handlers = new Map<string, (args: unknown) => Promise<any>>()
  const configs = new Map<string, Record<string, unknown>>()
  return {
    server: {
      registerTool(name: string, config: Record<string, unknown>, handler: (args: unknown) => Promise<any>) {
        configs.set(name, config)
        handlers.set(name, handler)
      },
    } as unknown as McpServer,
    getConfig(name: string) {
      return configs.get(name)
    },
    call(name: string, args?: unknown) {
      const handler = handlers.get(name)
      if (!handler)
        throw new Error(`Tool "${name}" not registered`)
      return handler(args ?? {})
    },
  }
}

/** 仅含 send 的假 bridge——返回 envelope，让测试走真实契约归一化 */
function createFakeBridge(send: (action: BridgeAction, data?: unknown) => Promise<BridgeResponse>): WebSocketBridge {
  return { send } as unknown as WebSocketBridge
}

describe('defineTool — registerTool', () => {
  it('wraps execute {text, structured} into MCP result shape and passes outputSchema', async () => {
    const { server, call, getConfig } = createMockServer()

    const descriptor: ToolDescriptor = {
      name: 'test_tool',
      description: 'test',
      schema: {},
      outputSchema: { connected: z.boolean() },
      annotations: { readOnlyHint: true },
      errorLabel: '测试失败',
      async execute(_args, ctx) {
        const status = await ctx.invoke(BridgeAction.GET_STATUS)
        return { text: `result: ${status.extensionConnected}`, structured: { connected: status.extensionConnected } }
      },
    }

    const bridge = createFakeBridge(async () => ({
      id: '1',
      success: true,
      data: {
        serverListening: true,
        extensionConnected: true,
        mcpEnabled: true,
        protocolVersion: '1',
      },
    }))

    registerTool(server, descriptor, bridge)
    const config = getConfig('test_tool')
    expect(config?.outputSchema).toBeDefined()
    expect(config?.annotations).toEqual({ readOnlyHint: true })

    const result = await call('test_tool')

    expect(result.content[0].type).toBe('text')
    expect(result.content[0].text).toBe('result: true')
    expect(result.structuredContent).toEqual({ connected: true })
    expect(result.isError).toBeUndefined()
  })

  it('catches invoke failure (BridgeConnectionError) and formats with errorLabel', async () => {
    const { server, call } = createMockServer()

    const descriptor: ToolDescriptor = {
      name: 'test_tool',
      description: 'test',
      schema: {},
      errorLabel: '获取失败',
      async execute(_args, ctx) {
        await ctx.invoke(BridgeAction.GET_STATUS)
        return { text: '不应到达此处' }
      },
    }

    const bridge = createFakeBridge(async () => {
      throw new Error('连接丢失')
    })

    registerTool(server, descriptor, bridge)
    const result = await call('test_tool')

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('获取失败:')
    expect(result.content[0].text).toContain('连接丢失')
  })

  it('catches execute errors and formats with errorLabel', async () => {
    const { server, call } = createMockServer()

    const descriptor: ToolDescriptor = {
      name: 'test_tool',
      description: 'test',
      schema: {},
      errorLabel: '获取失败',
      async execute() {
        throw new Error('自定义错误')
      },
    }

    const bridge = createFakeBridge(async () => ({ id: '1', success: true }))

    registerTool(server, descriptor, bridge)
    const result = await call('test_tool')

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('获取失败: 自定义错误')
  })

  it('omits structuredContent when execute returns no structured field', async () => {
    const { server, call } = createMockServer()

    const descriptor: ToolDescriptor = {
      name: 'test_tool',
      description: 'test',
      schema: {},
      errorLabel: '失败',
      async execute() {
        return { text: '仅文本' }
      },
    }

    const bridge = createFakeBridge(async () => ({ id: '1', success: true }))

    registerTool(server, descriptor, bridge)
    const result = await call('test_tool')

    expect(result.content[0].text).toBe('仅文本')
    expect(result.structuredContent).toBeUndefined()
  })
})
