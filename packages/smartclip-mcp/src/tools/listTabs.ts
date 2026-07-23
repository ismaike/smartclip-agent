import type { WebSocketBridge } from '../bridge/websocketBridge.js'

export const listTabsSchema = {}

export const listTabsDescription = '列出浏览器所有标签页。'

export const listTabsAnnotations = {
  readOnlyHint: true,
  idempotentHint: true,
} as const

export async function listTabs(bridge: WebSocketBridge) {
  const response = await bridge.send('list-tabs')

  if (!response.success) {
    return {
      content: [{ type: 'text' as const, text: `获取标签页列表失败: ${response.error}` }],
      isError: true,
    }
  }

  const tabs = response.data || []
  const tabList = tabs.map((tab: any) =>
    `[${tab.active ? '★' : ' '}] Tab ${tab.id}: ${tab.title}\n    URL: ${tab.url}`,
  ).join('\n\n')

  return {
    content: [{
      type: 'text' as const,
      text: tabs.length > 0
        ? `${tabs.length} 个标签页:\n\n${tabList}`
        : '没有打开的标签页',
    }],
    structuredContent: {
      tabs,
      count: tabs.length,
    },
  }
}
