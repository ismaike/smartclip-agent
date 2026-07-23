import { destinationSchema } from 'smartclip-bridge-protocol'
import { z } from 'zod'
import type { WebSocketBridge } from '../bridge/websocketBridge.js'

export const clipAllDailyTasksSchema = {
  destination: destinationSchema
    .optional()
    .describe('保存目标，默认用用户配置'),
  mode: z.enum(['full', 'selection']).default('full')
    .describe('full=全页, selection=选区'),
  closeTab: z.boolean().default(true)
    .describe('完成后是否关闭标签页'),
}

export const clipAllDailyTasksDescription = '批量剪藏所有待办每日任务。'

export async function clipAllDailyTasks(bridge: WebSocketBridge, args: {
  destination?: string
  mode: string
  closeTab: boolean
}) {
  const response = await bridge.send('clip-all-daily-tasks', {
    destination: args.destination,
    mode: args.mode,
    closeTab: args.closeTab,
  })

  if (!response.success) {
    return {
      content: [{ type: 'text' as const, text: `批量剪藏失败: ${response.error}` }],
      isError: true,
    }
  }

  const { total, succeeded, failed, results } = response.data || { total: 0, succeeded: 0, failed: 0, results: [] }

  if (total === 0) {
    return {
      content: [{ type: 'text' as const, text: '没有待处理的每日任务。' }],
    }
  }

  const resultList = (results as any[]).map((r: any) => {
    const emoji = r.success ? '✅' : '❌'
    let line = `${emoji} ${r.title || '(无标题)'} - ${r.url}`
    if (r.error)
      line += ` | ${r.error}`
    return line
  }).join('\n')

  return {
    content: [{ type: 'text' as const, text: `批量完成: ${succeeded}/${total} 成功, ${failed} 失败\n${resultList}` }],
    structuredContent: {
      summary: { total, succeeded, failed },
      results,
    },
  }
}
