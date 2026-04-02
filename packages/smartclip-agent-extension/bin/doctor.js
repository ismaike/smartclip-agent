#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

function readJsonIfExists(file) {
  if (!fs.existsSync(file))
    return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  }
  catch {
    return null
  }
}

async function defaultExec(command, args, options = {}) {
  return await new Promise((resolve) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => stdout += String(chunk))
    child.stderr.on('data', chunk => stderr += String(chunk))
    child.on('error', error => resolve({ ok: false, error: error.message, stdout, stderr }))
    child.on('close', code => resolve({ ok: code === 0, code, stdout, stderr }))
  })
}

async function runDoctor({ cwd = process.cwd(), checkHealth = true, execCommand = defaultExec } = {}) {
  const rootMcp = path.join(cwd, '.mcp.json')
  const mcpJson = readJsonIfExists(rootMcp)
  const smartclipConfig = mcpJson?.mcpServers?.smartclip

  const skills = [
    'smartclip-read',
    'smartclip-save',
    'smartclip-daily',
    'smartclip-troubleshooting',
  ]
  const skillsInstalled = skills.every(skill => fs.existsSync(path.join(__dirname, '..', 'skills', skill, 'SKILL.md')))

  const checks = []
  checks.push({
    name: 'mcp-config',
    ok: Boolean(smartclipConfig),
    detail: smartclipConfig ? 'smartclip MCP entry found' : 'missing smartclip entry in .mcp.json',
  })

  let serverInstall
  try {
    serverInstall = await execCommand('npx', ['-y', 'smartclip-mcp', '--help'], { cwd })
  }
  catch (err) {
    serverInstall = { ok: false, error: err.message }
  }
  checks.push({
    name: 'mcp-server-installed',
    ok: Boolean(serverInstall.ok),
    detail: serverInstall.ok ? 'smartclip-mcp resolved' : (serverInstall.error || serverInstall.stderr || 'unable to resolve smartclip-mcp'),
  })

  if (checkHealth) {
    const health = await execCommand('npx', ['-y', 'smartclip-mcp', '--healthcheck'], { cwd })
    checks.push({
      name: 'smartclip-health',
      ok: Boolean(health.ok),
      detail: health.ok ? (health.stdout.trim() || 'ok') : (health.error || health.stderr || 'healthcheck failed'),
    })
  }

  checks.push({
    name: 'skills-installed',
    ok: skillsInstalled,
    detail: skillsInstalled ? 'all bundled skill files present' : 'missing bundled skill files',
  })

  // Check whether skills were correctly installed to target directories
  const installTargets = [
    path.join(cwd, '.agents', 'skills'),
    path.join(cwd, '.claude', 'skills'),
    path.join(cwd, '.gemini', 'skills'),
  ]
  const installedTargets = installTargets.filter(dir => fs.existsSync(dir))
  const targetSkillsOk = installedTargets.length === 0 || installedTargets.every(dir =>
    skills.every(skill => fs.existsSync(path.join(dir, skill, 'SKILL.md')))
  )
  checks.push({
    name: 'skills-deployed',
    ok: targetSkillsOk,
    detail: installedTargets.length === 0
      ? 'no agent skill directories found (run smartclip-agent-extension to install)'
      : targetSkillsOk
        ? `skills deployed to ${installedTargets.map(d => path.relative(cwd, d)).join(', ')}`
        : 'some skill directories are missing installed skill files',
  })

  return {
    ok: checks.every(check => check.ok),
    cwd,
    checks,
  }
}

function formatHuman(result) {
  const lines = [result.ok ? '✅ SmartClip doctor passed' : '❌ SmartClip doctor found issues']
  for (const check of result.checks)
    lines.push(`${check.ok ? '✅' : '❌'} ${check.name}: ${check.detail}`)
  return lines.join('\n')
}

async function main() {
  const json = process.argv.includes('--json')
  const noHealth = process.argv.includes('--no-health')
  const result = await runDoctor({ checkHealth: !noHealth })
  if (json)
    console.log(JSON.stringify(result, null, 2))
  else
    console.log(formatHuman(result))
  process.exit(result.ok ? 0 : 1)
}

if (require.main === module)
  main()

module.exports = { runDoctor, formatHuman }
