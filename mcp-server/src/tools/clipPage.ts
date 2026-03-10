import { z } from 'zod'
import type { NativeMessagingBridge } from '../bridge/nativeMessaging.js'

export const clipPageSchema = {
  tabId: z.number().optional().describe('目标标签页 ID。如不提供，且未提供 url，将使用当前活动标签页。'),
  url: z.string().url().optional().describe('要剪藏的网页 URL。如果提供，插件将自动打开该页面并等待加载完成后进行剪藏。'),
  destination: z.enum(['obsidian', 'notion', 'markdown', 'flomo', 'siyuan', 'joplin', 'feishu'])
    .optional()
    .describe('保存目标平台。如果未提供，则仅提取并返回页面内容的 Markdown，不保存到任何笔记软件。'),
  mode: z.enum(['full', 'selection']).default('full').describe('提取模式：full 提取整个页面，selection 仅提取选中内容'),
}

export const clipPageDescription = '一键剪藏：自动提取网页内容并转换为 Markdown。默认直接返回内容，也可以选择保存到指定笔记平台。支持通过 URL 自动打开并剪藏未打开的页面。'

export async function clipPage(bridge: NativeMessagingBridge, args: {
  tabId?: number
  url?: string
  destination?: string
  mode: string
}) {
  const response = await bridge.send('clip-page', {
    tabId: args.tabId,
    url: args.url,
    destination: args.destination,
    mode: args.mode,
  })

  if (!response.success) {
    return {
      content: [{ type: 'text' as const, text: `剪藏失败: ${response.error}` }],
      isError: true,
    }
  }

  let text = args.destination ? `剪藏成功！已保存到 ${args.destination}` : `网页提取成功！`

  if (response.taskId)
    text += `\n任务 ID: ${response.taskId}`
  if (response.warning)
    text += `\n警告: ${response.warning}`

  if (response.markdown) {
    text += `\n\n=== Markdown 内容 ===\n${response.markdown}`
  }

  return {
    content: [{ type: 'text' as const, text }],
  }
}
