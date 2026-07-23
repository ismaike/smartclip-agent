import { BridgeAction, destinationSchema } from 'smartclip-bridge-protocol'
import { z } from 'zod'
import type { ToolDescriptor, ToolContext } from './defineTool.js'

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
  annotations: {
    destructiveHint: false,
    idempotentHint: false,
  },
  errorLabel: '每日任务剪藏失败',
  async execute(args: {
    taskId: string
    destination?: string
    mode: string
    closeTab: boolean
  }, { send }: ToolContext) {
    const r = await send(BridgeAction.CLIP_DAILY_TASK, {
      taskId: args.taskId,
      destination: args.destination,
      mode: args.mode,
      closeTab: args.closeTab,
    })

    const info = (r as any).data || {}
    const dest = args.destination ? ` → ${args.destination}` : ''
    const taskId = r.taskId ? ` (task:${r.taskId})` : ''
    const warning = r.warning ? ` ⚠ ${r.warning}` : ''

    return {
      text: `任务完成: ${info.title || '(无标题)'}${dest}${taskId}${warning}`,
      structured: {
        taskId: args.taskId,
        title: info.title || null,
        url: info.url || null,
        saved: true,
        clipTaskId: r.taskId || null,
        warning: r.warning || null,
        markdown: r.markdown || null,
      },
    }
  },
} satisfies ToolDescriptor
