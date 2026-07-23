#!/usr/bin/env node
/**
 * SmartClip MCP Server
 *
 * 启动 MCP Server，通过 stdio 与 Claude Code 通信，
 * 同时启动 WebSocket server 等待 Chrome 扩展连接。
 *
 * 用法：
 *   smartclip-mcp           → 启动 MCP Server (由 AI 客户端自动调用)
 *   smartclip-mcp --help    → 显示帮助
 *   smartclip-mcp --version → 显示版本
 */

import { readFile } from 'node:fs/promises'

async function loadVersion(): Promise<string> {
  try {
    const packageJsonPath = new URL('../package.json', import.meta.url)
    const content = await readFile(packageJsonPath, 'utf-8')
    const pkg = JSON.parse(content)
    return pkg.version || '1.5.0'
  }
  catch {
    return '1.5.0'
  }
}

function printHelp(version: string): void {
  console.log(`smartclip-mcp v${version} - MCP Server for SmartClip Chrome Extension

用法:
  smartclip-mcp              启动 MCP Server (stdio 模式)
  smartclip-mcp --help       显示此帮助信息
  smartclip-mcp --version    显示版本号

功能:
  为 AI 客户端 (Claude Code, Gemini CLI, Cursor 等) 提供 SmartClip 工具:
  - 读取当前 Chrome 打开的网页
  - 提取网页正文并转换为 Markdown
  - 将内容保存到 Obsidian / Notion / Flomo / Joplin / 思源 / 飞书
  - 处理 SmartClip 每日任务池

环境变量:
  SMARTCLIP_MCP_SESSION_TOKEN    会话认证 token (可选)
  SMARTCLIP_MCP_WS_BIND_HOST     WebSocket 绑定地址 (默认 127.0.0.1)

连接:
  WebSocket 端口: 18365
  Chrome 扩展需在设置中开启 MCP 服务

更多信息请参考: https://smartclip.app`)
}

async function main() {
  const args = process.argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    const version = await loadVersion()
    printHelp(version)
    process.exit(0)
  }

  if (args.includes('--version') || args.includes('-v')) {
    const version = await loadVersion()
    console.log(`smartclip-mcp v${version}`)
    process.exit(0)
  }

  await startServer()
}

main().catch((error) => {
  const err = error instanceof Error ? error : new Error(String(error))
  process.stderr.write(`[smartclip-mcp] Fatal error: ${err.message}\n`)
  process.exitCode = 1
})

async function startServer() {
  const version = await loadVersion()

  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js')
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js')
  const { WebSocketBridge } = await import('./bridge/websocketBridge.js')
  const { listTabsSchema, listTabsDescription, listTabsAnnotations, listTabs } = await import('./tools/listTabs.js')
  const { saveClipSchema, saveClipDescription, saveClipAnnotations, saveClip } = await import('./tools/saveClip.js')
  const { clipPageSchema, clipPageDescription, clipPage } = await import('./tools/clipPage.js')
  const { getDailyTasksSchema, getDailyTasksDescription, getDailyTasksAnnotations, getDailyTasks } = await import('./tools/getDailyTasks.js')
  const { clipDailyTaskSchema, clipDailyTaskDescription, clipDailyTask } = await import('./tools/clipDailyTask.js')
  const { clipAllDailyTasksSchema, clipAllDailyTasksDescription, clipAllDailyTasks } = await import('./tools/clipAllDailyTasks.js')
  const { getVocabularySchema, getVocabularyDescription, getVocabularyAnnotations, getVocabulary } = await import('./tools/getVocabulary.js')
  const { getStatusSchema, getStatusDescription, getStatusAnnotations, getStatus } = await import('./tools/getStatus.js')

  const bridge = new WebSocketBridge({
    sessionToken: process.env.SMARTCLIP_MCP_SESSION_TOKEN,
  })

  const server = new McpServer({
    name: 'smartclip',
    version,
  })

  server.tool('list_tabs', listTabsDescription, listTabsSchema, listTabsAnnotations, async () => {
    return await listTabs(bridge)
  })

  server.tool('save_clip', saveClipDescription, saveClipSchema, saveClipAnnotations, async (args) => {
    return await saveClip(bridge, args as any)
  })

  server.tool('clip_page', clipPageDescription, clipPageSchema, {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  }, async (args) => {
    return await clipPage(bridge, args)
  })

  server.tool('get_daily_tasks', getDailyTasksDescription, getDailyTasksSchema, getDailyTasksAnnotations, async (args) => {
    return await getDailyTasks(bridge, args)
  })

  server.tool('clip_daily_task', clipDailyTaskDescription, clipDailyTaskSchema, {
    destructiveHint: false,
    idempotentHint: false,
  }, async (args) => {
    return await clipDailyTask(bridge, args)
  })

  server.tool('clip_all_daily_tasks', clipAllDailyTasksDescription, clipAllDailyTasksSchema, {
    destructiveHint: false,
    idempotentHint: false,
  }, async (args) => {
    return await clipAllDailyTasks(bridge, args)
  })

  server.tool('get_vocabulary', getVocabularyDescription, getVocabularySchema, getVocabularyAnnotations, async () => {
    return await getVocabulary(bridge)
  })

  server.tool('get_status', getStatusDescription, getStatusSchema, getStatusAnnotations, async () => {
    return await getStatus(bridge)
  })

  // 启动 WebSocket server，等待 Chrome 扩展连接
  await bridge.connect()

  // 启动 MCP stdio transport
  const transport = new StdioServerTransport()
  await server.connect(transport)
  process.stderr.write('[smartclip-mcp] MCP Server started (stdio transport)\n')
}
