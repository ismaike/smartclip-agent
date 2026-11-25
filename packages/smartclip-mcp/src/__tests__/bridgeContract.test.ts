import { describe, it, expect } from 'vitest'
import { BridgeAction } from 'smartclip-bridge-protocol'
import { tools } from '../tools/index.js'

/**
 * Contract test: 确保 BridgeAction 协议与 MCP 工具注册表保持一致。
 * 注册表（tools/index.ts）是单一事实源。
 */

// 扩展内部 action——存在于协议枚举中但有意不暴露为 MCP 工具
const extensionOnlyActions: string[] = [
  BridgeAction.EXTRACT_PAGE,
  BridgeAction.CONVERT_TO_MARKDOWN,
  BridgeAction.GET_TASKS,
]

// 同一 BridgeAction 的细化工具映射（如 read_page 只读封装 clip-page）
const toolActionOverrides: Record<string, string> = {
  read_page: BridgeAction.CLIP_PAGE,
}

// snake_case 工具名 → kebab-case BridgeAction
function toolToAction(toolName: string): string {
  return toolActionOverrides[toolName] ?? toolName.replace(/_/g, '-')
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
        `BridgeAction "${action}" is not in the tool registry and not marked extension-only. `
        + `Add it to tools/index.ts or extensionOnlyActions.`,
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
    const toolNames = tools.map(t => t.name)
    for (const criticalName of ['read_page', 'clip_page', 'get_status', 'get_daily_tasks', 'list_tabs', 'save_clip']) {
      expect(toolNames).toContain(criticalName)
    }
  })

  it('every tool in the registry has required descriptor fields', () => {
    for (const tool of tools) {
      expect(tool.name, 'tool missing name').toBeTruthy()
      expect(tool.description, `tool "${tool.name}" missing description`).toBeTruthy()
      expect(tool.errorLabel, `tool "${tool.name}" missing errorLabel`).toBeTruthy()
      expect(typeof tool.execute, `tool "${tool.name}" missing execute`).toBe('function')
    }
  })
})
