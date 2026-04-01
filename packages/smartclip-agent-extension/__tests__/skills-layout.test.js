const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const skillsDir = path.join(root, 'skills')
const skillNames = [
  'smartclip-read',
  'smartclip-save',
  'smartclip-daily',
  'smartclip-troubleshooting',
]

function readSkill(name) {
  return fs.readFileSync(path.join(skillsDir, name, 'SKILL.md'), 'utf8')
}

test('scenario-based skill files exist with frontmatter', () => {
  for (const name of skillNames) {
    const file = path.join(skillsDir, name, 'SKILL.md')
    assert.equal(fs.existsSync(file), true, `${name} should exist`)
    const content = fs.readFileSync(file, 'utf8')
    assert.match(content, /^---\n[\s\S]+?\n---\n/)
    assert.match(content, /description:/)
  }
})

test('umbrella skill becomes a router to focused skills', () => {
  const content = readSkill('smartclip')
  assert.match(content, /smartclip-read/)
  assert.match(content, /smartclip-save/)
  assert.match(content, /smartclip-daily/)
  assert.match(content, /smartclip-troubleshooting/)
})
