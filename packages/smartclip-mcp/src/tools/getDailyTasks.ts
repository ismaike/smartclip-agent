import { z } from 'zod'
import type { WebSocketBridge } from '../bridge/websocketBridge.js'

export const getDailyTasksSchema = {
  status: z.enum(['pending', 'completed', 'skipped']).optional()
    .describe('按状态过滤任务。不提供则返回所有任务。'),
}

export const getDailyTasksDescription = '查看每日待剪藏任务池。返回从云端同步的待剪藏网页列表，可按状态过滤（pending/completed/skipped）。用于了解今天有哪些网页需要剪藏。'

export async function getDailyTasks(bridge: WebSocketBridge, args: { status?: string }) {
  const response = await bridge.send('get-daily-tasks', { status: args.status })

  if (!response.success) {
    return {
      content: [{ type: 'text' as const, text: `获取每日任务列表失败: ${response.error}` }],
      isError: true,
    }
  }

  const tasks = response.data || []
  if (tasks.length === 0) {
    return {
      content: [{
        type: 'text' as const,
        text: args.status
          ? `没有状态为 "${args.status}" 的每日任务`
          : '每日任务池为空',
      }],
    }
  }

  const statusEmoji: Record<string, string> = {
    pending: '📋',
    completed: '✅',
    skipped: '⏭️',
  }

  const taskList = tasks.map((task: any) => {
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
    content: [{
      type: 'text' as const,
      text: `共 ${tasks.length} 个每日任务:\n\n${taskList}`,
    }],
    structuredContent: {
      tasks,
      count: tasks.length,
      lastSyncAt: response.lastSyncAt,
    },
  }
}
