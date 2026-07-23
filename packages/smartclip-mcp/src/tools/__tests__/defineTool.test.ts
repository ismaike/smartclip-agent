import { describe, expect, it } from 'vitest'
import { BridgeAction } from 'smartclip-bridge-protocol'
import { registerTool, type ToolDescriptor } from '../defineTool.js'

/** 最小化的 mock MCP server——捕获 handler 供测试调用 */
function createMockServer() {
  const handlers = new Map<string, (args: any) => Promise<any>>()
  return {
    tool(name: string, _desc: string, _schema: any, _annotations: any, handler: (args: any) => Promise<any>) {
      handlers.set(name, handler)
    },
    call(name: string, args?: any) {
      const handler = handlers.get(name)
      if (!handler)
        throw new Error(`Tool "${name}" not registered`)
      return handler(args ?? {})
    },
  }
}

function createMockBridge(response: any) {
  return {
    async send() {
      return response
    },
  } as any
}

describe('defineTool — registerTool', () => {
  it('wraps execute {text, structured} into MCP result shape', async () => {
    const server = createMockServer()
    const bridge = createMockBridge({ success: true, data: { hello: 'world' } })

    const descriptor: ToolDescriptor = {
      name: 'test_tool',
      description: 'test',
      schema: {},
      errorLabel: '测试失败',
      async execute(_args, { send }) {
        const r = await send(BridgeAction.GET_STATUS)
        return { text: `result: ${(r.data as any).hello}`, structured: { hello: (r.data as any).hello } }
      },
    }

    registerTool(server as any, descriptor, bridge)
    const result = await server.call('test_tool')

    expect(result.content[0].type).toBe('text')
    expect(result.content[0].text).toBe('result: world')
    expect(result.structuredContent).toEqual({ hello: 'world' })
    expect(result.isError).toBeUndefined()
  })

  it('catches bridge failure (send throws) and formats with errorLabel', async () => {
    const server = createMockServer()
    const bridge = createMockBridge({ success: false, error: '连接丢失' })

    const descriptor: ToolDescriptor = {
      name: 'test_tool',
      description: 'test',
      schema: {},
      errorLabel: '获取失败',
      async execute(_args, { send }) {
        await send('get-status' as any)
        return { text: '不应到达此处' }
      },
    }

    registerTool(server as any, descriptor, bridge)
    const result = await server.call('test_tool')

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('获取失败: 连接丢失')
  })

  it('catches execute errors (e.g. schema parse failure) and formats with errorLabel', async () => {
    const server = createMockServer()
    const bridge = createMockBridge({ success: true, data: {} })

    const descriptor: ToolDescriptor = {
      name: 'test_tool',
      description: 'test',
      schema: {},
      errorLabel: '获取失败',
      async execute() {
        throw new Error('自定义错误')
      },
    }

    registerTool(server as any, descriptor, bridge)
    const result = await server.call('test_tool')

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('获取失败: 自定义错误')
  })

  it('omits structuredContent when execute returns no structured field', async () => {
    const server = createMockServer()
    const bridge = createMockBridge({ success: true, data: {} })

    const descriptor: ToolDescriptor = {
      name: 'test_tool',
      description: 'test',
      schema: {},
      errorLabel: '失败',
      async execute() {
        return { text: '仅文本' }
      },
    }

    registerTool(server as any, descriptor, bridge)
    const result = await server.call('test_tool')

    expect(result.content[0].text).toBe('仅文本')
    expect(result.structuredContent).toBeUndefined()
  })
})
