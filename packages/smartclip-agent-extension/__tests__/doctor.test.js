const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { runDoctor } = require('../bin/doctor.js')

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
})
