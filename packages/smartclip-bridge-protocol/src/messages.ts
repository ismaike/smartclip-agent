import { z } from 'zod'
import { BridgeAction } from './actions.js'
import { BridgeErrorCode } from './errors.js'

export const actionEnvelopeSchema = z.object({
  id: z.string(),
  action: z.nativeEnum(BridgeAction),
  data: z.unknown().optional(),
})

export const bridgeSuccessSchema = z.object({
  id: z.string(),
  success: z.literal(true),
  data: z.unknown().optional(),
  warning: z.string().optional(),
  taskId: z.string().optional(),
  markdown: z.string().optional(),
  frontMatter: z.record(z.unknown()).optional(),
  lastSyncAt: z.number().optional(),
  /** clip-page 返回的剪藏元数据（Partial<ClipItem>，含 title/url 等）；不声明会被 zod strip 导致 title 丢失 */
  clip: z.record(z.unknown()).optional(),
  /** clip-page 为提取而临时创建的后台标签页 ID */
  createdTabId: z.number().optional(),
})

export const bridgeErrorSchema = z.object({
  id: z.string().optional(),
  success: z.literal(false),
  error: z.string(),
  code: z.nativeEnum(BridgeErrorCode).optional(),
  details: z.unknown().optional(),
})

export const bridgeResponseSchema = z.union([bridgeSuccessSchema, bridgeErrorSchema])

export type ActionEnvelope = z.infer<typeof actionEnvelopeSchema>
export type BridgeSuccess = z.infer<typeof bridgeSuccessSchema>
export type BridgeError = z.infer<typeof bridgeErrorSchema>
export type BridgeResponse = z.infer<typeof bridgeResponseSchema>
