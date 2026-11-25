import { createHash, randomBytes } from 'node:crypto'
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export interface HubStateFile {
  pid: number
  port: number
  host: string
  hubSecret: string
  version: string
  startedAt: string
  tokenFingerprint?: string | null
  allowedOrigins?: string[] | null
  bindHost?: string
}

/**
 * 计算 sessionToken 的 SHA-256 指纹，避免在磁盘或 /health 中暴露明文密钥。
 */
export function hashSessionToken(token: string | undefined): string | null {
  if (!token)
    return null
  return createHash('sha256').update(token).digest('hex')
}

/**
 * 归一化并去重排序 allowedOrigins 列表，用于持久化与一致性比较。
 */
export function normalizeAllowedOrigins(origins: readonly string[] | undefined): string[] | null {
  if (!origins || origins.length === 0)
    return null
  const unique = [...new Set(origins.map(s => s.trim()).filter(Boolean))].sort()
  return unique.length > 0 ? unique : null
}

export function getSmartClipHome(envHome?: string): string {
  return envHome ?? process.env.SMARTCLIP_HOME ?? path.join(os.homedir(), '.smartclip')
}

export function getHubStatePath(smartclipHome?: string): string {
  return path.join(getSmartClipHome(smartclipHome), 'hub.json')
}

export function generateHubSecret(): string {
  return randomBytes(32).toString('hex')
}

export async function readHubState(smartclipHome?: string): Promise<HubStateFile | null> {
  const filePath = getHubStatePath(smartclipHome)
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<HubStateFile>
    if (
      typeof parsed.pid === 'number'
      && typeof parsed.port === 'number'
      && typeof parsed.host === 'string'
      && typeof parsed.hubSecret === 'string'
      && typeof parsed.version === 'string'
      && typeof parsed.startedAt === 'string'
    ) {
      const state: HubStateFile = {
        pid: parsed.pid,
        port: parsed.port,
        host: parsed.host,
        hubSecret: parsed.hubSecret,
        version: parsed.version,
        startedAt: parsed.startedAt,
      }
      if (typeof parsed.tokenFingerprint === 'string' || parsed.tokenFingerprint === null) {
        state.tokenFingerprint = parsed.tokenFingerprint
      }
      if (
        parsed.allowedOrigins === null
        || (Array.isArray(parsed.allowedOrigins) && parsed.allowedOrigins.every(item => typeof item === 'string'))
      ) {
        state.allowedOrigins = parsed.allowedOrigins
      }
      if (typeof parsed.bindHost === 'string') {
        state.bindHost = parsed.bindHost
      }
      return state
    }
    return null
  }
  catch {
    return null
  }
}

export async function writeHubState(state: HubStateFile, smartclipHome?: string): Promise<string> {
  const dir = getSmartClipHome(smartclipHome)
  const filePath = getHubStatePath(smartclipHome)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  try {
    await chmod(filePath, 0o600)
  }
  catch {
    // Windows 等平台忽略 chmod 限制
  }
  return filePath
}

export async function removeHubStateIfOwned(pid: number, smartclipHome?: string): Promise<void> {
  const current = await readHubState(smartclipHome)
  if (current && current.pid === pid) {
    await rm(getHubStatePath(smartclipHome), { force: true })
  }
}
