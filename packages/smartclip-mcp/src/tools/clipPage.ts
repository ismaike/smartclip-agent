import { destinationSchema } from 'smartclip-bridge-protocol'
import { z } from 'zod'
import type { WebSocketBridge } from '../bridge/websocketBridge.js'

export const clipPageSchema = {
  tabId: z.number().optional().describe('标签页ID，默认当前标签页'),
  url: z.string().url().optional().describe('网页URL，自动打开并剪藏'),
  destination: destinationSchema
    .optional()
    .describe('保存目标。不传则仅返回Markdown不保存'),
  mode: z.enum(['full', 'selection']).default('full').describe('full=全页, selection=选区'),
}

export const clipPageDescription = '提取网页并转为Markdown，可选保存到笔记平台。'

export async function clipPage(bridge: WebSocketBridge, args: {
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

  const summary = args.destination
    ? `已保存到 ${args.destination}`
    : '提取成功'
  const taskId = response.taskId ? ` (task:${response.taskId})` : ''
  const warning = response.warning ? ` ⚠ ${response.warning}` : ''
  const mdInfo = response.markdown ? ` [${response.markdown.length}字]` : ''

  return {
    content: [{ type: 'text' as const, text: `${summary}${taskId}${warning}${mdInfo}` }],
    structuredContent: {
      url: response.clip?.url || args.url || '',
      title: response.clip?.title,
      markdown: response.markdown,
      saved: Boolean(args.destination),
      destination: args.destination,
      taskId: response.taskId,
      warning: response.warning,
      createdTabId: response.createdTabId,
      clip: response.clip,
    },
  }
}
