import { z } from 'zod'
import { BRIDGE_PROTOCOL_VERSION } from './actions.js'

const capabilitiesSchema = z.record(z.boolean())

export const helloRequestSchema = z.object({
  id: z.string().optional(),
  type: z.literal('hello'),
  protocolVersion: z.string().default(BRIDGE_PROTOCOL_VERSION),
  sessionToken: z.string().optional(),
  clientName: z.string(),
  clientVersion: z.string(),
  capabilities: capabilitiesSchema.default({}),
})

export const helloResponseSchema = z.object({
  id: z.string().optional(),
  type: z.literal('hello_ack'),
  protocolVersion: z.string().default(BRIDGE_PROTOCOL_VERSION),
  serverName: z.string(),
  serverVersion: z.string(),
  accepted: z.boolean(),
  capabilities: capabilitiesSchema.optional(),
  message: z.string().optional(),
  legacyMode: z.boolean().optional(),
})

export type HelloRequest = z.infer<typeof helloRequestSchema>
export type HelloResponse = z.infer<typeof helloResponseSchema>
