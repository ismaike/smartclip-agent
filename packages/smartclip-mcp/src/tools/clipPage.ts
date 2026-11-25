import { BridgeAction, clipPageResultSchema, destinationSchema } from 'smartclip-bridge-protocol'
import { z } from 'zod'
import type { ToolDescriptor, ToolContext } from './defineTool.js'
import { DEFAULT_MAX_READ_LENGTH, formatMarkdownReadText } from './formatMarkdown.js'

export default {
  name: 'clip_page',
  description: '提取网页并转为 Markdown，保存到指定笔记平台（若仅需读取网页内容，建议优先使用只读工具 read_page）。',
  schema: {
    tabId: z.number().optional().describe('标签页ID，默认当前标签页'),
    url: z.string().url().optional().describe('网页URL，自动打开并剪藏'),
    destination: destinationSchema
      .optional()
      .describe('保存目标。不传则仅返回 Markdown 不保存'),
    mode: z.enum(['full', 'selection']).default('full').describe('full=全页, selection=选区'),
    maxLength: z.number().int().min(1000).max(500000).default(DEFAULT_MAX_READ_LENGTH)
      .describe('未指定 destination 时返回 Markdown 的最大字符数，默认 50000'),
  },
  outputSchema: clipPageResultSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  errorLabel: '剪藏失败',
  async execute(args: {
    tabId?: number
    url?: string
    destination?: z.infer<typeof destinationSchema>
    mode: 'full' | 'selection'
    maxLength?: number
  }, { invoke }: ToolContext) {
    const r = await invoke(BridgeAction.CLIP_PAGE, {
      tabId: args.tabId,
      url: args.url,
      destination: args.destination,
      mode: args.mode,
    })

    const resolvedUrl = r.url || args.url || ''
    const saved = Boolean(args.destination)

    let text: string
    if (saved) {
      const titleLine = r.title ? `标题: ${r.title}` : null
      const urlLine = resolvedUrl ? `URL: ${resolvedUrl}` : null
      const taskId = r.taskId ? ` (task:${r.taskId})` : ''
      const warning = r.warning ? ` ⚠ ${r.warning}` : ''
      const mdInfo = r.markdown ? ` [${r.markdown.length}字]` : ''
      text = [
        `已保存到 ${args.destination}${taskId}${warning}${mdInfo}`,
        titleLine,
        urlLine,
      ].filter(Boolean).join('\n')
    }
    else {
      // 未传 destination 时，直接在 content[].text 返回正文，确保只读取 text 的客户端可用
      text = formatMarkdownReadText({
        url: resolvedUrl,
        title: r.title,
        markdown: r.markdown,
        warning: r.warning,
        maxLength: args.maxLength,
      }).text
    }

    return {
      text,
      structured: {
        url: resolvedUrl,
        title: r.title,
        markdown: r.markdown,
        saved,
        destination: args.destination,
        taskId: r.taskId,
        warning: r.warning,
        createdTabId: r.createdTabId,
        clip: r.clip,
      },
    }
  },
} satisfies ToolDescriptor
