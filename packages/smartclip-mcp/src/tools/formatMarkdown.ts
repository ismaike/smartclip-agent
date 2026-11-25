/**
 * 将网页读取得到的 Markdown 与元数据格式化为纯文本输出，
 * 确保仅消费 content[].text 的 MCP 客户端也能完整获得正文内容。
 */

export const DEFAULT_MAX_READ_LENGTH = 50_000

export interface FormatMarkdownReadOptions {
  url?: string
  title?: string
  markdown?: string
  warning?: string
  maxLength?: number
}

export interface FormattedMarkdownRead {
  text: string
  markdown: string
  totalLength: number
  truncated: boolean
}

export function formatMarkdownReadText(options: FormatMarkdownReadOptions): FormattedMarkdownRead {
  const fullMarkdown = options.markdown ?? ''
  const totalLength = fullMarkdown.length
  const maxLength = options.maxLength ?? DEFAULT_MAX_READ_LENGTH
  const truncated = totalLength > maxLength
  const deliveredMarkdown = truncated ? fullMarkdown.slice(0, maxLength) : fullMarkdown

  const headerLines = [
    options.title ? `标题: ${options.title}` : null,
    options.url ? `URL: ${options.url}` : null,
    `字数: ${totalLength}${truncated ? `（已按 maxLength=${maxLength} 截断展示）` : ''}`,
    options.warning ? `⚠ ${options.warning}` : null,
  ].filter(Boolean)

  const body = deliveredMarkdown.length > 0
    ? deliveredMarkdown
    : '(页面正文为空，可能需要等待动态内容加载或在浏览器中选中目标区域后重试)'

  const footer = truncated
    ? `\n\n[提示: 原文共 ${totalLength} 字符，当前仅返回前 ${maxLength} 字符。如需更多内容，可增大 maxLength 参数。]`
    : ''

  return {
    text: `${headerLines.join('\n')}\n\n---\n\n${body}${footer}`,
    markdown: deliveredMarkdown,
    totalLength,
    truncated,
  }
}
