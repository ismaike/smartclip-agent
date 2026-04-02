import { z } from 'zod'

export const bridgeStatusSchema = z.object({
  serverListening: z.boolean(),
  extensionConnected: z.boolean(),
  socketConnected: z.boolean().optional(),
  handshakeAcknowledged: z.boolean().optional(),
  connectionPhase: z.string().optional(),
  mcpEnabled: z.boolean(),
  premium: z.boolean(),
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

export type BridgeStatus = z.infer<typeof bridgeStatusSchema>
