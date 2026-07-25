import { describe, expect, it } from 'vitest'
import {
  BridgeAction,
  clipAllDailyTasksResultSchema,
  clipPageResultSchema,
  getDailyTasksResultSchema,
  getTasksResultSchema,
  listTabsResultSchema,
} from 'smartclip-bridge-protocol'
import listTabsTool from '../listTabs.js'
import getDailyTasksTool from '../getDailyTasks.js'
import clipAllDailyTasksTool from '../clipAllDailyTasks.js'
import clipPageTool from '../clipPage.js'
import { getTasks } from '../../internal/getTasks.js'
import { mockInvoke } from '../../__tests__/mockInvoke.js'

describe('structured MCP outputs', () => {
  it('returns structured tab data from listTabs', async () => {
    const result = await listTabsTool.execute({}, {
      invoke: mockInvoke({
        [BridgeAction.LIST_TABS]: {
          tabs: [{ id: 123, title: 'Example', url: 'https://example.com', active: true, windowId: 1 }],
          count: 1,
        },
      }),
    })

    expect(result.text).toContain('Tab 123')
    expect(result.structured).toMatchObject({ count: 1 })
    expect(() => listTabsResultSchema.parse(result.structured)).not.toThrow()
  })

  it('returns structured task data from getTasks', async () => {
    const result = await getTasks(mockInvoke({
      [BridgeAction.GET_TASKS]: {
        tasks: [{ id: 'task-1', status: 'queued', destination: 'markdown', clip: { title: 'Example' } }],
        count: 1,
      },
    }), {})

    expect(result.structuredContent?.count).toBe(1)
    expect(() => getTasksResultSchema.parse(result.structuredContent)).not.toThrow()
  })

  it('returns structured daily task data from getDailyTasks', async () => {
    const result = await getDailyTasksTool.execute({ status: undefined }, {
      invoke: mockInvoke({
        [BridgeAction.GET_DAILY_TASKS]: {
          tasks: [{ id: 'daily-1', title: 'Read', url: 'https://example.com', status: 'pending' }],
          count: 1,
          lastSyncAt: 123,
        },
      }),
    })

    expect(result.structured?.count).toBe(1)
    expect(result.structured?.lastSyncAt).toBe(123)
    expect(() => getDailyTasksResultSchema.parse(result.structured)).not.toThrow()
  })

  it('returns structured batch results from clipAllDailyTasks', async () => {
    const result = await clipAllDailyTasksTool.execute({ mode: 'full', closeTab: true }, {
      invoke: mockInvoke({
        [BridgeAction.CLIP_ALL_DAILY_TASKS]: {
          summary: { total: 2, succeeded: 1, failed: 1 },
          results: [
            { taskId: '1', title: 'A', url: 'https://a.com', success: true },
            { taskId: '2', title: 'B', url: 'https://b.com', success: false, error: 'boom' },
          ],
        },
      }),
    })

    expect(result.structured?.summary.total).toBe(2)
    expect(result.structured?.results[1].success).toBe(false)
    expect(() => clipAllDailyTasksResultSchema.parse(result.structured)).not.toThrow()
  })

  it('returns structured clipPage result', async () => {
    const result = await clipPageTool.execute({ mode: 'full', destination: 'markdown' }, {
      invoke: mockInvoke({
        [BridgeAction.CLIP_PAGE]: {
          url: 'https://example.com',
          title: 'Example',
          markdown: '# Example',
          taskId: 'task-1',
        },
      }),
    })

    expect(result.structured?.saved).toBe(true)
    expect(result.structured?.title).toBe('Example')
    expect(() => clipPageResultSchema.parse(result.structured)).not.toThrow()
  })
})
