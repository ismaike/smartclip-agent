import { z } from 'zod'
import type { NativeMessagingBridge } from '../bridge/nativeMessaging.js'

export const extractPageSchema = {
  tabId: z.number().describe('目标标签页 ID（通过 list_tabs 获取）。如不提供，将使用当前活动标签页。').optional(),
  mode: z.enum(['full', 'selection']).default('full').describe('提取模式：full 提取整个页面，selection 仅提取选中内容'),
}

export const extractPageDescription = '提取指定标签页的网页内容（HTML 和元数据）。返回页面标题、URL、正文 HTML、摘要等信息。这是剪藏流程的第一步。'

export async function extractPage(bridge: NativeMessagingBridge, args: { tabId?: number, mode: string }) {
  const data: any = { mode: args.mode }

  if (args.tabId) {
    data.tabId = args.tabId
  }
  else {
    // 获取当前活动标签页
    const tabsResponse = await bridge.send('list-tabs')
    if (tabsResponse.success && tabsResponse.data) {
      const activeTab = tabsResponse.data.find((t: any) => t.active)
      if (activeTab) {
        data.tabId = activeTab.id
      }
    }
  }

  if (!data.tabId) {
    return {
      content: [{ type: 'text' as const, text: '无法确定目标标签页。请提供 tabId 参数或确保浏览器中有活动标签页。' }],
      isError: true,
    }
  }

  const response = await bridge.send('extract-page', data)

  if (!response.success) {
    return {
      content: [{ type: 'text' as const, text: `内容提取失败: ${response.error}` }],
      isError: true,
    }
  }

  const clip = response.data || {}
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
  }
}
