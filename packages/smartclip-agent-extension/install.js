#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const targetDirs = [
  { name: 'Gemini CLI', dir: '.gemini/skills' },
  { name: 'Claude Code', dir: '.claude/skills' },
  { name: 'OpenCode', dir: '.opencode/skills' },
  { name: 'Sisyphus', dir: '.sisyphus/skills' }
];

const skillNames = [
  'using-smartclip-mcp',
  'read-webpage-with-smartclip',
  'save-with-smartclip',
  'process-smartclip-daily-tasks',
  'smartclip-troubleshooting'
];
const userHome = process.env.HOME || process.env.USERPROFILE;
const projectRoot = process.cwd(); // Assume the user runs this in their project root

console.log('🚀 Installing SmartClip AI Agent Skills...');

targetDirs.forEach(({ name, dir }) => {
  // We can install to project root or global home. We'll try both to be safe.
  const globalPath = path.join(userHome, dir, 'using-smartclip-mcp');
  const localPath = path.join(projectRoot, dir, 'using-smartclip-mcp');

  [globalPath, localPath].forEach(targetPath => {
    // Only install if the parent skills directory exists
    const parentDir = path.dirname(targetPath);
    if (fs.existsSync(parentDir)) {
      try {
        fs.mkdirSync(parentDir, { recursive: true });

        for (const skillName of skillNames) {
          const skillTargetPath = path.join(parentDir, skillName)
          fs.mkdirSync(skillTargetPath, { recursive: true })
          const sourceFile = path.join(__dirname, 'skills', skillName, 'SKILL.md')
          const targetFile = path.join(skillTargetPath, 'SKILL.md')
          fs.copyFileSync(sourceFile, targetFile)
          console.log(`✅ Installed skill for ${name} at: ${targetFile}`)
        }
      } catch (err) {
        console.error(`❌ Failed to install skill for ${name} at ${targetPath}:`, err.message);
      }
    }
  });
});

console.log('🎉 Installation complete! The AI agent can now intelligently use SmartClip MCP.');
