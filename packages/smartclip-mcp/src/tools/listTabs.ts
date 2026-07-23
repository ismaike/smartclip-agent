import { BridgeAction } from 'smartclip-bridge-protocol'
import type { ToolDescriptor, ToolContext } from './defineTool.js'

export default {
  name: 'list_tabs',
  description: '列出浏览器所有标签页。',
  schema: {},
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
  },
  errorLabel: '获取标签页列表失败',
  async execute(_args: unknown, { send }: ToolContext) {
    const r = await send(BridgeAction.LIST_TABS)
    const tabs = (r.data || []) as any[]
    const tabList = (tabs as any[]).map(tab =>
      `[${tab.active ? '★' : ' '}] Tab ${tab.id}: ${tab.title}\n    URL: ${tab.url}`,
    ).join('\n\n')

    return {
      text: tabs.length > 0
        ? `${tabs.length} 个标签页:\n\n${tabList}`
        : '没有打开的标签页',
      structured: {
        tabs,
        count: (tabs as any[]).length,
      },
    }
  },
} satisfies ToolDescriptor
