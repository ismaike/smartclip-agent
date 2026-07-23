import { destinationSchema } from 'smartclip-bridge-protocol'
import { z } from 'zod'
import type { WebSocketBridge } from '../bridge/websocketBridge.js'

export const saveClipSchema = {
  url: z.string().describe('页面URL'),
  title: z.string().optional().describe('标题'),
  contentHtml: z.string().optional().describe('HTML内容'),
  contentMarkdown: z.string().optional().describe('Markdown内容'),
  excerpt: z.string().optional().describe('摘要'),
  tags: z.array(z.string()).optional().describe('标签'),
  author: z.string().optional().describe('作者'),
  destination: destinationSchema
    .describe('保存目标平台'),
}

export const saveClipDescription = '保存内容到笔记平台。'

export const saveClipAnnotations = {
  destructiveHint: false,
  idempotentHint: true,
} as const

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

  const taskId = response.taskId ? ` (task:${response.taskId})` : ''
  const warning = response.warning ? ` ⚠ ${response.warning}` : ''

  return {
    content: [{ type: 'text' as const, text: `已保存到 ${args.destination}${taskId}${warning}` }],
    structuredContent: {
      saved: true,
      destination: args.destination,
      taskId: response.taskId || null,
      warning: response.warning || null,
    },
  }
}
