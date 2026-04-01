import { describe, expect, it } from 'vitest'
import {
  clipAllDailyTasksResultSchema,
  clipPageResultSchema,
  getDailyTasksResultSchema,
  getTasksResultSchema,
  listTabsResultSchema,
} from 'smartclip-bridge-protocol'
import { listTabs } from '../listTabs.js'
import { getTasks } from '../getTasks.js'
import { getDailyTasks } from '../getDailyTasks.js'
import { clipAllDailyTasks } from '../clipAllDailyTasks.js'
import { clipPage } from '../clipPage.js'

function createBridge(responseMap: Record<string, any>) {
  return {
    async send(action: string) {
      return responseMap[action]
    },
  } as any
}

describe('structured MCP outputs', () => {
  it('returns structured tab data from listTabs', async () => {
    const result = await listTabs(createBridge({
      'list-tabs': {
        success: true,
        data: [{ id: 123, title: 'Example', url: 'https://example.com', active: true, windowId: 1 }],
      },
    }))

    expect(result.content[0].text).toContain('Tab 123')
    expect(() => listTabsResultSchema.parse(result.structuredContent)).not.toThrow()
  })

  it('returns structured task data from getTasks', async () => {
    const result = await getTasks(createBridge({
      'get-tasks': {
        success: true,
        data: [{ id: 'task-1', status: 'queued', destination: 'markdown', clip: { title: 'Example' } }],
      },
    }), {})

    expect(() => getTasksResultSchema.parse(result.structuredContent)).not.toThrow()
    expect(result.structuredContent?.count).toBe(1)
  })

  it('returns structured daily task data from getDailyTasks', async () => {
    const result = await getDailyTasks(createBridge({
      'get-daily-tasks': {
        success: true,
        data: [{ id: 'daily-1', title: 'Read', url: 'https://example.com', status: 'pending' }],
        lastSyncAt: 123,
      },
    }), {})

    expect(() => getDailyTasksResultSchema.parse(result.structuredContent)).not.toThrow()
    expect(result.structuredContent?.lastSyncAt).toBe(123)
  })

  it('returns structured batch results from clipAllDailyTasks', async () => {
    const result = await clipAllDailyTasks(createBridge({
      'clip-all-daily-tasks': {
        success: true,
        data: {
          total: 2,
          succeeded: 1,
          failed: 1,
          results: [
            { taskId: '1', title: 'A', url: 'https://a.com', success: true },
            { taskId: '2', title: 'B', url: 'https://b.com', success: false, error: 'boom' },
          ],
        },
      },
    }), { mode: 'full', closeTab: true })

    expect(() => clipAllDailyTasksResultSchema.parse(result.structuredContent)).not.toThrow()
    expect(result.structuredContent?.summary.total).toBe(2)
    expect(result.structuredContent?.results[1].success).toBe(false)
  })

  it('returns structured clipPage result', async () => {
    const result = await clipPage(createBridge({
      'clip-page': {
        success: true,
        markdown: '# Example',
        clip: { url: 'https://example.com', title: 'Example' },
        taskId: 'task-1',
      },
    }), { mode: 'full', destination: 'markdown' })

    expect(() => clipPageResultSchema.parse(result.structuredContent)).not.toThrow()
    expect(result.structuredContent?.saved).toBe(true)
  })
})
