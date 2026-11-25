import { BridgeAction } from 'smartclip-bridge-protocol'
import { z } from 'zod'
import type { ToolDescriptor, ToolContext } from './defineTool.js'

const getVocabularyOutputSchema = {
  enabled: z.boolean(),
  words: z.array(z.record(z.unknown())),
  count: z.number(),
}

export default {
  name: 'get_vocabulary',
  description: '获取用户生词本。',
  schema: {},
  outputSchema: getVocabularyOutputSchema,
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
  },
  errorLabel: '获取生词本失败',
  async execute(_args: unknown, { invoke }: ToolContext) {
    const { words, count, enabled } = await invoke(BridgeAction.GET_VOCABULARY)

    if (count === 0) {
      return {
        text: '生词本为空。',
        structured: {
          enabled,
          words: [],
          count: 0,
        },
      }
    }

    const wordList = words.map((w, i) => {
      const lines = [`${i + 1}. ${w.word} — ${w.definition}`]
      if (w.sentence)
        lines.push(`   例: ${w.sentence}`)
      if (w.sourceTitle)
        lines.push(`   来源: ${w.sourceTitle}`)
      return lines.join('\n')
    }).join('\n\n')

    return {
      text: `生词本 (${count}词):\n\n${wordList}`,
      structured: {
        enabled,
        words,
        count,
      },
    }
  },
} satisfies ToolDescriptor
