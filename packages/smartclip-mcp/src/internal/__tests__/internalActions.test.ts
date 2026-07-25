import { describe, expect, it } from 'vitest'
import { BridgeAction } from 'smartclip-bridge-protocol'
import { extractPage } from '../extractPage.js'
import { convertToMarkdown } from '../convertToMarkdown.js'
import { getTasks } from '../getTasks.js'
import { mockInvoke } from '../../__tests__/mockInvoke.js'

describe('internal actions via invoke', () => {
  it('extractPage returns structured content from EXTRACT_PAGE result', async () => {
    const invoke = mockInvoke({
      [BridgeAction.EXTRACT_PAGE]: {
        url: 'https://example.com',
        title: 'Example',
        site: 'example.com',
        excerpt: 'An example page',
        contentHtml: '<p>Hello</p>',
      },
    })

    const result = await extractPage(invoke, { tabId: 1, mode: 'full' })

    expect(result.isError).toBeFalsy()
    expect(result.structuredContent?.url).toBe('https://example.com')
    expect(result.structuredContent?.title).toBe('Example')
    expect(result.structuredContent?.html).toBe('<p>Hello</p>')
  })

  it('extractPage auto-detects active tab via LIST_TABS when no tabId', async () => {
    const invoke = mockInvoke({
      [BridgeAction.LIST_TABS]: {
        tabs: [
          { id: 10, url: 'https://inactive.com', title: 'Inactive', active: false, windowId: 1 },
          { id: 20, url: 'https://active.com', title: 'Active', active: true, windowId: 1 },
        ],
        count: 2,
      },
      [BridgeAction.EXTRACT_PAGE]: {
        url: 'https://active.com',
        title: 'Active',
        contentHtml: '<p>Active content</p>',
      },
    })

    const result = await extractPage(invoke, { mode: 'full' })

    expect(result.structuredContent?.url).toBe('https://active.com')
  })

  it('extractPage reports error when no tabId and no active tab', async () => {
    const invoke = mockInvoke({
      [BridgeAction.LIST_TABS]: {
        tabs: [
          { id: 10, url: 'https://x.com', title: 'X', active: false, windowId: 1 },
        ],
        count: 1,
      },
    })

    const result = await extractPage(invoke, { mode: 'full' })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('无法确定目标标签页')
  })

  it('convertToMarkdown returns markdown from CONVERT_TO_MARKDOWN result', async () => {
    const invoke = mockInvoke({
      [BridgeAction.CONVERT_TO_MARKDOWN]: {
        markdown: '# Hello World',
        frontMatter: { tags: ['test'] },
      },
    })

    const result = await convertToMarkdown(invoke, { html: '<h1>Hello World</h1>', url: 'https://x.com' })

    expect(result.content[0].text).toBe('# Hello World')
    expect(result.structuredContent?.markdown).toBe('# Hello World')
    expect(result.structuredContent?.frontMatter).toEqual({ tags: ['test'] })
  })

  it('convertToMarkdown handles empty markdown result', async () => {
    const invoke = mockInvoke({
      [BridgeAction.CONVERT_TO_MARKDOWN]: {
        markdown: '',
        frontMatter: null,
      },
    })

    const result = await convertToMarkdown(invoke, { html: '<p></p>' })

    expect(result.content[0].text).toBe('(转换结果为空)')
  })

  it('getTasks returns structured task data', async () => {
    const invoke = mockInvoke({
      [BridgeAction.GET_TASKS]: {
        tasks: [
          { id: 't1', status: 'queued', destination: 'markdown', clip: { title: 'Task 1' } },
          { id: 't2', status: 'succeeded', destination: 'obsidian', clip: { title: 'Task 2' } },
        ],
        count: 2,
      },
    })

    const result = await getTasks(invoke, {})

    expect(result.structuredContent?.count).toBe(2)
    expect(result.content[0].text).toContain('Task 1')
    expect(result.content[0].text).toContain('Task 2')
  })

  it('getTasks handles empty queue', async () => {
    const invoke = mockInvoke({
      [BridgeAction.GET_TASKS]: { tasks: [], count: 0 },
    })

    const result = await getTasks(invoke, {})

    expect(result.structuredContent).toBeUndefined()
    expect(result.content[0].text).toContain('任务队列为空')
  })
})
