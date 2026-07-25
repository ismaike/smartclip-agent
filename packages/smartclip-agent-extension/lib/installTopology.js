/**
 * Install Topology — Skills 安装的完整事实源（深 module）。
 *
 * 吸收以下知识，使 install.js 和 doctor.js 只做执行和诊断 adapter：
 * - 发行中有哪些 skills（清单）
 * - 支持哪些目标目录（名称、路径、描述）
 * - scope 如何解析为 basePath（global / project）
 * - 默认推荐目录
 * - 期望的文件集合（源文件 → 目标文件名）
 *
 * 计划函数是纯函数：不触碰文件系统、不读 stdin、不写 stdout。
 */

const path = require('node:path')
const os = require('node:os')

// ─── 事实源 ──────────────────────────────────────────────────

/** 发行中的 skills 清单——install、doctor、测试共享的唯一事实源 */
const SKILL_NAMES = [
  'smartclip-read',
  'smartclip-save',
  'smartclip-daily',
  'smartclip-troubleshooting',
]

/** 支持的目标目录 */
const AVAILABLE_TARGETS = [
  { name: 'Standard (.agents/skills)', dir: '.agents/skills', description: '推荐 - 标准通用目录' },
  { name: 'Claude Code (.claude/skills)', dir: '.claude/skills', description: 'Claude Code 客户端' },
  { name: 'Gemini CLI (.gemini/skills)', dir: '.gemini/skills', description: 'Gemini CLI 客户端' },
]

/** 默认推荐目录 */
const DEFAULT_TARGET = '.agents/skills'

/** 所有目标目录路径 */
const ALL_TARGET_DIRS = AVAILABLE_TARGETS.map(t => t.dir)

// ─── scope 解析（pure，可注入环境） ──────────────────────────

/**
 * 将 scope 解析为 basePath。
 * @param {string} scope — 'global' | 'project'
 * @param {{ home?: string, cwd?: string }} env — 可注入，测试用
 */
function resolveBasePath(scope, env = {}) {
  const home = env.home ?? os.homedir()
  const cwd = env.cwd ?? process.cwd()
  return scope === 'global' ? home : cwd
}

// ─── 安装计划（pure） ────────────────────────────────────────

/**
 * 计算安装计划——每个 skill 在每个 target 下的源→目标文件映射。
 *
 * @param {{ scope: string, targets: string[], packageRoot: string, env?: { home?: string, cwd?: string } }} options
 * @returns {Array<{ targetDir: string, skillName: string, sourceFile: string, targetFile: string }>}
 */
function createInstallPlan({ scope, targets, packageRoot, env = {} }) {
  const basePath = resolveBasePath(scope, env)

  return targets.flatMap(dir =>
    SKILL_NAMES.map(skillName => ({
      targetDir: path.join(basePath, dir),
      skillName,
      sourceFile: path.join(packageRoot, 'skills', skillName, 'SKILL.md'),
      targetFile: path.join(basePath, dir, skillName, 'SKILL.md'),
    })),
  )
}

/**
 * 计算卸载计划——每个 skill 在每个 target 下的路径。
 *
 * @param {{ scope: string, targets: string[], env?: { home?: string, cwd?: string } }} options
 * @returns {Array<{ targetDir: string, skillName: string, skillPath: string }>}
 */
function createUninstallPlan({ scope, targets, env = {} }) {
  const basePath = resolveBasePath(scope, env)

  return targets.flatMap(dir =>
    SKILL_NAMES.map(skillName => ({
      targetDir: path.join(basePath, dir),
      skillName,
      skillPath: path.join(basePath, dir, skillName),
    })),
  )
}

// ─── 部署检查（供 doctor 使用） ──────────────────────────────

/**
 * 检查某个 scope 下 skills 的部署状态。
 *
 * @param {{ scope: string, env?: { home?: string, cwd?: string }, exists?: (p: string) => boolean }} options
 * @returns {{ scope: string, basePath: string, foundTargets: string[], allSkillsPresent: boolean }}
 */
function checkDeployment({ scope, env = {}, exists = require('node:fs').existsSync }) {
  const basePath = resolveBasePath(scope, env)
  const targetPaths = AVAILABLE_TARGETS.map(t => path.join(basePath, t.dir))
  const foundTargets = targetPaths.filter(dir => exists(dir))

  const allSkillsPresent = foundTargets.length > 0 && foundTargets.every(dir =>
    SKILL_NAMES.every(skill => exists(path.join(dir, skill, 'SKILL.md'))),
  )

  return { scope, basePath, foundTargets, allSkillsPresent }
}

module.exports = {
  SKILL_NAMES,
  AVAILABLE_TARGETS,
  DEFAULT_TARGET,
  ALL_TARGET_DIRS,
  resolveBasePath,
  createInstallPlan,
  createUninstallPlan,
  checkDeployment,
}
