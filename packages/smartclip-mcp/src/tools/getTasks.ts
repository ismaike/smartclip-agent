import { z } from 'zod'
import type { WebSocketBridge } from '../bridge/websocketBridge.js'

export const getTasksSchema = {
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']).optional()
    .describe('按状态过滤任务。不提供则返回所有任务。'),
}

export const getTasksDescription = '查看剪藏任务队列的状态。可以查看所有任务或按状态过滤（queued/running/succeeded/failed/cancelled）。'

export async function getTasks(bridge: WebSocketBridge, args: { status?: string }) {
  const response = await bridge.send('get-tasks', { status: args.status })

  if (!response.success) {
    return {
      content: [{ type: 'text' as const, text: `获取任务列表失败: ${response.error}` }],
      isError: true,
    }
  }

  const tasks = response.data || []
  if (tasks.length === 0) {
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

  const taskList = tasks.map((task: any) => {
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
      text: `共 ${tasks.length} 个任务:\n\n${taskList}`,
    }],
    structuredContent: {
      tasks,
      count: tasks.length,
    },
  }
}
