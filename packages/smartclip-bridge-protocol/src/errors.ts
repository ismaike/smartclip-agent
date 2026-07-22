export enum BridgeErrorCode {
  EXTENSION_NOT_CONNECTED = 'EXTENSION_NOT_CONNECTED',
  MCP_SERVER_UNAVAILABLE = 'MCP_SERVER_UNAVAILABLE',
  MCP_DISABLED = 'MCP_DISABLED',
  /**
   * 缺少 Pro 权益（MCP 门禁）。
   * 注意：枚举成员名与 wire 值均保留 `PREMIUM_REQUIRED`，以兼容已发布扩展（其仍发送此值）。
   * 勿改名/改值；面向用户的文案应表述为「Pro」。
   */
  PREMIUM_REQUIRED = 'PREMIUM_REQUIRED',
  INVALID_URL = 'INVALID_URL',
  PAGE_LOAD_TIMEOUT = 'PAGE_LOAD_TIMEOUT',
  EXTRACTION_FAILED = 'EXTRACTION_FAILED',
  CONVERSION_FAILED = 'CONVERSION_FAILED',
  SAVE_FAILED = 'SAVE_FAILED',
  PROTOCOL_MISMATCH = 'PROTOCOL_MISMATCH',
  AUTH_FAILED = 'AUTH_FAILED',
  HANDSHAKE_TIMEOUT = 'HANDSHAKE_TIMEOUT',
  UNKNOWN_ACTION = 'UNKNOWN_ACTION',
}

/**
 * WebSocket close codes for MCP bridge handshake failures.
 * Using 4400-4499 range (reserved for application-defined codes).
 */
export enum BridgeCloseCode {
  /** General handshake failure (auth failed, invalid payload, etc.) */
  HANDSHAKE_FAILED = 4401,
  /** Protocol version mismatch */
  PROTOCOL_MISMATCH = 4402,
}

/**
 * Map BridgeErrorCode to WebSocket close code for handshake failures.
 */
export function bridgeErrorToCloseCode(code: BridgeErrorCode): BridgeCloseCode {
  switch (code) {
    case BridgeErrorCode.PROTOCOL_MISMATCH:
      return BridgeCloseCode.PROTOCOL_MISMATCH
    default:
      return BridgeCloseCode.HANDSHAKE_FAILED
  }
}
