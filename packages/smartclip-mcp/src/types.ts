/**
 * SmartClip MCP Server 共享类型
 */

export type DestinationKind = 'obsidian' | 'notion' | 'markdown' | 'flomo' | 'siyuan' | 'logseq' | 'joplin' | 'feishu' | 'yuque' | 'memos' | 'wolai' | 'getbiji' | 'flowus' | 's3_doc' | 'aliyun_oss_doc' | 'tencent_cos_doc'

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
  clip?: Record<string, any>
  createdTabId?: number
}
