import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { BridgeTransport } from 'smartclip-bridge-protocol'
import { registerPrompts } from './prompts.js'
import { registerTool } from './tools/defineTool.js'
import { tools } from './tools/index.js'

export const SMARTCLIP_INSTRUCTIONS = [
  'SmartClip MCP 通过 Chrome 扩展读取已登录网页并保存到 16 种笔记平台：',
  '- 只读网页/总结：用 `read_page`（绝不自动保存）。',
  '- 明确保存：网页原样用 `clip_page({ destination })`，AI 总结用 `save_clip`。',
  '- 每日任务：先 `get_daily_tasks` 展示待办，批量 `clip_all_daily_tasks` 前先确认；连接异常调 `get_status` 或运行 `smartclip-mcp doctor`。',
].join('\n')

export interface CreateSmartClipMcpServerOptions {
  version: string
  transport: BridgeTransport
}

/**
 * 创建并装配完整的 McpServer 实例（含工具与原生 Prompts）。
 * 每个 MCP 连接（stdio 或每个 Streamable HTTP 会话）应创建独立的 McpServer 实例，
 * 共享同一个底层 BridgeTransport。
 */
export function createSmartClipMcpServer({
  version,
  transport,
}: CreateSmartClipMcpServerOptions): McpServer {
  const server = new McpServer(
    {
      name: 'smartclip',
      version,
    },
    {
      instructions: SMARTCLIP_INSTRUCTIONS,
    },
  )

  for (const tool of tools)
    registerTool(server, tool, transport)

  registerPrompts(server)

  return server
}
