#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const {
  SKILL_NAMES,
  AVAILABLE_TARGETS,
  checkDeployment,
} = require('../lib/installTopology.js')

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

async function runDoctor({ cwd = process.cwd(), home = require('node:os').homedir(), checkHealth = true, execCommand = defaultExec } = {}) {
  const rootMcp = path.join(cwd, '.mcp.json')
  const mcpJson = readJsonIfExists(rootMcp)
  const smartclipConfig = mcpJson?.mcpServers?.smartclip

  const skillsInstalled = SKILL_NAMES.every(skill => fs.existsSync(path.join(__dirname, '..', 'skills', skill, 'SKILL.md')))

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

  // 检查 global + project 双 scope 的 skills 部署状态
  const globalDeployment = checkDeployment({ scope: 'global', env: { home }, exists: fs.existsSync })
  const projectDeployment = checkDeployment({ scope: 'project', env: { cwd }, exists: fs.existsSync })

  const allDeployments = [globalDeployment, projectDeployment]
  const anyInstalled = allDeployments.some(d => d.foundTargets.length > 0)
  const allComplete = allDeployments
    .filter(d => d.foundTargets.length > 0)
    .every(d => d.allSkillsPresent)

  const deployedLocations = allDeployments
    .filter(d => d.foundTargets.length > 0)
    .flatMap(d => d.foundTargets.map(t => `${d.scope}:${path.relative(d.scope === 'global' ? home : cwd, t)}`))

  checks.push({
    name: 'skills-deployed',
    ok: anyInstalled && allComplete,
    detail: !anyInstalled
      ? 'no agent skill directories found (run smartclip-agent-extension to install)'
      : allComplete
        ? `skills deployed to ${deployedLocations.join(', ')}`
        : 'some skill directories are missing installed skill files',
  })

  return {
    ok: checks.every(check => check.ok),
    cwd,
    checks,
  }
}

/**
 * 生成面向 SessionStart hook 的会话提示。
 * 由 doctor 持有诊断语义——hook 只做纯传递。
 */
function formatSessionContext(result) {
  if (result.ok) {
    return '<hook_context>SmartClip doctor reports the local MCP setup looks healthy. You can use SmartClip tools when needed.</hook_context>'
  }

  // 按失败类型给出具体提示
  const failedChecks = result.checks.filter(c => !c.ok)
  const hasMcpConfig = failedChecks.some(c => c.name === 'mcp-config')
  const hasServer = failedChecks.some(c => c.name === 'mcp-server-installed')
  const hasHealth = failedChecks.some(c => c.name === 'smartclip-health')
  const hasDeployed = failedChecks.some(c => c.name === 'skills-deployed')

  if (hasMcpConfig || hasServer) {
    return '<hook_context>SmartClip doctor found setup issues. If SmartClip is needed, verify .mcp.json configuration and ensure smartclip-mcp is installed.</hook_context>'
  }
  if (hasHealth) {
    return '<hook_context>SmartClip doctor found connection issues. If SmartClip is needed, ensure the browser extension is installed, MCP service is enabled in SmartClip settings, and the extension is connected.</hook_context>'
  }
  if (hasDeployed) {
    return '<hook_context>SmartClip doctor found skill deployment issues. If SmartClip is needed, run smartclip-agent-extension to install skills.</hook_context>'
  }

  return '<hook_context>SmartClip doctor found setup or connection issues. If SmartClip is needed, verify installation and MCP setup.</hook_context>'
}

function formatHuman(result) {
  const lines = [result.ok ? '✅ SmartClip doctor passed' : '❌ SmartClip doctor found issues']
  for (const check of result.checks)
    lines.push(`${check.ok ? '✅' : '❌'} ${check.name}: ${check.detail}`)
  return lines.join('\n')
}

/**
 * CLI 入口。返回退出码而非直接 process.exit，便于测试。
 *
 * --session-context 模式恒返回 0：会话提示消息本身已区分健康与否，
 * 退出码只用于表达 doctor 自身能否运行（崩溃时由 hook 的 || 兜底）。
 * 否则不健康结果会同时触发 doctor 的具体提示和 shell 的笼统兜底，
 * hook 将收到两段矛盾的 hook_context。
 */
async function main(argv = process.argv, run = runDoctor) {
  const json = argv.includes('--json')
  const noHealth = argv.includes('--no-health')
  const sessionContext = argv.includes('--session-context')
  const result = await run({ checkHealth: !noHealth })

  if (sessionContext) {
    console.log(formatSessionContext(result))
    return 0
  }
  if (json) {
    console.log(JSON.stringify(result, null, 2))
  }
  else {
    console.log(formatHuman(result))
  }
  return result.ok ? 0 : 1
}

if (require.main === module)
  main().then(code => process.exit(code))

module.exports = { runDoctor, formatHuman, formatSessionContext, main }
