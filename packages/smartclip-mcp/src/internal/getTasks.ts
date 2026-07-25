import { BridgeAction } from 'smartclip-bridge-protocol'
import type { BridgeInvoker } from 'smartclip-bridge-protocol'
import { z } from 'zod'

export const getTasksSchema = {
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']).optional()
    .describe('按状态过滤任务。不提供则返回所有任务。'),
}

export const getTasksDescription = '查看剪藏任务队列的状态。可以查看所有任务或按状态过滤（queued/running/succeeded/failed/cancelled）。'

export async function getTasks(invoke: BridgeInvoker['invoke'], args: { status?: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' }) {
  const { tasks, count } = await invoke(BridgeAction.GET_TASKS, { status: args.status })

  if (count === 0) {
    return {
      content: [{
        type: 'text' as const,
        text: args.status
          ? `没有状态为 "${args.status}" 的任务`
          : '任务队列为空',
      }],
    }
  }

  const statusEmoji: Record<string, string> = {
    queued: '⏳',
    running: '🔄',
    succeeded: '✅',
    failed: '❌',
    cancelled: '🚫',
  }

  const taskList = tasks.map((task) => {
    const emoji = statusEmoji[task.status] || '❓'
    const lines = [
      `${emoji} [${task.status}] ${task.clip?.title || '(无标题)'} → ${task.destination}`,
      `   ID: ${task.id}`,
    ]
    if (task.error)
      lines.push(`   错误: ${task.error}`)
    if (task.warning)
      lines.push(`   警告: ${task.warning}`)
    return lines.join('\n')
  }).join('\n\n')

  return {
    content: [{
      type: 'text' as const,
      text: `共 ${count} 个任务:\n\n${taskList}`,
    }],
    structuredContent: {
      tasks,
      count,
    },
  }
}
