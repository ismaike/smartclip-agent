/**
 * SmartClip MCP Server 共享类型
 */

export type DestinationKind = 'obsidian' | 'notion' | 'markdown' | 'flomo' | 'siyuan' | 'webdav' | 's3' | 'joplin' | 'feishu'

export interface TabInfo {
  id: number
  url: string
  title: string
  active: boolean
  windowId: number
}

export interface BridgeResponse {
  id: string
  success: boolean
  data?: any
  error?: string
  warning?: string
  taskId?: string
  markdown?: string
  frontMatter?: Record<string, any>
}
