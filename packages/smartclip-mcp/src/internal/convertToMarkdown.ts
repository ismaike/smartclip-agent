import { BridgeAction } from 'smartclip-bridge-protocol'
import type { BridgeInvoker } from 'smartclip-bridge-protocol'
import { z } from 'zod'

export const convertToMarkdownSchema = {
  html: z.string().describe('要转换的 HTML 内容'),
  url: z.string().default('').describe('原始页面 URL（用于解析相对链接）'),
}

export const convertToMarkdownDescription = '将 HTML 内容转换为 Markdown 格式。使用 SmartClip 内置的 Turndown 转换引擎，支持表格、代码块、图片等复杂格式。'

export async function convertToMarkdown(invoke: BridgeInvoker['invoke'], args: { html: string, url?: string }) {
  const { markdown, frontMatter } = await invoke(BridgeAction.CONVERT_TO_MARKDOWN, {
    html: args.html,
    url: args.url ?? '',
    clip: { url: args.url ?? '' },
  })

  return {
    content: [{
      type: 'text' as const,
      text: markdown || '(转换结果为空)',
    }],
    structuredContent: {
      markdown: markdown || '',
      frontMatter: frontMatter || null,
    },
  }
}
