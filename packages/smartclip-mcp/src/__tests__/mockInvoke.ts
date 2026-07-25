import { BridgeAction } from 'smartclip-bridge-protocol'
import type { BridgeInvoker } from 'smartclip-bridge-protocol'

/** mock invoke：按 action 返回归一化结果，不走契约校验 */
export function mockInvoke(responseMap: Record<string, unknown>): BridgeInvoker['invoke'] {
  return ((async (action: BridgeAction) => responseMap[action]) as BridgeInvoker['invoke'])
}
