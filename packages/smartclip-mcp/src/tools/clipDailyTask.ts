import { destinationSchema } from 'smartclip-bridge-protocol'
import { z } from 'zod'
import type { WebSocketBridge } from '../bridge/websocketBridge.js'

export const clipDailyTaskSchema = {
  taskId: z.string().describe('每日任务ID（通过 get_daily_tasks 获取）'),
  destination: destinationSchema
    .optional()
    .describe('保存目标，默认用用户配置'),
  mode: z.enum(['full', 'selection']).default('full')
    .describe('full=全页, selection=选区'),
  closeTab: z.boolean().default(true)
    .describe('完成后是否关闭标签页'),
}

export const clipDailyTaskDescription = '剪藏单个每日任务。'

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
  const dest = args.destination ? ` → ${args.destination}` : ''
  const taskId = response.taskId ? ` (task:${response.taskId})` : ''
  const warning = response.warning ? ` ⚠ ${response.warning}` : ''

  return {
    content: [{ type: 'text' as const, text: `任务完成: ${info.title || '(无标题)'}${dest}${taskId}${warning}` }],
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
