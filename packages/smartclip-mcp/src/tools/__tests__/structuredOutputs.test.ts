import { describe, expect, it } from 'vitest'
import {
  clipAllDailyTasksResultSchema,
  clipPageResultSchema,
  getDailyTasksResultSchema,
  getTasksResultSchema,
  listTabsResultSchema,
} from 'smartclip-bridge-protocol'
import type { ToolContext } from '../../tools/defineTool.js'
import listTabsTool from '../listTabs.js'
import getDailyTasksTool from '../getDailyTasks.js'
import clipAllDailyTasksTool from '../clipAllDailyTasks.js'
import clipPageTool from '../clipPage.js'
import { getTasks } from '../../internal/getTasks.js'

/** mock send for converted tools（返回 success 响应，不检查 success——那是 defineTool 的职责） */
function mockSend(responseMap: Record<string, any>): ToolContext['send'] {
  return async (action: any) => responseMap[action] as any
}

/** mock bridge for legacy tools（getTasks 等未转换的工具仍用 bridge.send） */
function createBridge(responseMap: Record<string, any>) {
  return {
    async send(action: string) {
      return responseMap[action]
    },
  } as any
}

describe('structured MCP outputs', () => {
  it('returns structured tab data from listTabs', async () => {
    const result = await listTabsTool.execute({}, {
      send: mockSend({
        'list-tabs': {
          success: true,
          data: [{ id: 123, title: 'Example', url: 'https://example.com', active: true, windowId: 1 }],
        },
      }),
    })

    expect(result.text).toContain('Tab 123')
    expect(() => listTabsResultSchema.parse(result.structured)).not.toThrow()
  })

  it('returns structured task data from getTasks (legacy tool)', async () => {
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
    const result = await getDailyTasksTool.execute({ status: undefined }, {
      send: mockSend({
        'get-daily-tasks': {
          success: true,
          data: [{ id: 'daily-1', title: 'Read', url: 'https://example.com', status: 'pending' }],
          lastSyncAt: 123,
        },
      }),
    })

    expect(() => getDailyTasksResultSchema.parse(result.structured)).not.toThrow()
    expect(result.structured?.lastSyncAt).toBe(123)
  })

  it('returns structured batch results from clipAllDailyTasks', async () => {
    const result = await clipAllDailyTasksTool.execute({ mode: 'full', closeTab: true }, {
      send: mockSend({
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
      }),
    })

    expect(() => clipAllDailyTasksResultSchema.parse(result.structured)).not.toThrow()
    expect(result.structured?.summary.total).toBe(2)
    expect(result.structured?.results[1].success).toBe(false)
  })

  it('returns structured clipPage result', async () => {
    const result = await clipPageTool.execute({ mode: 'full', destination: 'markdown' }, {
      send: mockSend({
        'clip-page': {
          success: true,
          markdown: '# Example',
          clip: { url: 'https://example.com', title: 'Example' },
          taskId: 'task-1',
        },
      }),
    })

    expect(() => clipPageResultSchema.parse(result.structured)).not.toThrow()
    expect(result.structured?.saved).toBe(true)
  })
})
