import { describe, it, expect } from 'vitest'
import { BridgeAction } from 'smartclip-bridge-protocol'
import { tools } from '../tools/index.js'

/**
 * Contract test: 确保 BridgeAction 协议与 MCP 工具注册表保持一致。
 * 注册表（tools/index.ts）是单一事实源，不再解析 index.ts 源码。
 */

// 扩展内部 action——存在于协议枚举中但有意不暴露为 MCP 工具
const extensionOnlyActions: string[] = [
  BridgeAction.EXTRACT_PAGE,
  BridgeAction.CONVERT_TO_MARKDOWN,
  BridgeAction.GET_TASKS,
]

// snake_case 工具名 → kebab-case BridgeAction
function toolToAction(toolName: string): string {
  return toolName.replace(/_/g, '-')
}

function getAllActions(): string[] {
  return Object.values(BridgeAction)
}

const registeredActions = tools.map(t => toolToAction(t.name))

describe('bridge protocol ↔ MCP tool contract', () => {
  it('every BridgeAction is either an MCP tool or explicitly marked extension-only', () => {
    const allActions = getAllActions()

    for (const action of allActions) {
      const isMcpTool = registeredActions.includes(action)
      const isExtensionOnly = extensionOnlyActions.includes(action)

      expect(
        isMcpTool || isExtensionOnly,
        `BridgeAction "${action}" is not in the tool registry and not marked extension-only. ` +
        `Add it to tools/index.ts or extensionOnlyActions.`,
      ).toBe(true)
    }
  })

  it('registered MCP tool names map to valid BridgeAction values', () => {
    const allActionValues = new Set<string>(getAllActions())

    for (const action of registeredActions) {
      expect(
        allActionValues.has(action),
        `MCP tool maps to action "${action}" which is not a valid BridgeAction.`,
      ).toBe(true)
    }
  })

  it('critical tools are always registered', () => {
    const critical = [
      toolToAction('clip_page'),
      toolToAction('get_status'),
      toolToAction('get_daily_tasks'),
      toolToAction('list_tabs'),
      toolToAction('save_clip'),
    ]

    for (const action of critical) {
      expect(registeredActions).toContain(action)
    }
  })

  it('every tool in the registry has required descriptor fields', () => {
    for (const tool of tools) {
      expect(tool.name, `tool missing name`).toBeTruthy()
      expect(tool.description, `tool "${tool.name}" missing description`).toBeTruthy()
      expect(tool.errorLabel, `tool "${tool.name}" missing errorLabel`).toBeTruthy()
      expect(typeof tool.execute, `tool "${tool.name}" missing execute`).toBe('function')
    }
  })
})
