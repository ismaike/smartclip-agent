import { BridgeAction } from 'smartclip-bridge-protocol'
import type { ToolDescriptor, ToolContext } from './defineTool.js'

export default {
  name: 'get_vocabulary',
  description: '获取用户生词本。',
  schema: {},
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
  },
  errorLabel: '获取生词本失败',
  async execute(_args: unknown, { send }: ToolContext) {
    const r = await send(BridgeAction.GET_VOCABULARY)

    const vocabulary = r.data
    const words = (vocabulary as any)?.words || []

    if (words.length === 0) {
      return {
        text: '生词本为空。',
      }
    }

    const wordList = words.map((w: any, i: number) => {
      const lines = [`${i + 1}. ${w.word} — ${w.definition}`]
      if (w.sentence)
        lines.push(`   例: ${w.sentence}`)
      if (w.sourceTitle)
        lines.push(`   来源: ${w.sourceTitle}`)
      return lines.join('\n')
    }).join('\n\n')

    return {
      text: `生词本 (${words.length}词):\n\n${wordList}`,
      structured: {
        enabled: (vocabulary as any)?.enabled || false,
        words,
        count: words.length,
      },
    }
  },
} satisfies ToolDescriptor
