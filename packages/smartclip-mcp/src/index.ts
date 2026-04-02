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

import { readFile } from 'node:fs/promises'

startServer().catch((error) => {
  const err = error instanceof Error ? error : new Error(String(error))
  process.stderr.write(`[smartclip-mcp] Fatal error: ${err.message}\n`)
  process.exitCode = 1
})

async function loadVersion(): Promise<string> {
  try {
    const packageJsonPath = new URL('../package.json', import.meta.url)
    const content = await readFile(packageJsonPath, 'utf-8')
    const pkg = JSON.parse(content)
    return pkg.version || '0.7.0'
  }
  catch {
    return '0.7.0'
  }
}

async function startServer() {
  const version = await loadVersion()

  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js')
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js')
  const { WebSocketBridge } = await import('./bridge/websocketBridge.js')
  const { listTabsSchema, listTabsDescription, listTabs } = await import('./tools/listTabs.js')
  const { extractPageSchema, extractPageDescription, extractPage } = await import('./tools/extractPage.js')
  const { convertToMarkdownSchema, convertToMarkdownDescription, convertToMarkdown } = await import('./tools/convertToMarkdown.js')
  const { saveClipSchema, saveClipDescription, saveClip } = await import('./tools/saveClip.js')
  const { getTasksSchema, getTasksDescription, getTasks } = await import('./tools/getTasks.js')
  const { clipPageSchema, clipPageDescription, clipPage } = await import('./tools/clipPage.js')
  const { getDailyTasksSchema, getDailyTasksDescription, getDailyTasks } = await import('./tools/getDailyTasks.js')
  const { clipDailyTaskSchema, clipDailyTaskDescription, clipDailyTask } = await import('./tools/clipDailyTask.js')
  const { clipAllDailyTasksSchema, clipAllDailyTasksDescription, clipAllDailyTasks } = await import('./tools/clipAllDailyTasks.js')
  const { getVocabularySchema, getVocabularyDescription, getVocabulary } = await import('./tools/getVocabulary.js')
  const { getStatusSchema, getStatusDescription, getStatus } = await import('./tools/getStatus.js')

  const bridge = new WebSocketBridge({
    sessionToken: process.env.SMARTCLIP_MCP_SESSION_TOKEN,
  })

  const server = new McpServer({
    name: 'smartclip',
    version,
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

  server.tool('get_daily_tasks', getDailyTasksDescription, getDailyTasksSchema, async (args) => {
    return await getDailyTasks(bridge, args)
  })

  server.tool('clip_daily_task', clipDailyTaskDescription, clipDailyTaskSchema, async (args) => {
    return await clipDailyTask(bridge, args)
  })

  server.tool('clip_all_daily_tasks', clipAllDailyTasksDescription, clipAllDailyTasksSchema, async (args) => {
    return await clipAllDailyTasks(bridge, args)
  })

  server.tool('get_vocabulary', getVocabularyDescription, getVocabularySchema, async () => {
    return await getVocabulary(bridge)
  })

  server.tool('get_status', getStatusDescription, getStatusSchema, async () => {
    return await getStatus(bridge)
  })

  // 启动 WebSocket server，等待 Chrome 扩展连接
  await bridge.connect()

  // 启动 MCP stdio transport
  const transport = new StdioServerTransport()
  await server.connect(transport)
  process.stderr.write('[smartclip-mcp] MCP Server started (stdio transport)\n')
}
