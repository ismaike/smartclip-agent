import { z } from 'zod'

export const bridgeStatusSchema = z.object({
  serverListening: z.boolean(),
  extensionConnected: z.boolean(),
  socketConnected: z.boolean().optional(),
  handshakeAcknowledged: z.boolean().optional(),
  connectionPhase: z.string().optional(),
  mcpEnabled: z.boolean(),
  /** 是否具备 Pro 权益（MCP 门禁）。新版扩展（三档模型后）发送此字段。 */
  pro: z.boolean().optional(),
  /**
   * @deprecated 旧版扩展发送的字段，仅为向后兼容保留；解析输出统一归一化为 `pro`。
   */
  premium: z.boolean().optional(),
  protocolVersion: z.string(),
  extensionVersion: z.string().nullable().default(null),
  lastErrorCode: z.string().nullable().default(null),
  lastErrorMessage: z.string().nullable().default(null),
  reconnectAttempts: z.number().default(0),
  nextReconnectAt: z.number().nullable().default(null),
  lastCloseCode: z.number().nullable().default(null),
  lastCloseReason: z.string().nullable().default(null),
  capabilities: z.record(z.boolean()).default({}),
  clientVersion: z.string().nullable().default(null),
  legacyMode: z.boolean().optional(),
})
  .transform(({ pro, premium, ...rest }) => ({
    ...rest,
    // 新版扩展发 pro，旧版扩展发 premium；两者择一，归一化为 pro。缺失默认 false（无 Pro 权益，MCP 门禁关闭）。
    pro: pro ?? premium ?? false,
  }))

export type BridgeStatus = z.infer<typeof bridgeStatusSchema>
