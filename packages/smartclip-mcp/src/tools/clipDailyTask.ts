import { BridgeAction, destinationSchema } from 'smartclip-bridge-protocol'
import { z } from 'zod'
import type { ToolDescriptor, ToolContext } from './defineTool.js'

const clipDailyTaskOutputSchema = {
  taskId: z.string(),
  title: z.string().nullable(),
  url: z.string().nullable(),
  saved: z.boolean(),
  clipTaskId: z.string().nullable(),
  warning: z.string().nullable(),
  markdown: z.string().nullable(),
}

export default {
  name: 'clip_daily_task',
  description: '剪藏单个每日任务。',
  schema: {
    taskId: z.string().describe('每日任务ID（通过 get_daily_tasks 获取）'),
    destination: destinationSchema
      .optional()
      .describe('保存目标，默认用用户配置'),
    mode: z.enum(['full', 'selection']).default('full')
      .describe('full=全页, selection=选区'),
    closeTab: z.boolean().default(true)
      .describe('完成后是否关闭标签页'),
  },
  outputSchema: clipDailyTaskOutputSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
  },
  errorLabel: '每日任务剪藏失败',
  async execute(args: {
    taskId: string
    destination?: z.infer<typeof destinationSchema>
    mode: 'full' | 'selection'
    closeTab: boolean
  }, { invoke }: ToolContext) {
    const r = await invoke(BridgeAction.CLIP_DAILY_TASK, {
      taskId: args.taskId,
      destination: args.destination,
      mode: args.mode,
      closeTab: args.closeTab,
    })

    const dest = args.destination ? ` → ${args.destination}` : ''
    const taskIdText = r.clipTaskId ? ` (task:${r.clipTaskId})` : ''
    const warning = r.warning ? ` ⚠ ${r.warning}` : ''

    return {
      text: `任务完成: ${r.title || '(无标题)'}${dest}${taskIdText}${warning}`,
      structured: {
        taskId: args.taskId,
        title: r.title || null,
        url: r.url || null,
        saved: true,
        clipTaskId: r.clipTaskId || null,
        warning: r.warning || null,
        markdown: r.markdown || null,
      },
    }
  },
} satisfies ToolDescriptor
