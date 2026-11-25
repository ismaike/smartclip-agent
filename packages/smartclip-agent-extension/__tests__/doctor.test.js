const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { runDoctor, formatSessionContext, main } = require('../bin/doctor.js')

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'smartclip-doctor-'))
}

test('runDoctor reports structured diagnostics', async () => {
  const cwd = makeTempDir()
  fs.writeFileSync(path.join(cwd, '.mcp.json'), JSON.stringify({ mcpServers: {} }, null, 2))

  const result = await runDoctor({
    cwd,
    checkHealth: false,
    execCommand: async () => { throw new Error('missing') },
  })

  assert.equal(typeof result.ok, 'boolean')
  assert.ok(result.checks.some(check => check.name === 'mcp-config'))
  assert.ok(result.checks.some(check => check.name === 'mcp-server-installed'))
  assert.ok(result.checks.some(check => check.name === 'skills-installed'))
  assert.ok(result.checks.some(check => check.name === 'skills-deployed'))
})

test('skills-deployed reports not installed when no directories exist', async () => {
  const cwd = makeTempDir()
  const home = makeTempDir()

  const result = await runDoctor({
    cwd,
    home,
    checkHealth: false,
    execCommand: async () => ({ ok: false, stderr: 'missing' }),
  })

  const deployedCheck = result.checks.find(c => c.name === 'skills-deployed')
  assert.equal(deployedCheck.ok, false)
  assert.ok(deployedCheck.detail.includes('no agent skill directories'))
})

test('main --session-context exits 0 even when unhealthy (hook 只透传一段提示)', async () => {
  const unhealthy = async () => ({
    ok: false,
    checks: [{ name: 'mcp-config', ok: false, detail: 'missing' }],
  })
  const code = await main(['node', 'doctor', '--session-context', '--no-health'], unhealthy)
  assert.equal(code, 0)
})

test('main human/json modes keep result-based exit code', async () => {
  const unhealthy = async () => ({ ok: false, checks: [] })
  const healthy = async () => ({ ok: true, checks: [] })

  assert.equal(await main(['node', 'doctor', '--no-health'], unhealthy), 1)
  assert.equal(await main(['node', 'doctor', '--json', '--no-health'], unhealthy), 1)
  assert.equal(await main(['node', 'doctor', '--no-health'], healthy), 0)
})

test('formatSessionContext returns healthy message when ok', () => {
  const result = { ok: true, checks: [] }
  const output = formatSessionContext(result)
  assert.ok(output.includes('healthy'))
})

test('formatSessionContext returns setup message when mcp-config fails', () => {
  const result = {
    ok: false,
    checks: [{ name: 'mcp-config', ok: false, detail: 'missing' }],
  }
  const output = formatSessionContext(result)
  assert.ok(output.includes('setup issues'))
  assert.ok(output.includes('.mcp.json'))
})

test('formatSessionContext returns deployment message when skills-deployed fails', () => {
  const result = {
    ok: false,
    checks: [
      { name: 'mcp-config', ok: true, detail: 'ok' },
      { name: 'mcp-server-installed', ok: true, detail: 'ok' },
      { name: 'skills-installed', ok: true, detail: 'ok' },
      { name: 'skills-deployed', ok: false, detail: 'not installed' },
    ],
  }
  const output = formatSessionContext(result)
  assert.ok(output.includes('skill deployment'))
  assert.ok(output.includes('smartclip-agent-extension'))
})

test('runDoctor detects smartclip config in global client files like ~/.claude.json', async () => {
  const cwd = makeTempDir()
  const home = makeTempDir()
  fs.writeFileSync(
    path.join(home, '.claude.json'),
    JSON.stringify({ mcpServers: { smartclip: { command: 'npx', args: ['-y', 'smartclip-mcp'] } } }, null, 2),
  )

  const result = await runDoctor({
    cwd,
    home,
    checkHealth: false,
    execCommand: async () => ({ ok: true, stdout: 'ok' }),
  })

  const configCheck = result.checks.find(c => c.name === 'mcp-config')
  assert.equal(configCheck.ok, true)
  assert.ok(configCheck.detail.includes('~/.claude.json'))
})
