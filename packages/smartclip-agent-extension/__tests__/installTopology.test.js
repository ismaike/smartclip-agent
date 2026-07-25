const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const {
  SKILL_NAMES,
  AVAILABLE_TARGETS,
  DEFAULT_TARGET,
  ALL_TARGET_DIRS,
  resolveBasePath,
  createInstallPlan,
  createUninstallPlan,
  checkDeployment,
} = require('../lib/installTopology.js')

// ─── 事实源 ──────────────────────────────────────────────────

test('SKILL_NAMES has 4 scenario-based skills', () => {
  assert.equal(SKILL_NAMES.length, 4)
  assert.ok(SKILL_NAMES.includes('smartclip-read'))
  assert.ok(SKILL_NAMES.includes('smartclip-save'))
  assert.ok(SKILL_NAMES.includes('smartclip-daily'))
  assert.ok(SKILL_NAMES.includes('smartclip-troubleshooting'))
})

test('AVAILABLE_TARGETS has 3 directories', () => {
  assert.equal(AVAILABLE_TARGETS.length, 3)
  const dirs = AVAILABLE_TARGETS.map(t => t.dir)
  assert.ok(dirs.includes('.agents/skills'))
  assert.ok(dirs.includes('.claude/skills'))
  assert.ok(dirs.includes('.gemini/skills'))
})

test('DEFAULT_TARGET is .agents/skills', () => {
  assert.equal(DEFAULT_TARGET, '.agents/skills')
})

test('ALL_TARGET_DIRS matches AVAILABLE_TARGETS', () => {
  assert.deepEqual(ALL_TARGET_DIRS, ['.agents/skills', '.claude/skills', '.gemini/skills'])
})

// ─── resolveBasePath ─────────────────────────────────────────

test('resolveBasePath returns home for global scope', () => {
  assert.equal(resolveBasePath('global', { home: '/fake/home' }), '/fake/home')
})

test('resolveBasePath returns cwd for project scope', () => {
  assert.equal(resolveBasePath('project', { cwd: '/fake/project' }), '/fake/project')
})

// ─── createInstallPlan ───────────────────────────────────────

test('createInstallPlan maps every skill × target', () => {
  const plan = createInstallPlan({
    scope: 'global',
    targets: ['.agents/skills', '.claude/skills'],
    packageRoot: '/pkg',
    env: { home: '/home' },
  })

  assert.equal(plan.length, 4 * 2)

  const first = plan[0]
  assert.equal(first.targetDir, '/home/.agents/skills')
  assert.equal(first.skillName, 'smartclip-read')
  assert.equal(first.sourceFile, '/pkg/skills/smartclip-read/SKILL.md')
  assert.equal(first.targetFile, '/home/.agents/skills/smartclip-read/SKILL.md')
})

test('createInstallPlan respects project scope', () => {
  const plan = createInstallPlan({
    scope: 'project',
    targets: ['.agents/skills'],
    packageRoot: '/pkg',
    env: { cwd: '/proj' },
  })

  assert.equal(plan[0].targetDir, '/proj/.agents/skills')
})

// ─── createUninstallPlan ─────────────────────────────────────

test('createUninstallPlan maps skill paths', () => {
  const plan = createUninstallPlan({
    scope: 'project',
    targets: ['.agents/skills'],
    env: { cwd: '/proj' },
  })

  assert.equal(plan.length, 4)
  assert.equal(plan[0].skillPath, '/proj/.agents/skills/smartclip-read')
})

// ─── checkDeployment ─────────────────────────────────────────

test('checkDeployment reports empty when no target dirs exist', () => {
  const result = checkDeployment({
    scope: 'project',
    env: { cwd: '/empty' },
    exists: () => false,
  })

  assert.equal(result.foundTargets.length, 0)
  assert.equal(result.allSkillsPresent, false)
})

test('checkDeployment reports partial when dir exists but skills missing', () => {
  const result = checkDeployment({
    scope: 'project',
    env: { cwd: '/proj' },
    // Only the target directory exists, but no skill files inside
    exists: (p) => p === path.join('/proj', '.agents', 'skills'),
  })

  assert.equal(result.foundTargets.length, 1)
  assert.equal(result.allSkillsPresent, false)
})

test('checkDeployment reports success when all skills + dirs present', () => {
  const existingPaths = new Set()
  // Simulate .agents/skills with all 4 skills
  for (const skill of SKILL_NAMES) {
    existingPaths.add(path.join('/proj', '.agents', 'skills'))
    existingPaths.add(path.join('/proj', '.agents', 'skills', skill, 'SKILL.md'))
  }

  const result = checkDeployment({
    scope: 'project',
    env: { cwd: '/proj' },
    exists: (p) => existingPaths.has(p),
  })

  assert.equal(result.foundTargets.length, 1)
  assert.equal(result.allSkillsPresent, true)
})
