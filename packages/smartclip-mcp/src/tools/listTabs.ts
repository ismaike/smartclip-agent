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
  async execute(_args: unknown, { invoke }: ToolContext) {
    const { tabs, count } = await invoke(BridgeAction.LIST_TABS)

    const tabList = tabs.map(tab =>
      `[${tab.active ? '★' : ' '}] Tab ${tab.id}: ${tab.title}\n    URL: ${tab.url}`,
    ).join('\n\n')

    return {
      text: count > 0
        ? `${count} 个标签页:\n\n${tabList}`
        : '没有打开的标签页',
      structured: { tabs, count },
    }
  },
} satisfies ToolDescriptor
