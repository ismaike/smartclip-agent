import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DEFAULT_WS_PORT } from '../bridge/websocketBridge.js'

export type ClientKind = 'project' | 'claude' | 'cursor' | 'gemini' | 'windsurf'
export type McpTransportKind = 'stdio' | 'http'

export interface ClientConfigTarget {
  id: ClientKind
  label: string
  filePath: string
  supportsHttp: boolean
}

export interface InspectedClientConfig extends ClientConfigTarget {
  fileExists: boolean
  configured: boolean
  parseError?: string
}

export interface BuildServerEntryOptions {
  transport: McpTransportKind
  client?: ClientKind
  port?: number
  host?: string
  sessionToken?: string
}

export function getClientConfigTargets(env: { home?: string, cwd?: string } = {}): ClientConfigTarget[] {
  const home = env.home ?? os.homedir()
  const cwd = env.cwd ?? process.cwd()

  return [
    {
      id: 'project',
      label: '项目目录 (.mcp.json)',
      filePath: path.join(cwd, '.mcp.json'),
      supportsHttp: true,
    },
    {
      id: 'claude',
      label: 'Claude Code (~/.claude.json)',
      filePath: path.join(home, '.claude.json'),
      supportsHttp: true,
    },
    {
      id: 'cursor',
      label: 'Cursor (~/.cursor/mcp.json)',
      filePath: path.join(home, '.cursor', 'mcp.json'),
      supportsHttp: true,
    },
    {
      id: 'gemini',
      label: 'Gemini CLI (~/.gemini/settings.json)',
      filePath: path.join(home, '.gemini', 'settings.json'),
      supportsHttp: true,
    },
    {
      id: 'windsurf',
      label: 'Windsurf (~/.codeium/windsurf/mcp_config.json)',
      filePath: path.join(home, '.codeium', 'windsurf', 'mcp_config.json'),
      supportsHttp: true,
    },
  ]
}

export async function inspectClientConfigs(env: { home?: string, cwd?: string } = {}): Promise<InspectedClientConfig[]> {
  const targets = getClientConfigTargets(env)
  const results: InspectedClientConfig[] = []

  for (const target of targets) {
    if (!existsSync(target.filePath)) {
      results.push({ ...target, fileExists: false, configured: false })
      continue
    }

    try {
      const content = await readFile(target.filePath, 'utf8')
      const parsed = JSON.parse(content) as { mcpServers?: Record<string, unknown> }
      const configured = Boolean(
        parsed
        && typeof parsed === 'object'
        && parsed.mcpServers
        && typeof parsed.mcpServers === 'object'
        && 'smartclip' in parsed.mcpServers,
      )
      results.push({ ...target, fileExists: true, configured })
    }
    catch (err) {
      results.push({
        ...target,
        fileExists: true,
        configured: false,
        parseError: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return results
}

export function buildSmartClipServerEntry(options: BuildServerEntryOptions): Record<string, unknown> {
  if (options.transport === 'http') {
    const host = options.host ?? '127.0.0.1'
    const port = options.port ?? DEFAULT_WS_PORT
    const mcpUrl = `http://${host}:${port}/mcp`

    if (options.client === 'claude' || options.client === 'project') {
      return {
        type: 'http',
        url: mcpUrl,
      }
    }
    if (options.client === 'gemini') {
      return {
        httpUrl: mcpUrl,
      }
    }
    return {
      url: mcpUrl,
    }
  }

  const entry: Record<string, unknown> = {
    command: 'npx',
    args: ['-y', 'smartclip-mcp'],
  }

  if (options.sessionToken) {
    entry.env = {
      SMARTCLIP_MCP_SESSION_TOKEN: options.sessionToken,
    }
  }

  return entry
}

export async function upsertSmartClipConfig(
  filePath: string,
  entry: Record<string, unknown>,
  options: { dryRun?: boolean } = {},
): Promise<{ filePath: string, updated: boolean, content: string }> {
  let root: Record<string, unknown> = {}

  if (existsSync(filePath)) {
    const raw = await readFile(filePath, 'utf8')
    const trimmed = raw.trim()
    if (trimmed.length > 0) {
      const parsed: unknown = JSON.parse(trimmed)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`配置文件 ${filePath} 根节点不是 JSON 对象`)
      }
      root = parsed as Record<string, unknown>
    }
  }

  const existingServers = root.mcpServers
  const mcpServers: Record<string, unknown> = (
    existingServers && typeof existingServers === 'object' && !Array.isArray(existingServers)
      ? { ...(existingServers as Record<string, unknown>) }
      : {}
  )

  mcpServers.smartclip = entry
  const nextRoot: Record<string, unknown> = {
    ...root,
    mcpServers,
  }
  const content = `${JSON.stringify(nextRoot, null, 2)}\n`

  if (!options.dryRun) {
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, content, 'utf8')
  }

  return {
    filePath,
    updated: true,
    content,
  }
}
