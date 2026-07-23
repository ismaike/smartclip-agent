import { describe, it, expect } from 'vitest'
import { BridgeAction } from 'smartclip-bridge-protocol'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Contract test: ensures that every BridgeAction declared in the shared
 * protocol package is either exposed as an MCP tool or explicitly annotated
 * as extension-internal (not reachable from MCP stdio clients).
 */

// 从 index.ts 源码自动提取注册的 MCP tool 名称
function extractRegisteredToolsFromSource(): string[] {
  const indexPath = path.join(__dirname, '..', 'index.ts')
  const source = fs.readFileSync(indexPath, 'utf-8')

  // 匹配 server.tool('tool_name', ...) 调用
  const toolRegex = /server\.tool\s*\(\s*['"]([^'"]+)['"]/g
  const tools: string[] = []
  let match
  while ((match = toolRegex.exec(source)) !== null) {
    tools.push(match[1])
  }
  return tools
}

const registeredMcpTools = extractRegisteredToolsFromSource()

// Actions that are intentionally extension-only and NOT exposed via MCP.
// These are internal steps invoked by clip_page on the extension side.
const extensionOnlyActions: BridgeAction[] = [
  'extract-page' as BridgeAction,
  'convert-to-markdown' as BridgeAction,
  'get-tasks' as BridgeAction,
]

// Convert kebab-case tool name → BridgeAction value
function toolToAction(toolName: string): string {
  return toolName.replace(/_/g, '-')
}

function getAllActions(): BridgeAction[] {
  return Object.values(BridgeAction)
}

describe('bridge protocol ↔ MCP tool contract', () => {
  it('every BridgeAction is either an MCP tool or explicitly marked extension-only', () => {
    const allActions = getAllActions()
    const mcpActions = registeredMcpTools.map(toolToAction)

    for (const action of allActions) {
      const isMcpTool = mcpActions.includes(action)
      const isExtensionOnly = extensionOnlyActions.includes(action)

      expect(
        isMcpTool || isExtensionOnly,
        `BridgeAction "${action}" is not registered as an MCP tool and not marked extension-only. ` +
        `Add it to registeredMcpTools or extensionOnlyActions.`,
      ).toBe(true)
    }
  })

  it('registered MCP tool names map to valid BridgeAction values', () => {
    const allActionValues = new Set<string>(getAllActions())

    for (const tool of registeredMcpTools) {
      const action = toolToAction(tool)
      expect(
        allActionValues.has(action),
        `MCP tool "${tool}" maps to action "${action}" which is not a valid BridgeAction.`,
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

    const mcpActions = registeredMcpTools.map(toolToAction)
    for (const action of critical) {
      expect(mcpActions).toContain(action)
    }
  })

  it('all tools return structuredContent', () => {
    // 自动发现 tools 目录中的所有 .ts 文件（排除 __tests__）
    const toolsDir = path.join(__dirname, '..', 'tools')
    const toolFiles = fs.readdirSync(toolsDir)
      .filter(f => f.endsWith('.ts') && !f.includes('.test.'))

    for (const file of toolFiles) {
      const source = fs.readFileSync(path.join(toolsDir, file), 'utf8')
      expect(source.includes('structuredContent'), `Tool ${file} does not return structuredContent`).toBe(true)
    }
  })
})
