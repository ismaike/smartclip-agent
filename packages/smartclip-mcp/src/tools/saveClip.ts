import { z } from 'zod'
import type { WebSocketBridge } from '../bridge/websocketBridge.js'

export const saveClipSchema = {
  url: z.string().describe('页面 URL'),
  title: z.string().optional().describe('页面标题'),
  contentHtml: z.string().optional().describe('HTML 内容'),
  contentMarkdown: z.string().optional().describe('Markdown 内容（如已转换）'),
  excerpt: z.string().optional().describe('页面摘要'),
  tags: z.array(z.string()).optional().describe('标签列表'),
  author: z.string().optional().describe('作者'),
  destination: z.enum(['obsidian', 'notion', 'markdown', 'flomo', 'siyuan', 'joplin', 'feishu'])
    .describe('保存目标平台'),
}

export const saveClipDescription = '将剪藏内容保存到指定的笔记平台（Notion、Obsidian、Flomo、Joplin、思源笔记、飞书等）。需要提供内容和目标平台。'

export async function saveClip(bridge: WebSocketBridge, args: {
  url: string
  title?: string
  contentHtml?: string
  contentMarkdown?: string
  excerpt?: string
  tags?: string[]
  author?: string
  destination: string
}) {
  const clip: Record<string, any> = {
    url: args.url,
    title: args.title,
    contentHtml: args.contentHtml,
    contentMarkdown: args.contentMarkdown,
    excerpt: args.excerpt,
    site: (() => {
      try { return new URL(args.url).hostname }
      catch { return 'unknown' }
    })(),
    createdAt: new Date().toISOString(),
  }

  if (args.tags || args.author) {
    clip.meta = {}
    if (args.tags)
      clip.meta.tags = args.tags
    if (args.author)
      clip.meta.author = args.author
  }

  const response = await bridge.send('save-clip', {
    clip,
    destination: args.destination,
  })

  if (!response.success) {
    return {
      content: [{ type: 'text' as const, text: `保存失败: ${response.error}` }],
      isError: true,
    }
  }

  let text = `剪藏已成功保存到 ${args.destination}`
  if (response.taskId)
    text += `\n任务 ID: ${response.taskId}`
  if (response.warning)
    text += `\n警告: ${response.warning}`

  return {
    content: [{ type: 'text' as const, text }],
    structuredContent: {
      saved: true,
      destination: args.destination,
      taskId: response.taskId || null,
      warning: response.warning || null,
    },
  }
}
