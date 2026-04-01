import { z } from 'zod'

export const bridgeStatusSchema = z.object({
  serverListening: z.boolean(),
  extensionConnected: z.boolean(),
  mcpEnabled: z.boolean(),
  premium: z.boolean(),
  protocolVersion: z.string(),
  extensionVersion: z.string().nullable().optional().transform(value => value ?? null),
  lastErrorCode: z.string().nullable().optional().transform(value => value ?? null),
  lastErrorMessage: z.string().nullable().optional().transform(value => value ?? null),
  capabilities: z.record(z.boolean()).default({}),
  clientVersion: z.string().nullable().optional().transform(value => value ?? null),
  legacyMode: z.boolean().optional(),
})

export type BridgeStatus = z.infer<typeof bridgeStatusSchema>
