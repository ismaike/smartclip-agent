import { describe, it, expect } from 'vitest'
import { BridgeAction } from '../actions.js'
import type { BridgeSuccess } from '../messages.js'
import { bridgeActionContracts, prepareInput, normalizeResult } from '../index.js'
import { BridgeContractError } from '../bridgeErrors.js'

// ─── 注册表完整性 ────────────────────────────────────────────

describe('bridgeActionContracts registry', () => {
  it('covers every BridgeAction', () => {
    const allActions = Object.values(BridgeAction)
    for (const action of allActions) {
      expect(bridgeActionContracts[action], `missing contract for ${action}`).toBeDefined()
    }
  })
})

// ─── prepareInput ────────────────────────────────────────────

describe('prepareInput', () => {
  it('passes valid SAVE_CLIP payload', () => {
    const input = prepareInput(BridgeAction.SAVE_CLIP, {
      clip: { url: 'https://example.com' },
      destination: 'obsidian',
    })
    expect(input.clip.url).toBe('https://example.com')
    expect(input.destination).toBe('obsidian')
  })

  it('passes valid CLIP_DAILY_TASK payload', () => {
    const input = prepareInput(BridgeAction.CLIP_DAILY_TASK, {
      taskId: 'task-1',
      mode: 'full',
      closeTab: true,
    })
    expect(input.taskId).toBe('task-1')
  })

  it('accepts undefined for void-input actions', () => {
    expect(prepareInput(BridgeAction.LIST_TABS, undefined)).toBeUndefined()
    expect(prepareInput(BridgeAction.GET_STATUS, undefined)).toBeUndefined()
    expect(prepareInput(BridgeAction.GET_VOCABULARY, undefined)).toBeUndefined()
  })

  it('rejects missing required fields (fail closed)', () => {
    expect(() =>
      prepareInput(BridgeAction.SAVE_CLIP, { destination: 'obsidian' }),
    ).toThrow(BridgeContractError)
  })

  it('rejects invalid destination enum', () => {
    expect(() =>
      prepareInput(BridgeAction.SAVE_CLIP, { clip: { url: 'https://x.com' }, destination: 'invalid' }),
    ).toThrow(BridgeContractError)
  })

  it('preserves unknown fields (passthrough)', () => {
    const input = prepareInput(BridgeAction.EXTRACT_PAGE, {
      tabId: 1,
      mode: 'full',
      unknownField: 'value',
    }) as Record<string, unknown>
    expect(input.unknownField).toBe('value')
  })
})

// ─── normalizeResult ─────────────────────────────────────────

describe('normalizeResult', () => {
  // LIST_TABS — 裸数组 → { tabs, count }
  it('normalizes LIST_TABS bare array to { tabs, count }', () => {
    const env = { id: '1', success: true as const, data: [
      { id: 1, url: 'https://a.com', title: 'A', active: true, windowId: 1 },
      { id: 2, url: 'https://b.com', title: 'B', active: false, windowId: 1 },
    ] }
    const result = normalizeResult(BridgeAction.LIST_TABS, env)
    expect(result.tabs).toHaveLength(2)
    expect(result.count).toBe(2)
  })

  it('normalizes LIST_TABS empty/missing data', () => {
    const env = { id: '1', success: true as const }
    const result = normalizeResult(BridgeAction.LIST_TABS, env)
    expect(result.tabs).toHaveLength(0)
    expect(result.count).toBe(0)
  })

  // CONVERT_TO_MARKDOWN — 历史兼容：顶层 vs data 嵌套
  it('normalizes CONVERT_TO_MARKDOWN from data (new shape)', () => {
    const env = { id: '1', success: true as const, data: { markdown: '# Hi', frontMatter: { tags: ['a'] } } }
    const result = normalizeResult(BridgeAction.CONVERT_TO_MARKDOWN, env)
    expect(result.markdown).toBe('# Hi')
    expect(result.frontMatter).toEqual({ tags: ['a'] })
  })

  it('normalizes CONVERT_TO_MARKDOWN from envelope top level (legacy shape)', () => {
    const env = { id: '1', success: true as const, markdown: '# Legacy', frontMatter: { source: 'old' } }
    const result = normalizeResult(BridgeAction.CONVERT_TO_MARKDOWN, env)
    expect(result.markdown).toBe('# Legacy')
    expect(result.frontMatter).toEqual({ source: 'old' })
  })

  it('normalizes CONVERT_TO_MARKDOWN with missing markdown to empty string', () => {
    const env = { id: '1', success: true as const }
    const result = normalizeResult(BridgeAction.CONVERT_TO_MARKDOWN, env)
    expect(result.markdown).toBe('')
    expect(result.frontMatter).toBeNull()
  })

  // SAVE_CLIP — saved: true on success
  it('normalizes SAVE_CLIP with taskId and warning from envelope', () => {
    const env = { id: '1', success: true as const, taskId: 'task-99', warning: 'rate limited' }
    const result = normalizeResult(BridgeAction.SAVE_CLIP, env)
    expect(result.saved).toBe(true)
    expect(result.taskId).toBe('task-99')
    expect(result.warning).toBe('rate limited')
  })

  it('normalizes SAVE_CLIP with missing taskId/warning to null', () => {
    const env = { id: '1', success: true as const }
    const result = normalizeResult(BridgeAction.SAVE_CLIP, env)
    expect(result.taskId).toBeNull()
    expect(result.warning).toBeNull()
  })

  // GET_DAILY_TASKS — 历史兼容：裸数组 vs { tasks } 对象
  it('normalizes GET_DAILY_TASKS from bare array (legacy)', () => {
    const env = { id: '1', success: true as const, data: [
      { id: 'd1', title: 'Task 1', url: 'https://a.com', status: 'pending' },
    ], lastSyncAt: 123 }
    const result = normalizeResult(BridgeAction.GET_DAILY_TASKS, env)
    expect(result.tasks).toHaveLength(1)
    expect(result.count).toBe(1)
    expect(result.lastSyncAt).toBe(123)
  })

  it('normalizes GET_DAILY_TASKS from { tasks } object (new shape)', () => {
    const env = { id: '1', success: true as const, data: {
      tasks: [
        { id: 'd1', title: 'Task 1', url: 'https://a.com', status: 'completed' },
        { id: 'd2', title: 'Task 2', url: 'https://b.com', status: 'skipped' },
      ],
    }, lastSyncAt: 456 }
    const result = normalizeResult(BridgeAction.GET_DAILY_TASKS, env)
    expect(result.tasks).toHaveLength(2)
    expect(result.count).toBe(2)
  })

  // CLIP_PAGE — 散落字段
  it('normalizes CLIP_PAGE from scattered envelope fields', () => {
    const env = { id: '1', success: true as const, markdown: '# Page', clip: { url: 'https://x.com', title: 'X' }, taskId: 't1', warning: 'partial' }
    const result = normalizeResult(BridgeAction.CLIP_PAGE, env)
    expect(result.url).toBe('https://x.com')
    expect(result.title).toBe('X')
    expect(result.markdown).toBe('# Page')
    expect(result.taskId).toBe('t1')
    expect(result.warning).toBe('partial')
  })

  // CLIP_DAILY_TASK — data + 顶层合并
  it('normalizes CLIP_DAILY_TASK merging data and top-level fields', () => {
    const env = { id: '1', success: true as const, data: { title: 'Daily', url: 'https://d.com' }, taskId: 'task-1', warning: 'slow' }
    const result = normalizeResult(BridgeAction.CLIP_DAILY_TASK, env)
    expect(result.title).toBe('Daily')
    expect(result.url).toBe('https://d.com')
    expect(result.taskId).toBe('task-1')
    expect(result.warning).toBe('slow')
  })

  // CLIP_ALL_DAILY_TASKS
  it('normalizes CLIP_ALL_DAILY_TASKS with summary and results', () => {
    const env = { id: '1', success: true as const, data: {
      total: 3, succeeded: 2, failed: 1,
      results: [
        { taskId: '1', title: 'A', url: 'https://a.com', success: true },
        { taskId: '2', title: 'B', url: 'https://b.com', success: false, error: 'boom' },
      ],
    } }
    const result = normalizeResult(BridgeAction.CLIP_ALL_DAILY_TASKS, env)
    expect(result.summary.total).toBe(3)
    expect(result.summary.succeeded).toBe(2)
    expect(result.results).toHaveLength(2)
    expect(result.results[1].success).toBe(false)
  })

  // GET_VOCABULARY
  it('normalizes GET_VOCABULARY with words, count, enabled', () => {
    const env = { id: '1', success: true as const, data: {
      enabled: true,
      words: [{ word: 'ephemeral', definition: 'lasting briefly' }],
    } }
    const result = normalizeResult(BridgeAction.GET_VOCABULARY, env)
    expect(result.enabled).toBe(true)
    expect(result.words).toHaveLength(1)
    expect(result.count).toBe(1)
  })

  // GET_STATUS — passthrough data
  it('normalizes GET_STATUS from data', () => {
    const env = { id: '1', success: true as const, data: {
      serverListening: true,
      extensionConnected: true,
      mcpEnabled: true,
      pro: true,
      protocolVersion: '1',
      extensionVersion: '0.0.6',
    } }
    const result = normalizeResult(BridgeAction.GET_STATUS, env)
    expect(result.extensionConnected).toBe(true)
    expect(result.pro).toBe(true)
  })

  // EXTRACT_PAGE — passthrough data
  it('normalizes EXTRACT_PAGE from data object', () => {
    const env = { id: '1', success: true as const, data: {
      url: 'https://x.com', title: 'X', contentHtml: '<p>hi</p>',
    } }
    const result = normalizeResult(BridgeAction.EXTRACT_PAGE, env)
    expect(result.url).toBe('https://x.com')
    expect(result.title).toBe('X')
  })

  // GET_TASKS — 裸数组
  it('normalizes GET_TASKS from bare array', () => {
    const env = { id: '1', success: true as const, data: [
      { id: 't1', status: 'queued', destination: 'markdown', clip: { title: 'X' } },
    ] }
    const result = normalizeResult(BridgeAction.GET_TASKS, env)
    expect(result.tasks).toHaveLength(1)
    expect(result.count).toBe(1)
  })
})

// ─── fail closed ─────────────────────────────────────────────

describe('normalizeResult fail-closed behavior', () => {
  it('rejects LIST_TABS result with wrong tab type', () => {
    const env = { id: '1', success: true as const, data: [{ id: 'not-a-number' }] }
    expect(() => normalizeResult(BridgeAction.LIST_TABS, env)).toThrow(BridgeContractError)
  })

  it('rejects GET_STATUS with malformed status data', () => {
    const env = { id: '1', success: true as const, data: 'not-an-object' }
    expect(() => normalizeResult(BridgeAction.GET_STATUS, env)).toThrow(BridgeContractError)
  })

  it('rejects CLIP_DAILY_TASK with missing taskId（不静默补空串）', () => {
    const env = { id: '1', success: true as const, data: { title: 'Daily', url: 'https://d.com' } }
    expect(() => normalizeResult(BridgeAction.CLIP_DAILY_TASK, env)).toThrow(BridgeContractError)
  })
  it('rejects CLIP_PAGE with missing clip.url（不静默补空串）', () => {
    const env = { id: '1', success: true as const, markdown: '# Page' }
    expect(() => normalizeResult(BridgeAction.CLIP_PAGE, env)).toThrow(BridgeContractError)
  })
})

// ─── createBridgeInvoker 集成 ─────────────────────────────────

import { createBridgeInvoker } from '../bridgeInvoker.js'
import { BridgeActionRejection, BridgeConnectionError } from '../bridgeErrors.js'

describe('createBridgeInvoker', () => {
  it('returns normalized result for LIST_TABS', async () => {
    const invoker = createBridgeInvoker({
      async send() {
        return { id: '1', success: true, data: [{ id: 1, url: 'https://x.com', title: 'X', active: true, windowId: 1 }] }
      },
    })
    const result = await invoker.invoke(BridgeAction.LIST_TABS)
    expect(result.tabs).toHaveLength(1)
  })

  it('throws BridgeActionRejection on success:false', async () => {
    const invoker = createBridgeInvoker({
      async send() {
        return { id: '1', success: false, error: 'nope' }
      },
    })
    await expect(invoker.invoke(BridgeAction.LIST_TABS)).rejects.toThrow(BridgeActionRejection)
  })

  it('throws BridgeConnectionError on transport throw', async () => {
    const invoker = createBridgeInvoker({
      async send() { throw new Error('timeout') },
    })
    await expect(invoker.invoke(BridgeAction.LIST_TABS)).rejects.toThrow(BridgeConnectionError)
  })

  it('passes validated input to transport', async () => {
    let receivedAction: string | undefined
    let receivedData: unknown
    const invoker = createBridgeInvoker({
      async send(action, data) {
        receivedAction = action
        receivedData = data
        return { id: '1', success: true, data: { markdown: 'ok', frontMatter: null } }
      },
    })
    await invoker.invoke(BridgeAction.CONVERT_TO_MARKDOWN, { html: '<p>hi</p>', url: 'https://x.com' })
    expect(receivedAction).toBe(BridgeAction.CONVERT_TO_MARKDOWN)
    expect(receivedData).toMatchObject({ html: '<p>hi</p>', url: 'https://x.com' })
  })
})
