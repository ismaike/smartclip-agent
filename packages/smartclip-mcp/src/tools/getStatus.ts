import { BridgeErrorCode, bridgeStatusSchema, type BridgeStatus } from 'smartclip-bridge-protocol'
import { BridgeAction } from 'smartclip-bridge-protocol'
import type { ToolDescriptor, ToolContext } from './defineTool.js'

function renderSuggestion(status: BridgeStatus): string | null {
  switch (status.lastErrorCode) {
    case BridgeErrorCode.MCP_SERVER_UNAVAILABLE:
      return '建议: 检查 18365 端口是否被占用。'
    case BridgeErrorCode.AUTH_FAILED:
      return '建议: 检查 Session Token 是否一致。'
    case BridgeErrorCode.PROTOCOL_MISMATCH:
      return '建议: 升级扩展和 MCP 到同一版本。'
    case BridgeErrorCode.HANDSHAKE_TIMEOUT:
      return '建议: 重启旧进程或升级版本。'
    case BridgeErrorCode.PREMIUM_REQUIRED:
      return '建议: 需要 Pro 订阅。'
    default:
      return null
  }
}

function renderStatusText(status: BridgeStatus): string {
  const lines = [
    `MCP: ${status.serverListening ? '监听中' : '未监听'}`,
    `扩展: ${status.extensionConnected ? '已连接' : '未连接'}`,
    `阶段: ${status.connectionPhase || 'unknown'}`,
    `开关: ${status.mcpEnabled ? '开' : '关'}`,
    `会员: ${status.pro ? 'Pro' : 'Free'}`,
    `版本: ext=${status.extensionVersion || '?'} proto=${status.protocolVersion}`,
    `错误: ${status.lastErrorCode || 'none'}`,
    `重连: ${status.reconnectAttempts}次`,
  ]

  const suggestion = renderSuggestion(status)
  if (suggestion)
    lines.push(suggestion)

  return lines.join(' | ')
}

export default {
  name: 'get_status',
  description: '获取MCP连接状态。',
  schema: {},
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
  },
  errorLabel: '获取状态失败',
  async execute(_args: unknown, { send }: ToolContext) {
    const r = await send(BridgeAction.GET_STATUS)

    const parseResult = bridgeStatusSchema.safeParse(r.data)
    if (!parseResult.success) {
      throw new Error(`状态数据格式无效: ${parseResult.error.message}`)
    }

    const status = parseResult.data
    return {
      text: renderStatusText(status),
      structured: { status },
    }
  },
} satisfies ToolDescriptor
