import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline/promises'
import { DEFAULT_WS_PORT } from '../bridge/websocketBridge.js'
import {
  buildSmartClipServerEntry,
  getClientConfigTargets,
  inspectClientConfigs,
  upsertSmartClipConfig,
  type ClientConfigTarget,
  type ClientKind,
  type McpTransportKind,
} from './clientConfigs.js'

export interface SetupOptions {
  clients: ClientKind[]
  transport: McpTransportKind
  port: number
  host: string
  sessionToken?: string
  dryRun: boolean
  interactive: boolean
}

export function parseSetupArgs(args: string[]): SetupOptions {
  let clientArg: string | undefined
  let transport: McpTransportKind = 'stdio'
  let port = DEFAULT_WS_PORT
  let host = '127.0.0.1'
  let sessionToken = process.env.SMARTCLIP_MCP_SESSION_TOKEN
  let dryRun = false

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if ((arg === '--client' || arg === '-c') && args[i + 1]) {
      clientArg = args[++i]
    }
    else if ((arg === '--transport' || arg === '-t') && args[i + 1]) {
      const value = args[++i]
      if (value === 'http' || value === 'stdio')
        transport = value
      else
        throw new Error(`不支持的传输方式: ${value}（可选: stdio | http）`)
    }
    else if (arg === '--port' && args[i + 1]) {
      const parsed = Number.parseInt(args[++i], 10)
      if (!Number.isFinite(parsed) || parsed <= 0)
        throw new Error('无效的 --port 参数')
      port = parsed
    }
    else if (arg === '--host' && args[i + 1]) {
      host = args[++i]
    }
    else if (arg === '--token' && args[i + 1]) {
      sessionToken = args[++i]
    }
    else if (arg === '--dry-run') {
      dryRun = true
    }
  }

  const validKinds = new Set<ClientKind>(['project', 'claude', 'cursor', 'gemini', 'windsurf'])
  let clients: ClientKind[] = []

  if (clientArg) {
    if (clientArg === 'all') {
      clients = ['project', 'claude', 'cursor', 'gemini', 'windsurf']
    }
    else {
      const parsed = clientArg.split(',').map(s => s.trim()).filter(Boolean)
      for (const item of parsed) {
        if (!validKinds.has(item as ClientKind)) {
          throw new Error(`未知客户端: ${item}（可选: project, claude, cursor, gemini, windsurf, all）`)
        }
        clients.push(item as ClientKind)
      }
    }
  }

  return {
    clients,
    transport,
    port,
    host,
    sessionToken,
    dryRun,
    interactive: clients.length === 0 && Boolean(process.stdin.isTTY) && !process.env.CI,
  }
}

async function selectClientsInteractively(
  targets: ClientConfigTarget[],
  home: string,
): Promise<ClientKind[]> {
  const detected = targets.filter((t) => {
    if (t.id === 'project')
      return true
    if (t.id === 'claude')
      return existsSync(t.filePath) || existsSync(path.join(home, '.claude'))
    return existsSync(path.dirname(t.filePath)) || existsSync(t.filePath)
  })

  const choices = detected.length > 0 ? detected : targets
  console.log('\n🚀 SmartClip MCP 一键配置向导\n')
  console.log('检测到以下可用客户端配置位置（输入序号，多个用逗号分隔）:\n')
  choices.forEach((choice, idx) => {
    console.log(`  [${idx + 1}] ${choice.label}`)
  })
  console.log('  [a] 全部写入')
  console.log('  [q] 取消\n')

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = (await rl.question('请选择 (默认: 1): ')).trim().toLowerCase()
    if (answer === 'q' || answer === 'quit')
      return []
    if (answer === 'a' || answer === 'all')
      return choices.map(c => c.id)
    if (!answer)
      return [choices[0].id]

    const indices = answer
      .split(/[,，\s]+/)
      .map(s => Number.parseInt(s, 10) - 1)
      .filter(i => i >= 0 && i < choices.length)

    return indices.length > 0 ? indices.map(i => choices[i].id) : [choices[0].id]
  }
  finally {
    rl.close()
  }
}

export async function runSetup(
  args: string[],
  env: { home?: string, cwd?: string } = {},
): Promise<{ writtenFiles: string[], skipped: boolean }> {
  const home = env.home ?? os.homedir()
  const cwd = env.cwd ?? process.cwd()
  const options = parseSetupArgs(args)
  const allTargets = getClientConfigTargets({ home, cwd })

  let selectedIds = options.clients
  if (selectedIds.length === 0) {
    if (options.interactive) {
      selectedIds = await selectClientsInteractively(allTargets, home)
      if (selectedIds.length === 0) {
        console.log('已取消配置。')
        return { writtenFiles: [], skipped: true }
      }
    }
    else {
      const inspected = await inspectClientConfigs({ home, cwd })
      const existingGlobal = inspected.filter(c => c.id !== 'project' && c.fileExists).map(c => c.id)
      selectedIds = existingGlobal.length > 0 ? existingGlobal : ['project']
    }
  }

  const writtenFiles: string[] = []
  for (const id of selectedIds) {
    const target = allTargets.find(t => t.id === id)
    if (!target)
      continue
    const entry = buildSmartClipServerEntry({
      client: id,
      transport: options.transport,
      port: options.port,
      host: options.host,
      sessionToken: options.sessionToken,
    })
    const res = await upsertSmartClipConfig(target.filePath, entry, { dryRun: options.dryRun })
    writtenFiles.push(res.filePath)
    const prefix = options.dryRun ? '[dry-run] 将写入' : '✅ 已写入'
    console.log(`${prefix}: ${res.filePath} (${options.transport})`)
  }

  if (!options.dryRun && writtenFiles.length > 0) {
    console.log('\n下一步：')
    console.log('1. 确保 Chrome 中已安装 SmartClip 扩展并开启 MCP 服务（Pro）')
    if (options.transport === 'http') {
      console.log('2. 运行 smartclip-mcp daemon start 启动后台 Local Bridge Hub（HTTP 模式需手动启动 Hub；若设置了 token 请在启动时传入 SMARTCLIP_MCP_SESSION_TOKEN）')
      console.log('3. 运行 smartclip-mcp doctor 检查环境与连接状态，然后重启对应的 AI 客户端使配置生效')
    }
    else {
      console.log('2. 重启对应的 AI 客户端使配置生效（或先运行 smartclip-mcp daemon start 启动后台 Hub）')
      console.log('3. 运行 smartclip-mcp doctor 检查环境与连接状态')
    }
  }

  return { writtenFiles, skipped: false }
}
