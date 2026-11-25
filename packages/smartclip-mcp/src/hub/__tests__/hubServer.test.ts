import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { BRIDGE_PROTOCOL_VERSION, BridgeAction, createBridgeInvoker } from 'smartclip-bridge-protocol'
import { WebSocket } from 'ws'
import { HttpBridgeTransport, probeHub, shouldRestartHub } from '../hubClient.js'
import { HubServer } from '../hubServer.js'
import { hashSessionToken, readHubState } from '../hubState.js'

async function connectMockExtension(port: number, sessionToken?: string, origin = 'chrome-extension://testextensionid'): Promise<WebSocket> {
  return await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/`, {
      headers: origin ? { Origin: origin } : {},
    })

    ws.on('error', reject)

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'hello',
        id: 'hello-1',
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        ...(sessionToken ? { sessionToken } : {}),
        clientName: 'smartclip-extension',
        clientVersion: '1.0.0',
        capabilities: { clipPage: true },
      }))
    })

    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw)) as { type?: string }
      if (msg.type === 'hello_ack') {
        resolve(ws)
      }
    })
  })
}

describe('HubServer integration', () => {
  let tmpHome: string
  let hub: HubServer
  let extWs: WebSocket | null = null

  beforeEach(async () => {
    tmpHome = await mkdtemp(path.join(os.tmpdir(), 'smartclip-hub-test-'))
    hub = new HubServer({
      port: 0,
      host: '127.0.0.1',
      sessionToken: 'hub-ext-token',
      smartclipHome: tmpHome,
    })
    await hub.start()
  })

  afterEach(async () => {
    extWs?.close()
    extWs = null
    await hub.stop()
    await rm(tmpHome, { recursive: true, force: true })
  })

  it('persists hub.json and responds to /health and /health?probe=1', async () => {
    const state = await readHubState(tmpHome)
    expect(state?.port).toBe(hub.actualPort)
    expect(state?.hubSecret).toBe(hub.secret)
    expect(state?.tokenFingerprint).toBe(hashSessionToken('hub-ext-token'))
    expect(state?.tokenFingerprint).not.toBe('hub-ext-token')

    const beforeExt = await probeHub({ port: hub.actualPort })
    expect(beforeExt?.ok).toBe(false)
    expect(beforeExt?.bridge.extensionConnected).toBe(false)
    expect(beforeExt?.hub.tokenFingerprint).toBe(hashSessionToken('hub-ext-token'))

    extWs = await connectMockExtension(hub.actualPort, 'hub-ext-token')
    extWs.on('message', (raw) => {
      const msg = JSON.parse(String(raw)) as { id?: string, action?: string }
      if (msg.action === BridgeAction.GET_STATUS && msg.id) {
        extWs!.send(JSON.stringify({
          id: msg.id,
          success: true,
          data: {
            serverListening: true,
            extensionConnected: true,
            mcpEnabled: true,
            pro: true,
            protocolVersion: '1',
            extensionVersion: '1.0.0',
          },
        }))
      }
    })

    const withProbe = await probeHub({ port: hub.actualPort, probeExtension: true })
    expect(withProbe?.ok).toBe(true)
    expect(withProbe?.extensionStatus?.pro).toBe(true)
  })

  it('rejects webpage Origins on WebSocket upgrade and internal HTTP endpoints', async () => {
    await expect(new Promise<void>((resolve, reject) => {
      const evilWs = new WebSocket(`ws://127.0.0.1:${hub.actualPort}/`, {
        headers: { Origin: 'https://evil.example.com' },
      })
      evilWs.on('open', () => {
        evilWs.close()
        reject(new Error('Should have rejected webpage Origin'))
      })
      evilWs.on('unexpected-response', (_req, res) => {
        expect(res.statusCode).toBe(403)
        resolve()
      })
      evilWs.on('error', () => {
        // unexpected-response 之外兜底
      })
    })).resolves.toBeUndefined()

    const noSecret = await fetch(`http://127.0.0.1:${hub.actualPort}/bridge/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: BridgeAction.LIST_TABS }),
    })
    expect(noSecret.status).toBe(401)

    const withBrowserOrigin = await fetch(`http://127.0.0.1:${hub.actualPort}/bridge/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://evil.example.com',
        'x-smartclip-hub-secret': hub.secret,
      },
      body: JSON.stringify({ action: BridgeAction.LIST_TABS }),
    })
    expect(withBrowserOrigin.status).toBe(403)
  })

  it('multiplexes multiple concurrent HttpBridgeTransport clients and serializes clip-page calls', async () => {
    extWs = await connectMockExtension(hub.actualPort, 'hub-ext-token')
    const events: string[] = []

    extWs.on('message', (raw) => {
      const msg = JSON.parse(String(raw)) as { id?: string, action?: string, data?: { url?: string } }
      if (!msg.id || !msg.action)
        return

      if (msg.action === BridgeAction.LIST_TABS) {
        extWs!.send(JSON.stringify({
          id: msg.id,
          success: true,
          data: [{ id: 1, title: 'Tab1', url: 'https://example.com', active: true, windowId: 1 }],
        }))
        return
      }

      if (msg.action === BridgeAction.CLIP_PAGE) {
        const label = msg.data?.url ?? 'unknown'
        events.push(`start:${label}`)
        setTimeout(() => {
          events.push(`end:${label}`)
          extWs!.send(JSON.stringify({
            id: msg.id,
            success: true,
            markdown: `# ${label}`,
            clip: { url: label, title: `Title ${label}` },
          }))
        }, 40)
      }
    })

    const client1 = createBridgeInvoker(new HttpBridgeTransport({
      port: hub.actualPort,
      hubSecret: hub.secret,
      smartclipHome: tmpHome,
      autoReconnect: false,
    }))
    const client2 = createBridgeInvoker(new HttpBridgeTransport({
      port: hub.actualPort,
      hubSecret: hub.secret,
      smartclipHome: tmpHome,
      autoReconnect: false,
    }))

    const [tabs1, clip1, clip2] = await Promise.all([
      client1.invoke(BridgeAction.LIST_TABS),
      client1.invoke(BridgeAction.CLIP_PAGE, { url: 'https://a.example', mode: 'full' }),
      client2.invoke(BridgeAction.CLIP_PAGE, { url: 'https://b.example', mode: 'full' }),
    ])

    expect(tabs1.count).toBe(1)
    expect(clip1.markdown).toBe('# https://a.example')
    expect(clip2.markdown).toBe('# https://b.example')

    // 确认 CLIP_PAGE 严格串行执行，不交错
    expect(events).toEqual([
      'start:https://a.example',
      'end:https://a.example',
      'start:https://b.example',
      'end:https://b.example',
    ])
  })

  it('serves multiple Streamable HTTP MCP clients with tools, prompts, and read_page markdown output', async () => {
    extWs = await connectMockExtension(hub.actualPort, 'hub-ext-token')
    extWs.on('message', (raw) => {
      const msg = JSON.parse(String(raw)) as { id?: string, action?: string }
      if (msg.action === BridgeAction.CLIP_PAGE && msg.id) {
        extWs!.send(JSON.stringify({
          id: msg.id,
          success: true,
          markdown: '# Streamable Title\n\nContent from browser',
          clip: { url: 'https://news.example.com', title: 'Streamable Title' },
        }))
      }
    })

    const mcpUrl = new URL(`http://127.0.0.1:${hub.actualPort}/mcp`)
    const clientA = new Client({ name: 'test-client-a', version: '1.0.0' })
    const clientB = new Client({ name: 'test-client-b', version: '1.0.0' })
    const transportA = new StreamableHTTPClientTransport(mcpUrl)
    const transportB = new StreamableHTTPClientTransport(mcpUrl)

    await Promise.all([
      clientA.connect(transportA),
      clientB.connect(transportB),
    ])

    const [toolsRes, promptsRes, callRes] = await Promise.all([
      clientA.listTools(),
      clientB.listPrompts(),
      clientA.callTool({ name: 'read_page', arguments: { mode: 'full' } }),
    ])

    expect(toolsRes.tools.map(t => t.name)).toContain('read_page')
    expect(toolsRes.tools.map(t => t.name)).toContain('clip_page')
    expect(promptsRes.prompts.map(p => p.name)).toEqual(
      expect.arrayContaining(['read-webpage', 'clip-webpage', 'process-daily-tasks', 'research-and-save']),
    )

    const textBlock = (callRes.content as Array<{ type: string, text?: string }>)[0]
    expect(textBlock?.text).toContain('# Streamable Title')
    expect(textBlock?.text).toContain('Content from browser')
    expect(callRes.structuredContent).toMatchObject({
      url: 'https://news.example.com',
      title: 'Streamable Title',
      truncated: false,
    })

    const healthAfterConnect = await probeHub({ port: hub.actualPort })
    expect(healthAfterConnect?.hub.activeMcpSessions).toBe(2)

    await transportA.terminateSession()
    await transportB.terminateSession()
    await clientA.close()
    await clientB.close()
  })

  it('evaluates Hub consistency correctly in shouldRestartHub', () => {
    const baseHub = {
      version: '1.6.1',
      tokenFingerprint: hashSessionToken('secret-1'),
      allowedOrigins: ['chrome-extension://ext-a'],
      bindHost: '127.0.0.1',
    }

    // 配置一致：复用
    expect(shouldRestartHub(baseHub, {
      version: '1.6.1',
      tokenFingerprint: hashSessionToken('secret-1'),
      allowedOrigins: ['chrome-extension://ext-a'],
      bindHost: '127.0.0.1',
    })).toBeNull()

    // 已有 token 但新客户端未设 token：不降级重启，直接复用安全 Hub
    expect(shouldRestartHub(baseHub, {
      version: '1.6.1',
      tokenFingerprint: null,
    })).toBeNull()

    // 版本变化：触发重启
    expect(shouldRestartHub(baseHub, { version: '1.6.2' })).toContain('version changed')

    // 新设或变更 token：触发重启
    expect(shouldRestartHub(baseHub, {
      version: '1.6.1',
      tokenFingerprint: hashSessionToken('secret-2'),
    })).toBe('sessionToken changed')
    expect(shouldRestartHub({ version: '1.6.1', tokenFingerprint: null }, {
      version: '1.6.1',
      tokenFingerprint: hashSessionToken('secret-1'),
    })).toBe('sessionToken changed')

    // allowedOrigins 变更：触发重启
    expect(shouldRestartHub(baseHub, {
      version: '1.6.1',
      allowedOrigins: ['chrome-extension://ext-b'],
    })).toBe('allowedOrigins changed')

    // bindHost 变更：触发重启
    expect(shouldRestartHub(baseHub, {
      version: '1.6.1',
      bindHost: '0.0.0.0',
    })).toContain('bindHost changed')
  })
})
