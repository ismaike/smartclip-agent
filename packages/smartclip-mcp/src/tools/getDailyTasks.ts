import { BridgeAction } from 'smartclip-bridge-protocol'
import { z } from 'zod'
import type { ToolDescriptor, ToolContext } from './defineTool.js'

export default {
  name: 'get_daily_tasks',
  description: '查看每日待剪藏任务池。',
  schema: {
    status: z.enum(['pending', 'completed', 'skipped']).optional()
      .describe('按状态过滤'),
  },
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
  },
  errorLabel: '获取每日任务失败',
  async execute(args: { status?: string }, { send }: ToolContext) {
    const r = await send(BridgeAction.GET_DAILY_TASKS, { status: args.status })

    const tasks = (r.data || []) as any[]
    if ((tasks as any[]).length === 0) {
      return {
        text: args.status
          ? `没有状态为 "${args.status}" 的每日任务`
          : '每日任务池为空',
      }
    }

    const statusEmoji: Record<string, string> = {
      pending: '📋',
      completed: '✅',
      skipped: '⏭️',
    }

    const taskList = (tasks as any[]).map((task: any) => {
      const emoji = statusEmoji[task.status] || '❓'
      const lines = [
        `${emoji} [${task.status}] ${task.title || '(无标题)'}`,
        `   URL: ${task.url}`,
        `   ID: ${task.id}`,
      ]
      if (task.description)
        lines.push(`   描述: ${task.description}`)
      if (task.createdAt)
        lines.push(`   创建时间: ${task.createdAt}`)
      return lines.join('\n')
    }).join('\n\n')

    return {
      text: `共 ${(tasks as any[]).length} 个每日任务:\n\n${taskList}`,
      structured: {
        tasks,
        count: (tasks as any[]).length,
        lastSyncAt: r.lastSyncAt,
      },
    }
  },
} satisfies ToolDescriptor
