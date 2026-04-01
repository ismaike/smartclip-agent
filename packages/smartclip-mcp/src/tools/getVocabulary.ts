import type { WebSocketBridge } from '../bridge/websocketBridge.js'

export const getVocabularySchema = {}

export const getVocabularyDescription = '获取用户的生词本数据。返回所有保存的生词，包括单词、释义、来源句子、来源页面等信息。'

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
        text: '生词本为空，还没有保存任何生词。',
      }],
    }
  }

  const wordList = words.map((w: any, i: number) => {
    const lines = [
      `${i + 1}. ${w.word} — ${w.definition}`,
    ]
    if (w.sentence)
      lines.push(`   例句: ${w.sentence}`)
    if (w.sourceTitle)
      lines.push(`   来源: ${w.sourceTitle}`)
    if (w.sourceUrl)
      lines.push(`   URL: ${w.sourceUrl}`)
    if (w.createdAt)
      lines.push(`   添加时间: ${w.createdAt}`)
    return lines.join('\n')
  }).join('\n\n')

  return {
    content: [{
      type: 'text' as const,
      text: `生词本（${vocabulary.enabled ? '已启用' : '已禁用'}）共 ${words.length} 个生词:\n\n${wordList}`,
    }],
    structuredContent: {
      enabled: vocabulary.enabled || false,
      words,
      count: words.length,
    },
  }
}
