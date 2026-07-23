import type { WebSocketBridge } from '../bridge/websocketBridge.js'

export const getVocabularySchema = {}

export const getVocabularyDescription = '获取用户生词本。'

export const getVocabularyAnnotations = {
  readOnlyHint: true,
  idempotentHint: true,
} as const

export async function getVocabulary(bridge: WebSocketBridge) {
  const response = await bridge.send('get-vocabulary')

  if (!response.success) {
    return {
      content: [{ type: 'text' as const, text: `获取生词本失败: ${response.error}` }],
      isError: true,
    }
  }

  const vocabulary = response.data
  const words = vocabulary?.words || []

  if (words.length === 0) {
    return {
      content: [{
        type: 'text' as const,
        text: '生词本为空。',
      }],
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
    content: [{
      type: 'text' as const,
      text: `生词本 (${words.length}词):\n\n${wordList}`,
    }],
    structuredContent: {
      enabled: vocabulary.enabled || false,
      words,
      count: words.length,
    },
  }
}
