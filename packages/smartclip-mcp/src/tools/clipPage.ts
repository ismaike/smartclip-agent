import { BridgeAction, destinationSchema } from 'smartclip-bridge-protocol'
import { z } from 'zod'
import type { ToolDescriptor, ToolContext } from './defineTool.js'

export default {
  name: 'clip_page',
  description: '提取网页并转为Markdown，可选保存到笔记平台。',
  schema: {
    tabId: z.number().optional().describe('标签页ID，默认当前标签页'),
    url: z.string().url().optional().describe('网页URL，自动打开并剪藏'),
    destination: destinationSchema
      .optional()
      .describe('保存目标。不传则仅返回Markdown不保存'),
    mode: z.enum(['full', 'selection']).default('full').describe('full=全页, selection=选区'),
  },
  annotations: {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  errorLabel: '剪藏失败',
  async execute(args: {
    tabId?: number
    url?: string
    destination?: string
    mode: string
  }, { send }: ToolContext) {
    const r = await send(BridgeAction.CLIP_PAGE, {
      tabId: args.tabId,
      url: args.url,
      destination: args.destination,
      mode: args.mode,
    })

    const summary = args.destination
      ? `已保存到 ${args.destination}`
      : '提取成功'
    const taskId = r.taskId ? ` (task:${r.taskId})` : ''
    const warning = r.warning ? ` ⚠ ${r.warning}` : ''
    const mdInfo = r.markdown ? ` [${r.markdown.length}字]` : ''

    return {
      text: `${summary}${taskId}${warning}${mdInfo}`,
      structured: {
        url: (r as any).clip?.url || args.url || '',
        title: (r as any).clip?.title,
        markdown: r.markdown,
        saved: Boolean(args.destination),
        destination: args.destination,
        taskId: r.taskId,
        warning: r.warning,
        createdTabId: r.createdTabId,
        clip: (r as any).clip,
      },
    }
  },
} satisfies ToolDescriptor
