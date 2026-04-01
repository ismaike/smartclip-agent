import type { BridgeStatus } from 'smartclip-bridge-protocol'
import { z } from 'zod'
import type { WebSocketBridge } from '../bridge/websocketBridge.js'

export const getStatusSchema = {}

export const getStatusDescription = '获取 SmartClip MCP 与浏览器扩展的健康状态、连接状态和能力信息。'

function renderStatusText(status: BridgeStatus): string {
  const capabilityList = Object.entries(status.capabilities || {})
    .map(([key, enabled]) => `${enabled ? '✅' : '❌'} ${key}`)
    .join('\n')

  return [
    `MCP 服务: ${status.serverListening ? '已监听' : '未监听'}`,
    `扩展连接: ${status.extensionConnected ? '已连接' : '未连接'}`,
    `扩展开关: ${status.mcpEnabled ? '已开启' : '已关闭'}`,
    `会员状态: ${status.premium ? 'Premium' : 'Free'}`,
    `协议版本: ${status.protocolVersion}`,
    `扩展版本: ${status.extensionVersion || 'unknown'}`,
    `最近错误: ${status.lastErrorCode || 'none'}${status.lastErrorMessage ? ` - ${status.lastErrorMessage}` : ''}`,
    capabilityList ? `能力:\n${capabilityList}` : '能力: 无',
  ].join('\n')
}

export async function getStatus(bridge: WebSocketBridge) {
  const response = await bridge.send('get-status')

  if (!response.success) {
    return {
      content: [{ type: 'text' as const, text: `获取状态失败: ${response.error}` }],
      isError: true,
    }
  }

  const status = response.data as BridgeStatus
  return {
    content: [{ type: 'text' as const, text: renderStatusText(status) }],
    structuredContent: { status },
  }
}
