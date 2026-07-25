/**
 * Bridge Action Contract 注册表。
 *
 * 每个 Bridge Action 的完整契约：输入 schema + 归一化结果 schema + normalize 函数。
 * 注册表键穷举 BridgeAction 枚举（satisfies Record<BridgeAction, ...>），
 * 新增 action 漏登即编译失败。
 *
 * normalize 函数是纯函数：接收 BridgeSuccess envelope，返回待 resultSchema 校验的原始形状。
 * 历史字段位置兼容（envelope 顶层 vs data 嵌套）全部集中在 normalize 内。
 */

import { z } from 'zod'
import { BridgeAction } from './actions.js'
import type { BridgeSuccess } from './messages.js'
import {
  destinationSchema,
  listTabsResultSchema,
  getTasksResultSchema,
  getDailyTasksResultSchema,
  clipPageResultSchema,
  clipAllDailyTasksResultSchema,
} from './toolResults.js'
import { bridgeStatusSchema } from './status.js'

// ─── 共享子 schema ────────────────────────────────────────────

const clipModeSchema = z.enum(['full', 'selection'])

/** 从 envelope.data 提取数组（历史兼容：data 可能缺失或非数组） */
function extractArray(env: BridgeSuccess): unknown[] {
  return Array.isArray(env.data) ? env.data : []
}

/** SAVE_CLIP 发送的 Clip Item（wire 格式） */
const clipItemInputSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  contentHtml: z.string().optional(),
  contentMarkdown: z.string().optional(),
  excerpt: z.string().optional(),
  site: z.string().optional(),
  createdAt: z.string().optional(),
  meta: z.record(z.unknown()).optional(),
}).passthrough()

/** EXTRACT_PAGE 返回的 Clip Item */
const extractedClipSchema = z.object({
  url: z.string().optional(),
  title: z.string().optional(),
  site: z.string().optional(),
  excerpt: z.string().optional(),
  contentHtml: z.string().optional(),
  images: z.array(z.unknown()).optional(),
  meta: z.record(z.unknown()).optional(),
}).passthrough()

/** CONVERT_TO_MARKDOWN 归一化结果 */
const convertToMarkdownResultSchema = z.object({
  markdown: z.string(),
  frontMatter: z.record(z.unknown()).nullable(),
})

/** SAVE_CLIP 归一化结果（不含 destination——destination 来自调用方输入） */
const saveClipResultSchema = z.object({
  saved: z.boolean(),
  taskId: z.string().nullable(),
  warning: z.string().nullable(),
})

/**
 * CLIP_PAGE 归一化结果——桥接侧原始结果，不含 saved/destination（由调用方从输入推导）。
 * 从 toolResults 的 clipPageResultSchema（工具 structured 输出形状）派生，保持单一事实源。
 */
const clipPageBridgeResultSchema = clipPageResultSchema.omit({ saved: true, destination: true })

/** CLIP_DAILY_TASK 归一化结果 */
const clipDailyTaskResultSchema = z.object({
  taskId: z.string(),
  title: z.string().optional(),
  url: z.string().optional(),
  clipTaskId: z.string().optional(),
  warning: z.string().optional(),
  markdown: z.string().optional(),
})

/** GET_VOCABULARY 归一化结果 */
const vocabularyResultSchema = z.object({
  words: z.array(z.object({
    word: z.string(),
    definition: z.string().optional(),
    sentence: z.string().optional(),
    sourceTitle: z.string().optional(),
  }).passthrough()),
  count: z.number(),
  enabled: z.boolean(),
})

// ─── 契约定义 ────────────────────────────────────────────────

/**
 * 单个 Bridge Action 的完整契约定义。
 *
 * - inputSchema：校验调用方传入的 wire payload。fail closed。
 * - resultSchema：校验归一化后的领域结果。fail closed。
 * - normalize：纯函数，从 BridgeSuccess envelope 提取并归一化领域数据。
 *   吸收历史字段位置差异（envelope 顶层 vs data 嵌套）。
 */
export interface BridgeActionContractDef<
  A extends BridgeAction = BridgeAction,
  In = unknown,
  Out = unknown,
> {
  readonly action: A
  readonly inputSchema: z.ZodType<In>
  readonly resultSchema: z.ZodType<Out>
  readonly normalize: (envelope: BridgeSuccess) => unknown
}

// ─── 辅助：void 输入 ─────────────────────────────────────────

const voidInputSchema = z.undefined()

// ─── 11 个 action 的契约 ─────────────────────────────────────

/** 1) LIST_TABS */
const listTabsContract = {
  action: BridgeAction.LIST_TABS,
  inputSchema: voidInputSchema,
  resultSchema: listTabsResultSchema,
  normalize(env: BridgeSuccess) {
    const tabs = extractArray(env)
    return { tabs, count: tabs.length }
  },
} as const

/** 2) EXTRACT_PAGE */
const extractPageContract = {
  action: BridgeAction.EXTRACT_PAGE,
  inputSchema: z.object({
    tabId: z.number().optional(),
    mode: clipModeSchema.optional(),
  }).passthrough(),
  resultSchema: extractedClipSchema,
  normalize(env: BridgeSuccess) {
    return (env.data ?? {}) as Record<string, unknown>
  },
} as const

/** 3) CONVERT_TO_MARKDOWN — 历史兼容：markdown/frontMatter 可能在 data 内或 envelope 顶层 */
const convertToMarkdownContract = {
  action: BridgeAction.CONVERT_TO_MARKDOWN,
  inputSchema: z.object({
    html: z.string(),
    url: z.string(),
    clip: z.object({ url: z.string() }).passthrough().optional(),
  }).passthrough(),
  resultSchema: convertToMarkdownResultSchema,
  normalize(env: BridgeSuccess) {
    const d = (env.data ?? {}) as { markdown?: string; frontMatter?: Record<string, unknown> }
    return {
      markdown: d.markdown ?? env.markdown ?? '',
      frontMatter: d.frontMatter ?? env.frontMatter ?? null,
    }
  },
} as const

/** 4) SAVE_CLIP */
const saveClipContract = {
  action: BridgeAction.SAVE_CLIP,
  inputSchema: z.object({
    clip: clipItemInputSchema,
    destination: destinationSchema,
  }),
  resultSchema: saveClipResultSchema,
  normalize(env: BridgeSuccess) {
    return {
      saved: true,
      taskId: env.taskId ?? null,
      warning: env.warning ?? null,
    }
  },
} as const

/** 5) GET_TASKS */
const getTasksContract = {
  action: BridgeAction.GET_TASKS,
  inputSchema: z.object({
    status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']).optional(),
  }).passthrough(),
  resultSchema: getTasksResultSchema,
  normalize(env: BridgeSuccess) {
    const tasks = extractArray(env)
    return { tasks, count: tasks.length }
  },
} as const

/** 6) CLIP_PAGE — envelope 字段分散在顶层 */
const clipPageContract = {
  action: BridgeAction.CLIP_PAGE,
  inputSchema: z.object({
    tabId: z.number().optional(),
    url: z.string().optional(),
    destination: destinationSchema.optional(),
    mode: clipModeSchema,
  }).passthrough(),
  resultSchema: clipPageBridgeResultSchema,
  normalize(env: BridgeSuccess) {
    const clipRecord = env.clip as Record<string, unknown> | undefined
    return {
      // fail closed：clip.url 缺失时不补空串，交由 resultSchema 拒绝（与 CLIP_DAILY_TASK 的 taskId 一致）
      url: clipRecord?.url,
      title: clipRecord?.title,
      markdown: env.markdown,
      taskId: env.taskId,
      warning: env.warning,
      createdTabId: env.createdTabId,
      clip: env.clip,
    }
  },
} as const

/** 7) GET_DAILY_TASKS — 历史兼容：data 可能是裸数组或 { tasks } 对象 */
const getDailyTasksContract = {
  action: BridgeAction.GET_DAILY_TASKS,
  inputSchema: z.object({
    status: z.enum(['pending', 'completed', 'skipped']).optional(),
  }).passthrough(),
  resultSchema: getDailyTasksResultSchema,
  normalize(env: BridgeSuccess) {
    const raw = env.data
    const tasks = Array.isArray(raw) ? raw : Array.isArray((raw as { tasks?: unknown[] })?.tasks) ? (raw as { tasks: unknown[] }).tasks : []
    return { tasks, count: tasks.length, lastSyncAt: env.lastSyncAt }
  },
} as const

/** 8) CLIP_DAILY_TASK — data 内有 title/url，顶层有 taskId/warning/markdown */
const clipDailyTaskContract = {
  action: BridgeAction.CLIP_DAILY_TASK,
  inputSchema: z.object({
    taskId: z.string(),
    destination: destinationSchema.optional(),
    mode: clipModeSchema,
    closeTab: z.boolean(),
  }),
  resultSchema: clipDailyTaskResultSchema,
  normalize(env: BridgeSuccess) {
    const d = (env.data ?? {}) as { title?: string; url?: string }
    return {
      // fail closed：taskId 缺失时不补空串，交给 resultSchema 拒绝
      taskId: env.taskId,
      title: d.title,
      url: d.url,
      clipTaskId: env.taskId,
      warning: env.warning,
      markdown: env.markdown,
    }
  },
} as const

/** 9) CLIP_ALL_DAILY_TASKS */
const clipAllDailyTasksContract = {
  action: BridgeAction.CLIP_ALL_DAILY_TASKS,
  inputSchema: z.object({
    destination: destinationSchema.optional(),
    mode: clipModeSchema,
    closeTab: z.boolean(),
  }),
  resultSchema: clipAllDailyTasksResultSchema,
  normalize(env: BridgeSuccess) {
    const d = (env.data ?? {}) as {
      total?: number; succeeded?: number; failed?: number
      results?: unknown[]
    }
    return {
      summary: {
        total: d.total ?? 0,
        succeeded: d.succeeded ?? 0,
        failed: d.failed ?? 0,
      },
      results: d.results ?? [],
    }
  },
} as const

/** 10) GET_VOCABULARY */
const getVocabularyContract = {
  action: BridgeAction.GET_VOCABULARY,
  inputSchema: voidInputSchema,
  resultSchema: vocabularyResultSchema,
  normalize(env: BridgeSuccess) {
    const d = (env.data ?? {}) as { words?: unknown[]; enabled?: boolean }
    const words = Array.isArray(d.words) ? d.words : []
    return { words, count: words.length, enabled: d.enabled ?? false }
  },
} as const

/** 11) GET_STATUS */
const getStatusContract = {
  action: BridgeAction.GET_STATUS,
  inputSchema: voidInputSchema,
  resultSchema: bridgeStatusSchema,
  normalize(env: BridgeSuccess) {
    return env.data
  },
} as const

// ─── 注册表 ──────────────────────────────────────────────────

/**
 * Bridge Action Contract 注册表。
 * 键穷举 BridgeAction——新增枚举值后漏登即编译失败（satisfies 保证）。
 */
export const bridgeActionContracts: Record<BridgeAction, BridgeActionContractDef> = {
  [BridgeAction.LIST_TABS]: listTabsContract,
  [BridgeAction.EXTRACT_PAGE]: extractPageContract,
  [BridgeAction.CONVERT_TO_MARKDOWN]: convertToMarkdownContract,
  [BridgeAction.SAVE_CLIP]: saveClipContract,
  [BridgeAction.GET_TASKS]: getTasksContract,
  [BridgeAction.CLIP_PAGE]: clipPageContract,
  [BridgeAction.GET_DAILY_TASKS]: getDailyTasksContract,
  [BridgeAction.CLIP_DAILY_TASK]: clipDailyTaskContract,
  [BridgeAction.CLIP_ALL_DAILY_TASKS]: clipAllDailyTasksContract,
  [BridgeAction.GET_VOCABULARY]: getVocabularyContract,
  [BridgeAction.GET_STATUS]: getStatusContract,
}

// ─── 类型映射（编译期，零运行成本） ──────────────────────────

/** Action → { input, result } 契约类型表。与注册表一一对应。 */
export interface BridgeActionContractTypes {
  [BridgeAction.LIST_TABS]: {
    input: undefined
    result: z.infer<typeof listTabsResultSchema>
  }
  [BridgeAction.EXTRACT_PAGE]: {
    input: { tabId?: number; mode?: 'full' | 'selection' }
    result: z.infer<typeof extractedClipSchema>
  }
  [BridgeAction.CONVERT_TO_MARKDOWN]: {
    input: { html: string; url: string; clip?: { url: string } }
    result: { markdown: string; frontMatter: Record<string, unknown> | null }
  }
  [BridgeAction.SAVE_CLIP]: {
    input: { clip: z.infer<typeof clipItemInputSchema>; destination: z.infer<typeof destinationSchema> }
    result: { saved: boolean; taskId: string | null; warning: string | null }
  }
  [BridgeAction.GET_TASKS]: {
    input: { status?: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' }
    result: z.infer<typeof getTasksResultSchema>
  }
  [BridgeAction.CLIP_PAGE]: {
    input: { tabId?: number; url?: string; destination?: z.infer<typeof destinationSchema>; mode: 'full' | 'selection' }
    result: z.infer<typeof clipPageBridgeResultSchema>
  }
  [BridgeAction.GET_DAILY_TASKS]: {
    input: { status?: 'pending' | 'completed' | 'skipped' }
    result: z.infer<typeof getDailyTasksResultSchema>
  }
  [BridgeAction.CLIP_DAILY_TASK]: {
    input: { taskId: string; destination?: z.infer<typeof destinationSchema>; mode: 'full' | 'selection'; closeTab: boolean }
    result: z.infer<typeof clipDailyTaskResultSchema>
  }
  [BridgeAction.CLIP_ALL_DAILY_TASKS]: {
    input: { destination?: z.infer<typeof destinationSchema>; mode: 'full' | 'selection'; closeTab: boolean }
    result: z.infer<typeof clipAllDailyTasksResultSchema>
  }
  [BridgeAction.GET_VOCABULARY]: {
    input: undefined
    result: z.infer<typeof vocabularyResultSchema>
  }
  [BridgeAction.GET_STATUS]: {
    input: undefined
    result: z.infer<typeof bridgeStatusSchema>
  }
}

/** 按 action 字面量取出输入类型 */
export type BridgeActionInput<A extends BridgeAction> = BridgeActionContractTypes[A]['input']

/** 按 action 字面量取出归一化结果类型 */
export type BridgeActionResult<A extends BridgeAction> = BridgeActionContractTypes[A]['result']
