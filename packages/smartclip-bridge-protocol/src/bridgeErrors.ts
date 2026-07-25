/**
 * Bridge Action 契约错误分类。
 *
 * 三类互斥错误，共享父类型 BridgeActionError：
 * - BridgeConnectionError：传输层失败（未连接 / 超时 / 握手失败）
 * - BridgeActionRejection：扩展返回 success: false（业务失败）
 * - BridgeContractError：输入或结果的 schema 校验失败（协议漂移）
 *
 * 与 errors.ts 的 BridgeErrorCode（wire 枚举）互补：
 * BridgeErrorCode 是扩展端发出的错误码，此处是 MCP 侧的分类包装。
 */

import type { z } from 'zod'
import type { BridgeAction } from './actions.js'
import { BridgeErrorCode } from './errors.js'

/** 错误大类标识，调用方按此值分流。 */
export type BridgeErrorKind = 'connection' | 'action' | 'contract'

/** 所有 Bridge Action 契约错误的公共基类。 */
export abstract class BridgeActionError extends Error {
  abstract readonly kind: BridgeErrorKind
}

/**
 * 1) 连接类：transport 抛出的异常。
 * 调用方通常应引导用户检查扩展连接。
 */
export class BridgeConnectionError extends BridgeActionError {
  readonly kind = 'connection' as const
  constructor(
    public readonly action: BridgeAction,
    public readonly cause: unknown,
  ) {
    const msg = cause instanceof Error ? cause.message : String(cause)
    super(`Bridge 未就绪（${action}）：${msg}`)
    this.name = 'BridgeConnectionError'
  }
}

/**
 * 2) Action 类：扩展执行返回 success: false。
 * 携带 BridgeErrorCode（如 PREMIUM_REQUIRED、PAGE_LOAD_TIMEOUT 等）。
 */
export class BridgeActionRejection extends BridgeActionError {
  readonly kind = 'action' as const
  constructor(
    public readonly action: BridgeAction,
    public readonly code: BridgeErrorCode | null,
    message: string,
    public readonly details?: unknown,
  ) {
    super(`${action} 被拒绝：${code ?? 'UNKNOWN'} - ${message}`)
    this.name = 'BridgeActionRejection'
  }
}

/**
 * 3) 协议契约类：输入 payload 或归一化结果的 schema 校验失败。
 * 通常意味着 MCP 与扩展版本不一致（协议漂移），应 fail closed。
 */
export class BridgeContractError extends BridgeActionError {
  readonly kind = 'contract' as const
  constructor(
    public readonly action: BridgeAction,
    /** 哪一侧校验失败 */
    public readonly phase: 'input' | 'result',
    /** zod 校验问题摘要 */
    public readonly issues: readonly z.ZodIssue[],
  ) {
    const paths = issues.map(i => i.path.join('.')).filter(Boolean).join(', ')
    super(`${action} 契约违反（${phase}）：${paths || issues.map(i => i.message).join('; ')}`)
    this.name = 'BridgeContractError'
  }
}
