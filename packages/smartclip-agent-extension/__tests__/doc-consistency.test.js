const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { SKILL_NAMES, AVAILABLE_TARGETS } = require('../lib/installTopology.js')

const docPath = path.join(__dirname, '..', '..', '..', 'docs', 'install-and-usage.md')
const docContent = fs.readFileSync(docPath, 'utf8')

test('documentation mentions every skill in SKILL_NAMES', () => {
  for (const skill of SKILL_NAMES) {
    assert.ok(
      docContent.includes(skill),
      `Skill "${skill}" from topology module should be mentioned in docs/install-and-usage.md`,
    )
  }
})

test('documentation mentions every target directory', () => {
  for (const target of AVAILABLE_TARGETS) {
    assert.ok(
      docContent.includes(target.dir),
      `Target directory "${target.dir}" from topology module should be mentioned in docs/install-and-usage.md`,
    )
  }
})
