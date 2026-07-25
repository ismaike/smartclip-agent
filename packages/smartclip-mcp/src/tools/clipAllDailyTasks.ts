import { BridgeAction, destinationSchema } from 'smartclip-bridge-protocol'
import { z } from 'zod'
import type { ToolDescriptor, ToolContext } from './defineTool.js'

export default {
  name: 'clip_all_daily_tasks',
  description: '批量剪藏所有待办每日任务。',
  schema: {
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
  errorLabel: '批量剪藏失败',
  async execute(args: {
    destination?: z.infer<typeof destinationSchema>
    mode: 'full' | 'selection'
    closeTab: boolean
  }, { invoke }: ToolContext) {
    const { summary, results } = await invoke(BridgeAction.CLIP_ALL_DAILY_TASKS, {
      destination: args.destination,
      mode: args.mode,
      closeTab: args.closeTab,
    })

    if (summary.total === 0) {
      return {
        text: '没有待处理的每日任务。',
      }
    }

    const resultList = results.map((row) => {
      const emoji = row.success ? '✅' : '❌'
      let line = `${emoji} ${row.title || '(无标题)'} - ${row.url}`
      if (row.error)
        line += ` | ${row.error}`
      return line
    }).join('\n')

    return {
      text: `批量完成: ${summary.succeeded}/${summary.total} 成功, ${summary.failed} 失败\n${resultList}`,
      structured: {
        summary,
        results,
      },
    }
  },
} satisfies ToolDescriptor
