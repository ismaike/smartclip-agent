import { destinationSchema } from 'smartclip-bridge-protocol'
import { z } from 'zod'
import type { WebSocketBridge } from '../bridge/websocketBridge.js'

export const clipDailyTaskSchema = {
  taskId: z.string().describe('每日任务 ID（通过 get_daily_tasks 获取）'),
  destination: destinationSchema
    .optional()
    .describe('保存目标平台。不提供则使用用户配置的默认平台。'),
  mode: z.enum(['full', 'selection']).default('full')
    .describe('提取模式：full 提取整个页面，selection 仅提取选中内容'),
  closeTab: z.boolean().default(true)
    .describe('剪藏完成后是否关闭自动打开的标签页'),
}

export const clipDailyTaskDescription = '处理一个每日待剪藏任务：自动打开任务对应的网页，提取内容并保存到笔记平台，然后标记任务为已完成。'

export async function clipDailyTask(bridge: WebSocketBridge, args: {
  taskId: string
  destination?: string
  mode: string
  closeTab: boolean
}) {
  const response = await bridge.send('clip-daily-task', {
    taskId: args.taskId,
    destination: args.destination,
    mode: args.mode,
    closeTab: args.closeTab,
  })

  if (!response.success) {
    return {
      content: [{ type: 'text' as const, text: `每日任务剪藏失败: ${response.error}` }],
      isError: true,
    }
  }

  const info = response.data || {}
  let text = `每日任务剪藏成功！`
  text += `\n标题: ${info.title || '(无标题)'}`
  text += `\nURL: ${info.url || '(无URL)'}`

  if (response.taskId)
    text += `\n剪藏任务 ID: ${response.taskId}`
  if (response.warning)
    text += `\n警告: ${response.warning}`

  if (response.markdown) {
    const preview = response.markdown.length > 500
      ? `${response.markdown.substring(0, 500)}...`
      : response.markdown
    text += `\n\n=== Markdown 预览 ===\n${preview}`
  }

  return {
    content: [{ type: 'text' as const, text }],
    structuredContent: {
      taskId: args.taskId,
      title: info.title || null,
      url: info.url || null,
      saved: true,
      clipTaskId: response.taskId || null,
      warning: response.warning || null,
      markdown: response.markdown || null,
    },
  }
}
