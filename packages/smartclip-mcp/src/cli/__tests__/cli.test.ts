import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildSmartClipServerEntry,
  inspectClientConfigs,
  upsertSmartClipConfig,
} from '../clientConfigs.js'
import { runHealthcheck, runMcpDoctor } from '../doctor.js'
import { runSetup } from '../setup.js'

describe('CLI clientConfigs, setup, and doctor', () => {
  let tmpRoot: string
  let homeDir: string
  let cwdDir: string

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'smartclip-cli-test-'))
    homeDir = path.join(tmpRoot, 'home')
    cwdDir = path.join(tmpRoot, 'project')
    await mkdir(homeDir, { recursive: true })
    await mkdir(cwdDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  it('inspects all client config paths and preserves existing mcpServers on upsert', async () => {
    const cursorConfigPath = path.join(homeDir, '.cursor', 'mcp.json')
    await mkdir(path.dirname(cursorConfigPath), { recursive: true })
    await writeFile(cursorConfigPath, JSON.stringify({
      theme: 'dark',
      mcpServers: {
        otherServer: { command: 'node', args: ['other.js'] },
      },
    }, null, 2))

    const before = await inspectClientConfigs({ home: homeDir, cwd: cwdDir })
    expect(before.find(c => c.id === 'cursor')?.fileExists).toBe(true)
    expect(before.find(c => c.id === 'cursor')?.configured).toBe(false)

    const httpEntry = buildSmartClipServerEntry({ transport: 'http', port: 18365 })
    await upsertSmartClipConfig(cursorConfigPath, httpEntry)

    const updated = JSON.parse(await readFile(cursorConfigPath, 'utf8')) as {
      theme: string
      mcpServers: Record<string, unknown>
    }
    expect(updated.theme).toBe('dark')
    expect(updated.mcpServers.otherServer).toEqual({ command: 'node', args: ['other.js'] })
    expect(updated.mcpServers.smartclip).toEqual({ url: 'http://127.0.0.1:18365/mcp' })

    const after = await inspectClientConfigs({ home: homeDir, cwd: cwdDir })
    expect(after.find(c => c.id === 'cursor')?.configured).toBe(true)
  })

  it('runSetup writes specified client configs and supports dry-run', async () => {
    const dryRes = await runSetup(
      ['--client', 'project,gemini', '--transport', 'stdio', '--token', 'abc', '--dry-run'],
      { home: homeDir, cwd: cwdDir },
    )
    expect(dryRes.writtenFiles).toHaveLength(2)
    const beforeCheck = await inspectClientConfigs({ home: homeDir, cwd: cwdDir })
    expect(beforeCheck.every(c => !c.configured)).toBe(true)

    await runSetup(
      ['--client', 'project,gemini', '--transport', 'stdio', '--token', 'abc'],
      { home: homeDir, cwd: cwdDir },
    )
    const geminiContent = JSON.parse(
      await readFile(path.join(homeDir, '.gemini', 'settings.json'), 'utf8'),
    ) as { mcpServers: { smartclip: { command: string, env?: Record<string, string> } } }

    expect(geminiContent.mcpServers.smartclip.command).toBe('npx')
    expect(geminiContent.mcpServers.smartclip.env?.SMARTCLIP_MCP_SESSION_TOKEN).toBe('abc')
  })

  it('runMcpDoctor checks multi-client configs and hub/extension health', async () => {
    await runSetup(['--client', 'claude'], { home: homeDir, cwd: cwdDir })

    const unhealthyReport = await runMcpDoctor({
      home: homeDir,
      cwd: cwdDir,
      probeHubFn: async () => null,
    })
    expect(unhealthyReport.ok).toBe(false)
    expect(unhealthyReport.checks.find(c => c.name === 'client-configs')?.ok).toBe(true)
    expect(unhealthyReport.checks.find(c => c.name === 'hub-daemon')?.ok).toBe(false)

    const healthyReport = await runMcpDoctor({
      home: homeDir,
      cwd: cwdDir,
      probeHubFn: async () => ({
        ok: true,
        hub: {
          pid: 12345,
          version: '1.6.1',
          startedAt: new Date().toISOString(),
          uptimeSec: 10,
          activeMcpSessions: 1,
          port: 18365,
          host: '127.0.0.1',
        },
        bridge: {
          ok: true,
          serverListening: true,
          port: 18365,
          bindHost: '127.0.0.1',
          extensionConnected: true,
          authenticated: true,
          legacyMode: false,
          tokenRequired: false,
          clientMetadata: {
            protocolVersion: '1',
            clientName: 'smartclip-extension',
            clientVersion: '1.0.0',
            capabilities: {},
          },
          lastHandshakeFailure: { code: null, message: null },
          lastDisconnectFailure: { closeCode: null, reason: null },
          pendingRequestCount: 0,
          serverVersion: '1.6.1',
        },
        extensionStatus: {
          serverListening: true,
          extensionConnected: true,
          mcpEnabled: true,
          pro: true,
          protocolVersion: '1',
          extensionVersion: '1.0.0',
          lastErrorCode: null,
          lastErrorMessage: null,
          reconnectAttempts: 0,
          nextReconnectAt: null,
          lastCloseCode: null,
          lastCloseReason: null,
          capabilities: {},
          clientVersion: null,
        },
      }),
    })

    expect(healthyReport.ok).toBe(true)
    expect(healthyReport.checks.every(c => c.ok)).toBe(true)

    const exitOk = await runHealthcheck({
      probeHubFn: async () => healthyReport.hubHealth,
    })
    expect(exitOk).toBe(0)

    const exitFail = await runHealthcheck({
      probeHubFn: async () => null,
    })
    expect(exitFail).toBe(1)
  })

  it('builds client-specific HTTP server entries and writes them via runSetup', async () => {
    expect(buildSmartClipServerEntry({ transport: 'http', client: 'claude', port: 18365 })).toEqual({
      type: 'http',
      url: 'http://127.0.0.1:18365/mcp',
    })
    expect(buildSmartClipServerEntry({ transport: 'http', client: 'project', port: 18365 })).toEqual({
      type: 'http',
      url: 'http://127.0.0.1:18365/mcp',
    })
    expect(buildSmartClipServerEntry({ transport: 'http', client: 'gemini', port: 18365 })).toEqual({
      httpUrl: 'http://127.0.0.1:18365/mcp',
    })
    expect(buildSmartClipServerEntry({ transport: 'http', client: 'cursor', port: 18365 })).toEqual({
      url: 'http://127.0.0.1:18365/mcp',
    })

    await runSetup(
      ['--client', 'claude,gemini,cursor', '--transport', 'http'],
      { home: homeDir, cwd: cwdDir },
    )

    const claudeCfg = JSON.parse(await readFile(path.join(homeDir, '.claude.json'), 'utf8')) as {
      mcpServers: { smartclip: unknown }
    }
    const geminiCfg = JSON.parse(await readFile(path.join(homeDir, '.gemini', 'settings.json'), 'utf8')) as {
      mcpServers: { smartclip: unknown }
    }
    const cursorCfg = JSON.parse(await readFile(path.join(homeDir, '.cursor', 'mcp.json'), 'utf8')) as {
      mcpServers: { smartclip: unknown }
    }

    expect(claudeCfg.mcpServers.smartclip).toEqual({ type: 'http', url: 'http://127.0.0.1:18365/mcp' })
    expect(geminiCfg.mcpServers.smartclip).toEqual({ httpUrl: 'http://127.0.0.1:18365/mcp' })
    expect(cursorCfg.mcpServers.smartclip).toEqual({ url: 'http://127.0.0.1:18365/mcp' })
  })
})
