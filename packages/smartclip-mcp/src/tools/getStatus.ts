import { BridgeErrorCode, bridgeStatusSchema, type BridgeStatus } from 'smartclip-bridge-protocol'
import type { WebSocketBridge } from '../bridge/websocketBridge.js'

export const getStatusSchema = {}

export const getStatusDescription = '获取 SmartClip MCP 与浏览器扩展的健康状态、连接状态和能力信息。'

function renderSuggestion(status: BridgeStatus): string | null {
  switch (status.lastErrorCode) {
    case BridgeErrorCode.MCP_SERVER_UNAVAILABLE:
      return '建议: 确认 Claude Code 已启动 smartclip-mcp，并检查 18365 端口未被旧进程占用。'
    case BridgeErrorCode.AUTH_FAILED:
      return '建议: 检查扩展中的 Session Token 与 .mcp.json 里的 SMARTCLIP_MCP_SESSION_TOKEN 是否一致。'
    case BridgeErrorCode.PROTOCOL_MISMATCH:
      return '建议: 升级 SmartClip 扩展和 smartclip-mcp 到同一版本线。'
    case BridgeErrorCode.HANDSHAKE_TIMEOUT:
      return '建议: smartclip-mcp 接受了连接但未完成握手，通常需要重启旧进程或升级版本。'
    case BridgeErrorCode.PREMIUM_REQUIRED:
      return '建议: 当前账号需要 Pro 订阅才能使用 MCP。'
    default:
      return null
  }
}

function renderStatusText(status: BridgeStatus): string {
  const capabilityList = Object.entries(status.capabilities || {})
    .map(([key, enabled]) => `${enabled ? '✅' : '❌'} ${key}`)
    .join('\n')

  const lines = [
    `MCP 服务: ${status.serverListening ? '已监听' : '未监听'}`,
    `扩展连接: ${status.extensionConnected ? '已连接' : '未连接'}`,
    `Socket: ${status.socketConnected ? '已建立' : '未建立'}`,
    `握手状态: ${status.handshakeAcknowledged ? '已完成' : '未完成'}`,
    `连接阶段: ${status.connectionPhase || 'unknown'}`,
    `扩展开关: ${status.mcpEnabled ? '已开启' : '已关闭'}`,
    `会员状态: ${status.pro ? 'Pro' : 'Free'}`,
    `协议版本: ${status.protocolVersion}`,
    `扩展版本: ${status.extensionVersion || 'unknown'}`,
    `smartclip-mcp 版本: ${status.clientVersion || 'unknown'}`,
    `最近错误: ${status.lastErrorCode || 'none'}${status.lastErrorMessage ? ` - ${status.lastErrorMessage}` : ''}`,
    `最近关闭: ${status.lastCloseCode ?? 'none'}${status.lastCloseReason ? ` - ${status.lastCloseReason}` : ''}`,
    `重连次数: ${status.reconnectAttempts}`,
    `下次重连: ${status.nextReconnectAt ? new Date(status.nextReconnectAt).toLocaleString('zh-CN', { hour12: false }) : 'not scheduled'}`,
    capabilityList ? `能力:\n${capabilityList}` : '能力: 无',
  ]

  const suggestion = renderSuggestion(status)
  if (suggestion)
    lines.push(suggestion)

  return lines.join('\n')
}

export async function getStatus(bridge: WebSocketBridge) {
  const response = await bridge.send('get-status')

  if (!response.success) {
    return {
      content: [{ type: 'text' as const, text: `获取状态失败: ${response.error}` }],
      isError: true,
    }
  }

  const parseResult = bridgeStatusSchema.safeParse(response.data)
  if (!parseResult.success) {
    return {
      content: [{ type: 'text' as const, text: `状态数据格式无效: ${parseResult.error.message}` }],
      isError: true,
    }
  }

  const status = parseResult.data
  return {
    content: [{ type: 'text' as const, text: renderStatusText(status) }],
    structuredContent: { status },
  }
}
