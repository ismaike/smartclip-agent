import { BridgeAction, destinationSchema } from 'smartclip-bridge-protocol'
import { z } from 'zod'
import type { ToolDescriptor, ToolContext } from './defineTool.js'

export default {
  name: 'save_clip',
  description: '保存内容到笔记平台。',
  schema: {
    url: z.string().describe('页面URL'),
    title: z.string().optional().describe('标题'),
    contentHtml: z.string().optional().describe('HTML内容'),
    contentMarkdown: z.string().optional().describe('Markdown内容'),
    excerpt: z.string().optional().describe('摘要'),
    tags: z.array(z.string()).optional().describe('标签'),
    author: z.string().optional().describe('作者'),
    destination: destinationSchema
      .describe('保存目标平台'),
  },
  annotations: {
    destructiveHint: false,
    idempotentHint: true,
  },
  errorLabel: '保存失败',
  async execute(args: {
    url: string
    title?: string
    contentHtml?: string
    contentMarkdown?: string
    excerpt?: string
    tags?: string[]
    author?: string
    destination: string
  }, { send }: ToolContext) {
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

    const r = await send(BridgeAction.SAVE_CLIP, { clip, destination: args.destination })

    const taskId = r.taskId ? ` (task:${r.taskId})` : ''
    const warning = r.warning ? ` ⚠ ${r.warning}` : ''

    return {
      text: `已保存到 ${args.destination}${taskId}${warning}`,
      structured: {
        saved: true,
        destination: args.destination,
        taskId: r.taskId || null,
        warning: r.warning || null,
      },
    }
  },
} satisfies ToolDescriptor
