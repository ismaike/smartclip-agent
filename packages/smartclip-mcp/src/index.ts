#!/usr/bin/env node
/**
 * SmartClip MCP Server & Unified CLI
 *
 * 用法：
 *   smartclip-mcp                  → 启动 stdio MCP Server（默认复用或拉起 Local Bridge Hub）
 *   smartclip-mcp setup            → 自动探测并写入各 AI 客户端 MCP 配置
 *   smartclip-mcp doctor           → 检查客户端配置、Local Hub 与扩展健康状态
 *   smartclip-mcp daemon <action>  → 管理 Local Bridge Hub 后台进程 (start|run|stop|status)
 *   smartclip-mcp --healthcheck    → 快速探测 Hub 与扩展状态
 *   smartclip-mcp --help           → 显示帮助
 *   smartclip-mcp --version        → 显示版本
 */

import { readFile } from 'node:fs/promises'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { BridgeTransport } from 'smartclip-bridge-protocol'
import { DEFAULT_WS_PORT, WebSocketBridge, parseAllowedOriginsEnv } from './bridge/websocketBridge.js'
import { formatDoctorHuman, runHealthcheck, runMcpDoctor } from './cli/doctor.js'
import { runSetup } from './cli/setup.js'
import {
  HttpBridgeTransport,
  ensureHubRunning,
  probeHub,
  stopHub,
} from './hub/hubClient.js'
import { HubServer } from './hub/hubServer.js'
import { createSmartClipMcpServer } from './server.js'

async function loadVersion(): Promise<string> {
  try {
    const packageJsonPath = new URL('../package.json', import.meta.url)
    const content = await readFile(packageJsonPath, 'utf-8')
    const pkg = JSON.parse(content) as { version?: string }
    return pkg.version || '1.6.1'
  }
  catch {
    return '1.6.1'
  }
}

function parsePortFlag(args: string[]): number {
  const idx = args.indexOf('--port')
  if (idx !== -1 && args[idx + 1]) {
    const parsed = Number.parseInt(args[idx + 1], 10)
    if (Number.isFinite(parsed) && parsed > 0)
      return parsed
  }
  const envPort = process.env.SMARTCLIP_MCP_PORT ? Number.parseInt(process.env.SMARTCLIP_MCP_PORT, 10) : NaN
  return Number.isFinite(envPort) && envPort > 0 ? envPort : DEFAULT_WS_PORT
}

function printHelp(version: string): void {
  console.log(`smartclip-mcp v${version} - SmartClip Local Bridge Hub & MCP Server

用法:
  smartclip-mcp                  启动 MCP Server (stdio 模式，自动复用 Local Hub)
  smartclip-mcp setup [选项]     一键配置 Claude Code / Cursor / Gemini CLI / Windsurf / .mcp.json
  smartclip-mcp doctor [选项]    诊断客户端配置、Local Hub 与扩展连接状态
  smartclip-mcp daemon <命令>    管理 Local Bridge Hub 后台服务 (start | stop | status | run)
  smartclip-mcp --healthcheck    快速健康检查（毫秒级，不阻塞）
  smartclip-mcp --help           显示此帮助信息
  smartclip-mcp --version        显示版本号

常用选项:
  --no-daemon                    禁用共享 Hub，在当前进程内直连（单客户端兼容模式）
  --json                         以 JSON 格式输出（适用于 doctor / --healthcheck / daemon status）
  --port <port>                  指定本地端口（默认 18365）

环境变量:
  SMARTCLIP_MCP_SESSION_TOKEN    扩展握手认证 token (可选)
  SMARTCLIP_MCP_WS_BIND_HOST     监听地址 (默认 127.0.0.1)
  SMARTCLIP_MCP_ALLOWED_ORIGINS  逗号分隔的精确 WebSocket Origin 白名单（设置后覆盖默认规则）
  SMARTCLIP_MCP_PORT             监听端口（默认 18365，同 --port）
  SMARTCLIP_MCP_NO_DAEMON        设为 1 时禁用共享 Hub，在当前进程直连
  SMARTCLIP_HOME                 自定义状态目录（默认 ~/.smartclip）

本地端点:
  WebSocket Bridge: ws://127.0.0.1:18365/
  Streamable HTTP:  http://127.0.0.1:18365/mcp
  Health Check:     http://127.0.0.1:18365/health`)
}

async function handleDaemonCommand(subArgs: string[], version: string): Promise<number> {
  const action = subArgs[0] ?? 'status'
  const port = parsePortFlag(subArgs)
  const json = subArgs.includes('--json')

  if (action === 'run') {
    const hub = new HubServer({
      port,
      version,
      sessionToken: process.env.SMARTCLIP_MCP_SESSION_TOKEN,
    })
    await hub.start()

    await new Promise<void>((resolve) => {
      const shutdown = () => {
        void hub.stop().finally(resolve)
      }
      process.once('SIGINT', shutdown)
      process.once('SIGTERM', shutdown)
    })
    return 0
  }

  if (action === 'start') {
    const result = await ensureHubRunning({
      port,
      expectedVersion: version,
      sessionToken: process.env.SMARTCLIP_MCP_SESSION_TOKEN,
      allowedOrigins: parseAllowedOriginsEnv(process.env.SMARTCLIP_MCP_ALLOWED_ORIGINS),
      bindHost: process.env.SMARTCLIP_MCP_WS_BIND_HOST,
    })
    if (json) {
      console.log(JSON.stringify({ ok: true, spawned: result.spawned, health: result.health }, null, 2))
    }
    else {
      console.log(result.spawned
        ? `✅ 已启动 SmartClip Local Hub (pid=${result.health.hub.pid}, port=${result.port})`
        : `ℹ️ SmartClip Local Hub 已在运行 (pid=${result.health.hub.pid}, port=${result.port})`)
    }
    return 0
  }

  if (action === 'stop') {
    const res = await stopHub({ port })
    if (json) {
      console.log(JSON.stringify(res, null, 2))
    }
    else if (res.stopped) {
      console.log('✅ 已停止 SmartClip Local Hub')
    }
    else {
      console.log(`ℹ️ ${res.reason}`)
    }
    return res.stopped ? 0 : 1
  }

  if (action === 'status') {
    const health = await probeHub({ port, probeExtension: true })
    if (json) {
      console.log(JSON.stringify({ running: Boolean(health), health }, null, 2))
    }
    else if (!health) {
      console.log(`⚪ SmartClip Local Hub 未运行 (port=${port})`)
    }
    else {
      console.log(`🟢 SmartClip Local Hub 运行中 (pid=${health.hub.pid}, port=${health.hub.port}, sessions=${health.hub.activeMcpSessions}, extensionConnected=${health.bridge.extensionConnected})`)
    }
    return health ? 0 : 1
  }

  console.error(`未知 daemon 子命令: ${action}（可选: start | stop | status | run）`)
  return 1
}

async function startStdioServer(args: string[], version: string): Promise<void> {
  const port = parsePortFlag(args)
  const noDaemon = args.includes('--no-daemon') || process.env.SMARTCLIP_MCP_NO_DAEMON === '1'

  let transportBridge: BridgeTransport
  let cleanup: (() => Promise<void>) | undefined

  if (!noDaemon) {
    const sessionToken = process.env.SMARTCLIP_MCP_SESSION_TOKEN
    const allowedOrigins = parseAllowedOriginsEnv(process.env.SMARTCLIP_MCP_ALLOWED_ORIGINS)
    const bindHost = process.env.SMARTCLIP_MCP_WS_BIND_HOST
    try {
      const hubInfo = await ensureHubRunning({
        port,
        expectedVersion: version,
        sessionToken,
        allowedOrigins,
        bindHost,
      })
      transportBridge = new HttpBridgeTransport({
        host: hubInfo.host,
        port: hubInfo.port,
        hubSecret: hubInfo.hubSecret,
        expectedVersion: version,
        sessionToken,
        allowedOrigins,
        bindHost,
      })
      process.stderr.write(`[smartclip-mcp] Connected to Local Hub (pid=${hubInfo.health.hub.pid}, port=${hubInfo.port})\n`)
    }
    catch (err) {
      process.stderr.write(`[smartclip-mcp] Local Hub unavailable (${err instanceof Error ? err.message : String(err)}), falling back to standalone bridge\n`)
      const bridge = new WebSocketBridge({
        port,
        sessionToken: process.env.SMARTCLIP_MCP_SESSION_TOKEN,
      })
      await bridge.connect()
      transportBridge = bridge
      cleanup = () => bridge.disconnect()
    }
  }
  else {
    const bridge = new WebSocketBridge({
      port,
      sessionToken: process.env.SMARTCLIP_MCP_SESSION_TOKEN,
    })
    await bridge.connect()
    transportBridge = bridge
    cleanup = () => bridge.disconnect()
  }

  const server = createSmartClipMcpServer({
    version,
    transport: transportBridge,
  })

  const stdioTransport = new StdioServerTransport()
  await server.connect(stdioTransport)
  process.stderr.write('[smartclip-mcp] MCP Server started (stdio transport)\n')

  if (cleanup) {
    process.once('SIGINT', () => {
      void cleanup!().finally(() => process.exit(0))
    })
    process.once('SIGTERM', () => {
      void cleanup!().finally(() => process.exit(0))
    })
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const version = await loadVersion()

  if (args.includes('--help') || args.includes('-h')) {
    printHelp(version)
    process.exit(0)
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(`smartclip-mcp v${version}`)
    process.exit(0)
  }

  if (args.includes('--healthcheck')) {
    const port = parsePortFlag(args)
    const json = args.includes('--json')
    const code = await runHealthcheck({ port, json })
    process.exit(code)
  }

  const command = args[0]

  if (command === 'setup') {
    await runSetup(args.slice(1))
    process.exit(0)
  }

  if (command === 'doctor') {
    const subArgs = args.slice(1)
    const report = await runMcpDoctor({
      port: parsePortFlag(subArgs),
      checkHealth: !subArgs.includes('--no-health'),
    })
    if (subArgs.includes('--json')) {
      console.log(JSON.stringify(report, null, 2))
    }
    else {
      console.log(formatDoctorHuman(report))
    }
    process.exit(report.ok ? 0 : 1)
  }

  if (command === 'daemon') {
    const code = await handleDaemonCommand(args.slice(1), version)
    process.exit(code)
  }

  await startStdioServer(args, version)
}

main().catch((error) => {
  const err = error instanceof Error ? error : new Error(String(error))
  process.stderr.write(`[smartclip-mcp] Fatal error: ${err.message}\n`)
  process.exitCode = 1
})
