/**
 * defineTool — 工具定义模块（深模块）
 *
 * 在单个 Tool Descriptor 背后吸收：
 * - MCP 工具注册（server.tool）
 * - bridge 调用（send 辅助函数，失败自动抛异常）
 * - 错误格式化（catch → errorLabel 前缀）
 * - MCP 结果形状包装（execute 返回 {text, structured}，defineTool 包成 MCP 结果）
 *
 * 工具只提供纯映射逻辑，永远不碰 MCP 结果形状。
 */

import type { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { BridgeAction, BridgeSuccess } from 'smartclip-bridge-protocol'
import type { WebSocketBridge } from '../bridge/websocketBridge.js'

/** execute 的返回值——纯域结果，不含 MCP 形状 */
export interface ToolResult {
  text: string
  structured?: Record<string, unknown>
}

/** defineTool 注入给 execute 的上下文 */
export interface ToolContext {
  /**
   * 发送 bridge action。
   * 内部检查 response.success：失败时抛异常（由 defineTool catch 并格式化）。
   * 成功时返回类型化的 BridgeSuccess。
   */
  send: (action: BridgeAction, data?: unknown) => Promise<BridgeSuccess>
}

/** 一个 MCP 工具的完整描述 */
export interface ToolDescriptor {
  /** MCP 工具名（snake_case，如 'clip_page'） */
  name: string
  /** 工具描述，面向 AI 客户端 */
  description: string
  /** zod 输入参数 schema */
  schema: Record<string, z.ZodTypeAny>
  /** MCP 工具 annotations（readOnlyHint / destructiveHint / idempotentHint / openWorldHint） */
  annotations?: Record<string, unknown>
  /** 错误文案前缀，如 '保存失败'。defineTool catch 异常后拼成 `${errorLabel}: ${message}` */
  errorLabel: string
  /** 工具执行逻辑。只负责映射，返回 { text, structured }，不碰 MCP 形状 */
  execute: (args: any, ctx: ToolContext) => Promise<ToolResult>
}

/**
 * 从 WebSocketBridge 创建 send 辅助函数。
 * 失败时抛异常，成功时返回类型化响应。
 */
function createSend(bridge: WebSocketBridge): ToolContext['send'] {
  return async (action, data) => {
    const response = await bridge.send(action, data)
    if (!response.success)
      throw new Error(response.error ?? '未知错误')
    return response
  }
}

/**
 * 将一个 Tool Descriptor 注册到 MCP Server。
 *
 * 内部完成：MCP 注册 → 调用 execute → 包成 MCP 结果 → catch 异常格式化错误。
 */
export function registerTool(server: McpServer, descriptor: ToolDescriptor, bridge: WebSocketBridge): void {
  const send = createSend(bridge)

  server.tool(
    descriptor.name,
    descriptor.description,
    descriptor.schema,
    descriptor.annotations ?? {},
    async (args: any) => {
      try {
        const result = await descriptor.execute(args, { send })
        return {
          content: [{ type: 'text' as const, text: result.text }],
          structuredContent: result.structured,
        }
      }
      catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return {
          content: [{ type: 'text' as const, text: `${descriptor.errorLabel}: ${message}` }],
          isError: true,
        }
      }
    },
  )
}
