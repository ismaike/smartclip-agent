import { BridgeAction } from 'smartclip-bridge-protocol'
import type { BridgeInvoker } from 'smartclip-bridge-protocol'
import { z } from 'zod'

export const extractPageSchema = {
  tabId: z.number().describe('目标标签页 ID（通过 list_tabs 获取）。如不提供，将使用当前活动标签页。').optional(),
  mode: z.enum(['full', 'selection']).default('full').describe('提取模式：full 提取整个页面，selection 仅提取选中内容'),
}

export const extractPageDescription = '提取指定标签页的网页内容（HTML 和元数据）。返回页面标题、URL、正文 HTML、摘要等信息。这是剪藏流程的第一步。'

export async function extractPage(invoke: BridgeInvoker['invoke'], args: { tabId?: number, mode: 'full' | 'selection' }) {
  let tabId = args.tabId

  if (!tabId) {
    // 获取当前活动标签页
    const { tabs } = await invoke(BridgeAction.LIST_TABS)
    const activeTab = tabs.find(t => t.active)
    if (activeTab)
      tabId = activeTab.id
  }

  if (!tabId) {
    return {
      content: [{ type: 'text' as const, text: '无法确定目标标签页。请提供 tabId 参数或确保浏览器中有活动标签页。' }],
      isError: true,
    }
  }

  const clip = await invoke(BridgeAction.EXTRACT_PAGE, { tabId, mode: args.mode })

  const summary = [
    `标题: ${clip.title || '(无标题)'}`,
    `URL: ${clip.url || '(无URL)'}`,
    `站点: ${clip.site || '(未知)'}`,
    clip.excerpt ? `摘要: ${clip.excerpt}` : null,
    clip.meta?.author ? `作者: ${clip.meta.author}` : null,
    clip.meta?.publishTime ? `发布时间: ${clip.meta.publishTime}` : null,
    `HTML 内容长度: ${clip.contentHtml?.length || 0} 字符`,
    clip.images?.length ? `图片数量: ${clip.images.length}` : null,
  ].filter(Boolean).join('\n')

  return {
    content: [{
      type: 'text' as const,
      text: `页面内容提取成功:\n\n${summary}\n\n---\n提取的 HTML 内容前 500 字符:\n${(clip.contentHtml || '').substring(0, 500)}...`,
    }],
    structuredContent: {
      url: clip.url || '',
      title: clip.title || null,
      site: clip.site || null,
      excerpt: clip.excerpt || null,
      author: clip.meta?.author || null,
      publishTime: clip.meta?.publishTime || null,
      contentHtmlLength: clip.contentHtml?.length || 0,
      imageCount: clip.images?.length || 0,
      html: clip.contentHtml || '',
    },
  }
}
