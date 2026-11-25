/**
 * 工具注册表
 *
 * 所有面向 AI 客户端的 MCP 工具在此显式声明。
 * 新增工具：创建文件（导出 default ToolDescriptor）→ 在此 import + 加入数组。
 *
 * 注意：extractPage / convertToMarkdown / getTasks 是扩展内部 action，
 * 不在此注册表中（详见 bridgeContract.test.ts 的 extensionOnlyActions）。
 */

import type { ToolDescriptor } from './defineTool.js'
import listTabs from './listTabs.js'
import readPage from './readPage.js'
import saveClip from './saveClip.js'
import clipPage from './clipPage.js'
import getDailyTasks from './getDailyTasks.js'
import clipDailyTask from './clipDailyTask.js'
import clipAllDailyTasks from './clipAllDailyTasks.js'
import getVocabulary from './getVocabulary.js'
import getStatus from './getStatus.js'

export const tools: ToolDescriptor[] = [
  listTabs,
  readPage,
  saveClip,
  clipPage,
  getDailyTasks,
  clipDailyTask,
  clipAllDailyTasks,
  getVocabulary,
  getStatus,
]
