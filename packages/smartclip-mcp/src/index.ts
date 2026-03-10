#!/usr/bin/env node
/**
 * SmartClip MCP Server
 *
 * 启动 MCP Server，通过 stdio 与 Claude Code 通信，
 * 同时启动 WebSocket server 等待 Chrome 扩展连接。
 *
 * 用法：
 *   smartclip-mcp          → 启动 MCP Server
 *   smartclip-mcp --help   → 显示帮助
 */

startServer().catch((error) => {
  const err = error instanceof Error ? error : new Error(String(error))
  process.stderr.write(`[smartclip-mcp] Fatal error: ${err.message}\n`)
  process.exitCode = 1
})

async function startServer() {
  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js')
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js')
  const { WebSocketBridge } = await import('./bridge/websocketBridge.js')
  const { listTabsSchema, listTabsDescription, listTabs } = await import('./tools/listTabs.js')
  const { extractPageSchema, extractPageDescription, extractPage } = await import('./tools/extractPage.js')
  const { convertToMarkdownSchema, convertToMarkdownDescription, convertToMarkdown } = await import('./tools/convertToMarkdown.js')
  const { saveClipSchema, saveClipDescription, saveClip } = await import('./tools/saveClip.js')
  const { getTasksSchema, getTasksDescription, getTasks } = await import('./tools/getTasks.js')
  const { clipPageSchema, clipPageDescription, clipPage } = await import('./tools/clipPage.js')

  const bridge = new WebSocketBridge()

  const server = new McpServer({
    name: 'smartclip',
    version: '0.6.0',
  })

  server.tool('list_tabs', listTabsDescription, listTabsSchema, async () => {
    return await listTabs(bridge)
  })

  server.tool('extract_page', extractPageDescription, extractPageSchema, async (args) => {
    return await extractPage(bridge, args)
  })

  server.tool('convert_to_markdown', convertToMarkdownDescription, convertToMarkdownSchema, async (args) => {
    return await convertToMarkdown(bridge, args)
  })

  server.tool('save_clip', saveClipDescription, saveClipSchema, async (args) => {
    return await saveClip(bridge, args as any)
  })

  server.tool('get_tasks', getTasksDescription, getTasksSchema, async (args) => {
    return await getTasks(bridge, args)
  })

  server.tool('clip_page', clipPageDescription, clipPageSchema, async (args) => {
    return await clipPage(bridge, args)
  })

  // 启动 WebSocket server，等待 Chrome 扩展连接
  await bridge.connect()

  // 启动 MCP stdio transport
  const transport = new StdioServerTransport()
  await server.connect(transport)
  process.stderr.write('[smartclip-mcp] MCP Server started (stdio transport)\n')
}
