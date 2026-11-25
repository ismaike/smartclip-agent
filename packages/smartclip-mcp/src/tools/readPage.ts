import { BridgeAction } from 'smartclip-bridge-protocol'
import { z } from 'zod'
import type { ToolDescriptor, ToolContext } from './defineTool.js'
import { DEFAULT_MAX_READ_LENGTH, formatMarkdownReadText } from './formatMarkdown.js'

const readPageOutputSchema = {
  url: z.string(),
  title: z.string().nullable(),
  markdown: z.string(),
  totalLength: z.number(),
  truncated: z.boolean(),
  warning: z.string().nullable(),
  createdTabId: z.number().nullable(),
}

export default {
  name: 'read_page',
  description: '只读提取网页正文并转为 Markdown（不保存到笔记平台）。支持读取当前标签页、指定 tabId 或自动打开 URL。',
  schema: {
    tabId: z.number().optional().describe('标签页ID，默认当前活动标签页'),
    url: z.string().url().optional().describe('网页URL，自动打开并提取内容'),
    mode: z.enum(['full', 'selection']).default('full').describe('full=全页, selection=选区'),
    maxLength: z.number().int().min(1000).max(500000).default(DEFAULT_MAX_READ_LENGTH)
      .describe('返回 Markdown 的最大字符数，默认 50000'),
  },
  outputSchema: readPageOutputSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  errorLabel: '读取网页失败',
  async execute(args: {
    tabId?: number
    url?: string
    mode: 'full' | 'selection'
    maxLength?: number
  }, { invoke }: ToolContext) {
    // 只读读取：底层复用 CLIP_PAGE 但绝不传递 destination，保持与已发布扩展完全兼容
    const r = await invoke(BridgeAction.CLIP_PAGE, {
      tabId: args.tabId,
      url: args.url,
      mode: args.mode,
    })

    const resolvedUrl = r.url || args.url || ''
    const formatted = formatMarkdownReadText({
      url: resolvedUrl,
      title: r.title,
      markdown: r.markdown,
      warning: r.warning,
      maxLength: args.maxLength,
    })

    return {
      text: formatted.text,
      structured: {
        url: resolvedUrl,
        title: r.title ?? null,
        markdown: formatted.markdown,
        totalLength: formatted.totalLength,
        truncated: formatted.truncated,
        warning: r.warning ?? null,
        createdTabId: r.createdTabId ?? null,
      },
    }
  },
} satisfies ToolDescriptor
