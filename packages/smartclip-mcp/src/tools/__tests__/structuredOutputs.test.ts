import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  BridgeAction,
  clipAllDailyTasksResultSchema,
  clipPageResultSchema,
  getDailyTasksResultSchema,
  listTabsResultSchema,
} from 'smartclip-bridge-protocol'
import { tools } from '../index.js'
import listTabsTool from '../listTabs.js'
import readPageTool from '../readPage.js'
import getDailyTasksTool from '../getDailyTasks.js'
import getStatusTool from '../getStatus.js'
import getVocabularyTool from '../getVocabulary.js'
import clipAllDailyTasksTool from '../clipAllDailyTasks.js'
import clipPageTool from '../clipPage.js'
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

  it('returns full markdown text and structured data from readPage', async () => {
    const result = await readPageTool.execute({ mode: 'full' }, {
      invoke: mockInvoke({
        [BridgeAction.CLIP_PAGE]: {
          url: 'https://example.com/article',
          title: 'Article Title',
          markdown: '# Heading\n\nBody paragraph.',
        },
      }),
    })

    expect(result.text).toContain('# Heading')
    expect(result.text).toContain('Body paragraph.')
    expect(result.text).toContain('Article Title')
    expect(result.structured).toEqual({
      url: 'https://example.com/article',
      title: 'Article Title',
      markdown: '# Heading\n\nBody paragraph.',
      totalLength: 26,
      truncated: false,
      warning: null,
      createdTabId: null,
    })
  })

  it('truncates readPage text and structured markdown when exceeding maxLength', async () => {
    const longMarkdown = 'A'.repeat(2500)
    const result = await readPageTool.execute({ mode: 'full', maxLength: 1000 }, {
      invoke: mockInvoke({
        [BridgeAction.CLIP_PAGE]: {
          url: 'https://example.com/long',
          title: 'Long',
          markdown: longMarkdown,
        },
      }),
    })

    expect(result.structured?.truncated).toBe(true)
    expect(result.structured?.totalLength).toBe(2500)
    expect((result.structured?.markdown as string).length).toBe(1000)
    expect(result.text).toContain('截断')
  })

  it('returns markdown text from clipPage when destination is omitted', async () => {
    const result = await clipPageTool.execute({ mode: 'full' }, {
      invoke: mockInvoke({
        [BridgeAction.CLIP_PAGE]: {
          url: 'https://example.com',
          title: 'Example',
          markdown: '# Example\n\nReadable content',
        },
      }),
    })

    expect(result.text).toContain('# Example')
    expect(result.text).toContain('Readable content')
    expect(result.structured?.saved).toBe(false)
    expect(() => clipPageResultSchema.parse(result.structured)).not.toThrow()
  })

  it('returns structured clipPage result when destination is provided', async () => {
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

    expect(result.text).toContain('已保存到 markdown')
    expect(result.structured?.saved).toBe(true)
    expect(result.structured?.title).toBe('Example')
    expect(() => clipPageResultSchema.parse(result.structured)).not.toThrow()
  })

  it('returns structured daily task data from getDailyTasks (including empty list)', async () => {
    const populated = await getDailyTasksTool.execute({ status: undefined }, {
      invoke: mockInvoke({
        [BridgeAction.GET_DAILY_TASKS]: {
          tasks: [{ id: 'daily-1', title: 'Read', url: 'https://example.com', status: 'pending' }],
          count: 1,
          lastSyncAt: 123,
        },
      }),
    })

    expect(populated.structured?.count).toBe(1)
    expect(populated.structured?.lastSyncAt).toBe(123)
    expect(() => getDailyTasksResultSchema.parse(populated.structured)).not.toThrow()

    const empty = await getDailyTasksTool.execute({ status: 'pending' }, {
      invoke: mockInvoke({
        [BridgeAction.GET_DAILY_TASKS]: {
          tasks: [],
          count: 0,
          lastSyncAt: 456,
        },
      }),
    })

    expect(empty.structured).toEqual({ tasks: [], count: 0, lastSyncAt: 456 })
    expect(() => getDailyTasksResultSchema.parse(empty.structured)).not.toThrow()
  })

  it('returns structured vocabulary data even when empty', async () => {
    const empty = await getVocabularyTool.execute({}, {
      invoke: mockInvoke({
        [BridgeAction.GET_VOCABULARY]: {
          words: [],
          count: 0,
          enabled: false,
        },
      }),
    })

    expect(empty.structured).toEqual({ enabled: false, words: [], count: 0 })
  })

  it('returns structured batch results from clipAllDailyTasks (including empty)', async () => {
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

    const empty = await clipAllDailyTasksTool.execute({ mode: 'full', closeTab: true }, {
      invoke: mockInvoke({
        [BridgeAction.CLIP_ALL_DAILY_TASKS]: {
          summary: { total: 0, succeeded: 0, failed: 0 },
          results: [],
        },
      }),
    })

    expect(empty.structured).toEqual({
      summary: { total: 0, succeeded: 0, failed: 0 },
      results: [],
    })
    expect(() => clipAllDailyTasksResultSchema.parse(empty.structured)).not.toThrow()
  })

  it('defines outputSchema on all 9 tools and validates getStatus output', async () => {
    expect(tools).toHaveLength(9)
    for (const tool of tools) {
      expect(tool.outputSchema, `${tool.name} should define outputSchema`).toBeDefined()
    }

    const result = await getStatusTool.execute({}, {
      invoke: mockInvoke({
        [BridgeAction.GET_STATUS]: {
          serverListening: true,
          extensionConnected: true,
          mcpEnabled: true,
          pro: true,
          protocolVersion: '1',
          extensionVersion: '1.0.0',
          lastErrorCode: null,
          lastErrorMessage: null,
          reconnectAttempts: 0,
          nextReconnectAt: null,
          lastCloseCode: null,
          lastCloseReason: null,
          capabilities: { clipPage: true },
          clientVersion: null,
        },
      }),
    })

    const outputSchema = z.object(getStatusTool.outputSchema as Record<string, z.ZodTypeAny>)
    expect(() => outputSchema.parse(result.structured)).not.toThrow()
  })
})
