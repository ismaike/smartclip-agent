import { z } from 'zod'
import { bridgeStatusSchema } from './status.js'

const tabSchema = z.object({
  id: z.number(),
  url: z.string(),
  title: z.string(),
  active: z.boolean(),
  windowId: z.number(),
})

const queuedTaskStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled'])
const dailyTaskStatusSchema = z.enum(['pending', 'completed', 'skipped'])
const destinationSchema = z.enum(['obsidian', 'notion', 'markdown', 'flomo', 'siyuan', 'webdav', 's3', 'joplin', 'feishu'])

export const listTabsResultSchema = z.object({
  tabs: z.array(tabSchema),
  count: z.number(),
})

export const getTasksResultSchema = z.object({
  tasks: z.array(z.object({
    id: z.string(),
    status: queuedTaskStatusSchema,
    destination: destinationSchema.optional(),
    error: z.string().optional(),
    warning: z.string().optional(),
    clip: z.object({
      title: z.string().optional(),
      url: z.string().optional(),
    }).passthrough().optional(),
  }).passthrough()),
  count: z.number(),
})

export const getDailyTasksResultSchema = z.object({
  tasks: z.array(z.object({
    id: z.string(),
    title: z.string(),
    url: z.string(),
    status: dailyTaskStatusSchema,
    description: z.string().optional(),
    createdAt: z.string().optional(),
  }).passthrough()),
  count: z.number(),
  lastSyncAt: z.number().optional(),
})

export const clipPageResultSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  markdown: z.string().optional(),
  saved: z.boolean(),
  destination: destinationSchema.optional(),
  taskId: z.string().optional(),
  warning: z.string().optional(),
  createdTabId: z.number().optional(),
  clip: z.record(z.unknown()).optional(),
})

export const clipAllDailyTasksResultSchema = z.object({
  summary: z.object({
    total: z.number(),
    succeeded: z.number(),
    failed: z.number(),
  }),
  results: z.array(z.object({
    taskId: z.string(),
    title: z.string(),
    url: z.string(),
    success: z.boolean(),
    error: z.string().optional(),
  })),
})

export const statusResultSchema = bridgeStatusSchema
