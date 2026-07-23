import { destinationSchema } from 'smartclip-bridge-protocol'
import { z } from 'zod'
import type { WebSocketBridge } from '../bridge/websocketBridge.js'

export const clipAllDailyTasksSchema = {
  destination: destinationSchema
    .optional()
    .describe('保存目标平台。不提供则使用用户配置的默认平台。'),
  mode: z.enum(['full', 'selection']).default('full')
    .describe('提取模式：full 提取整个页面，selection 仅提取选中内容'),
  closeTab: z.boolean().default(true)
    .describe('每个任务剪藏完成后是否关闭自动打开的标签页'),
}

export const clipAllDailyTasksDescription = '批量处理所有待办（pending）的每日剪藏任务：依次自动打开每个任务的网页，提取内容并保存到笔记平台。返回处理汇总。'

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

  let text = `批量剪藏完成！共 ${total} 个任务，成功 ${succeeded} 个，失败 ${failed} 个。\n`

  const resultList = (results as any[]).map((r: any) => {
    const emoji = r.success ? '✅' : '❌'
    let line = `${emoji} ${r.title || '(无标题)'} - ${r.url}`
    if (r.error)
      line += `\n   错误: ${r.error}`
    return line
  }).join('\n')

  text += `\n${resultList}`

  return {
    content: [{ type: 'text' as const, text }],
    structuredContent: {
      summary: { total, succeeded, failed },
      results,
    },
  }
}
