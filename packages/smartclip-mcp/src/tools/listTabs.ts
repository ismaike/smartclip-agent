import type { WebSocketBridge } from '../bridge/websocketBridge.js'

export const listTabsSchema = {}

export const listTabsDescription = '列出当前 Chrome 浏览器中打开的所有标签页，返回每个标签页的 ID、URL、标题等信息。用于确定要剪藏的目标页面。'

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
        ? `找到 ${tabs.length} 个标签页:\n\n${tabList}`
        : '没有找到打开的标签页',
    }],
    structuredContent: {
      tabs,
      count: tabs.length,
    },
  }
}
