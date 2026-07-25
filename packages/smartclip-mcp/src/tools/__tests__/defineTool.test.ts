import { describe, expect, it } from 'vitest'
import { BridgeAction } from 'smartclip-bridge-protocol'
import type { BridgeResponse } from 'smartclip-bridge-protocol'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { WebSocketBridge } from '../../bridge/websocketBridge.js'
import { registerTool, type ToolDescriptor } from '../defineTool.js'

/** 最小化的 mock MCP server——捕获 registerTool 注册的 handler 供测试调用 */
function createMockServer() {
  const handlers = new Map<string, (args: any) => Promise<any>>()
  return {
    server: {
      tool(name: string, _desc: string, _schema: any, _annotations: any, handler: (args: any) => Promise<any>) {
        handlers.set(name, handler)
      },
    } as unknown as McpServer,
    call(name: string, args?: any) {
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
  it('wraps execute {text, structured} into MCP result shape', async () => {
    const { server, call } = createMockServer()

    const descriptor: ToolDescriptor = {
      name: 'test_tool',
      description: 'test',
      schema: {},
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
