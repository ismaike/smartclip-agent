/**
 * Bridge Action Contract 的调用入口。
 *
 * createBridgeInvoker 把一个 transport adapter 绑定成 BridgeInvoker，
 * 调用方通过 invoke(action, payload) 获得 action-specific 归一化结果。
 *
 * invoke 内部按固定顺序执行：
 * 1) prepareInput：校验输入 payload（fail closed）
 * 2) transport.send：发送 wire 请求
 * 3) success 判定：success:false → BridgeActionRejection
 * 4) normalizeResult：从 envelope 归一化领域数据
 * 5) resultSchema 校验：fail closed
 *
 * prepareInput 和 normalizeResult 作为内部 seam 暴露，
 * 供协议层测试直接测试归一化逻辑，不必走完整 invoke 链。
 */

import type { BridgeAction } from './actions.js'
import type { BridgeResponse, BridgeSuccess } from './messages.js'
import {
  bridgeActionContracts,
  type BridgeActionInput,
  type BridgeActionResult,
} from './contracts.js'
import {
  BridgeConnectionError,
  BridgeActionRejection,
  BridgeContractError,
} from './bridgeErrors.js'

// ─── transport seam ──────────────────────────────────────────

/**
 * 传输 seam——由外部 adapter 实现。
 *
 * 职责（极薄）：
 * - 把已校验的 payload 装进 envelope，发往对端
 * - 返回 BridgeResponse（success 或 error）
 *
 * 连接失败（未连接 / 超时 / 握手失败）必须以 throw 表达，
 * 不得 resolve 成 success:false——否则会被误判为 Action 错误。
 *
 * 唯一 adapter（现状）：packages/smartclip-mcp 的 WebSocketBridge。
 */
export type BridgeTransport = {
  send(action: BridgeAction, data?: unknown): Promise<BridgeResponse>
}

// ─── 内部 seam：纯函数（测试可用） ───────────────────────────

/**
 * 校验调用方输入。fail closed：已声明字段类型不符 → 抛 BridgeContractError。
 * 成功时返回校验后的 payload，可直接交给 transport。
 */
export function prepareInput<A extends BridgeAction>(
  action: A,
  raw: unknown,
): BridgeActionInput<A> {
  const contract = bridgeActionContracts[action]
  const result = contract.inputSchema.safeParse(raw)
  if (!result.success)
    throw new BridgeContractError(action, 'input', result.error.issues)
  return result.data as BridgeActionInput<A>
}

/**
 * 从 BridgeSuccess envelope 归一化领域数据。
 * 纯函数：调用 contract.normalize 提取字段，不触碰文件系统或网络。
 */
export function normalizeResult<A extends BridgeAction>(
  action: A,
  envelope: BridgeSuccess,
): BridgeActionResult<A> {
  const contract = bridgeActionContracts[action]
  const raw = contract.normalize(envelope)
  const result = contract.resultSchema.safeParse(raw)
  if (!result.success)
    throw new BridgeContractError(action, 'result', result.error.issues)
  return result.data as BridgeActionResult<A>
}

// ─── 外部 seam：BridgeInvoker ────────────────────────────────

/**
 * 调用方通过此 interface 调用 Bridge Action。
 * invoke 返回 action-specific 归一化结果，永不返回 envelope。
 *
 * @throws BridgeConnectionError — 传输层失败
 * @throws BridgeActionRejection — 扩展返回 success:false
 * @throws BridgeContractError — 输入或结果 schema 校验失败
 */
export interface BridgeInvoker {
  invoke<A extends BridgeAction>(
    action: A,
    ...payload: BridgeActionInput<A> extends undefined ? [] : [payload: BridgeActionInput<A>]
  ): Promise<BridgeActionResult<A>>
}

// ─── 工厂 ────────────────────────────────────────────────────

/**
 * 把一个 transport adapter 绑定成 BridgeInvoker。
 * 调用方一次绑定后，11 个 action 的调用形式完全一致。
 */
export function createBridgeInvoker(transport: BridgeTransport): BridgeInvoker {
  return {
    async invoke<A extends BridgeAction>(
      action: A,
      ...payload: BridgeActionInput<A> extends undefined ? [] : [payload: BridgeActionInput<A>]
    ): Promise<BridgeActionResult<A>> {
      // (1) 输入校验
      const input = prepareInput(action, payload[0])

      // (2) 调 transport（仅此步可能抛连接类异常）
      let response: BridgeResponse
      try {
        response = await transport.send(action, input)
      }
      catch (cause) {
        throw new BridgeConnectionError(action, cause)
      }

      // (3) Action 错误分流
      if (!response.success) {
        throw new BridgeActionRejection(
          action,
          response.code ?? null,
          response.error,
          response.details,
        )
      }

      // (4)(5) 归一化 + 结果校验
      return normalizeResult(action, response)
    },
  }
}
