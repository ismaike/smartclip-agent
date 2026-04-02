#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const os = require('os');

const AVAILABLE_TARGETS = [
  { name: 'Standard (.agents/skills)', dir: '.agents/skills', description: '推荐 - 标准通用目录' },
  { name: 'Claude Code (.claude/skills)', dir: '.claude/skills', description: 'Claude Code 客户端' },
  { name: 'Gemini CLI (.gemini/skills)', dir: '.gemini/skills', description: 'Gemini CLI 客户端' },
];

const skillNames = [
  'smartclip',
  'smartclip-read',
  'smartclip-save',
  'smartclip-daily',
  'smartclip-troubleshooting'
];

const userHome = os.homedir();
const projectRoot = process.cwd();

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    targets: null,
    scope: null,
    nonInteractive: false,
    showHelp: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      options.showHelp = true;
    } else if (arg === '--scope' || arg === '-s') {
      options.scope = args[++i];
      options.nonInteractive = true;
    } else if (arg === '--targets' || arg === '-t') {
      options.targets = args[++i]?.split(',').map(t => t.trim()).filter(Boolean);
      options.nonInteractive = true;
    } else if (arg === '--global' || arg === '-g') {
      options.scope = 'global';
      options.nonInteractive = true;
    } else if (arg === '--project' || arg === '-p') {
      options.scope = 'project';
      options.nonInteractive = true;
    } else if (arg === '--all' || arg === '-a') {
      options.targets = AVAILABLE_TARGETS.map(t => t.dir);
      options.nonInteractive = true;
    } else if (arg === '--default' || arg === '-d') {
      options.targets = ['.agents/skills'];
      options.nonInteractive = true;
    }
  }

  return options;
}

function showHelp() {
  console.log(`
SmartClip Agent Skills 安装工具

用法:
  smartclip-agent-extension [选项]

选项:
  -h, --help        显示帮助信息
  -s, --scope       安装范围: global (全局) 或 project (当前项目)
  -g, --global      全局安装 (等同于 --scope global)
  -p, --project     项目安装 (等同于 --scope project)
  -t, --targets     指定安装目录（逗号分隔）
  -a, --all         安装到所有支持的目录
  -d, --default     安装到默认目录 (.agents/skills)

示例:
  smartclip-agent-extension                    # 交互式选择
  smartclip-agent-extension --global           # 全局安装（交互式选择目录）
  smartclip-agent-extension --project          # 项目安装（交互式选择目录）
  smartclip-agent-extension --global --default # 全局安装到 .agents/skills
  smartclip-agent-extension --project --all    # 项目安装到所有目录
  smartclip-agent-extension -g -t .agents/skills,.claude/skills

全局安装路径:
  Mac/Linux: ~/.agents/skills, ~/.claude/skills, ~/.gemini/skills
  Windows:   %USERPROFILE%\\.agents\\skills 等

项目安装路径:
  当前目录下的 .agents/skills, .claude/skills, .gemini/skills
`);
}

async function prompt(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function selectScope() {
  console.log('\n🚀 SmartClip Agent Skills 安装向导\n');
  console.log('请选择安装范围:\n');
  console.log('  [1] 全局安装 - 安装到用户主目录 (推荐)');
  console.log('      Mac/Linux: ~/.agents/skills 等');
  console.log('      Windows:   %USERPROFILE%\\.agents\\skills 等');
  console.log('');
  console.log('  [2] 项目安装 - 安装到当前项目目录');
  console.log('      当前目录: ' + projectRoot);
  console.log('');
  console.log('  [q] 退出\n');

  const answer = await prompt('请选择 (默认: 1): ');
  
  const input = answer.toLowerCase();
  
  if (input === 'q' || input === 'quit') {
    console.log('\n已取消安装。');
    process.exit(0);
  }
  
  if (!input || input === '1') {
    return 'global';
  }
  
  if (input === '2') {
    return 'project';
  }
  
  console.log('\n⚠️  无效选择，使用默认全局安装');
  return 'global';
}

async function selectTargets() {
  console.log('\n请选择要安装到的目录（输入序号，多个用逗号分隔，如: 1,2,3）:\n');
  
  AVAILABLE_TARGETS.forEach((target, index) => {
    const defaultMark = index === 0 ? ' (默认)' : '';
    console.log(`  [${index + 1}] ${target.name}${defaultMark}`);
    console.log(`      ${target.description}`);
  });
  
  console.log('\n  [a] 全部安装');
  console.log('  [q] 退出\n');

  const answer = await prompt('请选择 (默认: 1): ');
  
  const input = answer.toLowerCase();
  
  if (input === 'q' || input === 'quit') {
    console.log('\n已取消安装。');
    process.exit(0);
  }
  
  if (input === 'a' || input === 'all') {
    return AVAILABLE_TARGETS.map(t => t.dir);
  }
  
  if (!input) {
    return ['.agents/skills'];
  }
  
  const indices = input.split(/[,，\s]+/).map(s => parseInt(s.trim()) - 1);
  const validIndices = indices.filter(i => i >= 0 && i < AVAILABLE_TARGETS.length);
  
  if (validIndices.length === 0) {
    console.log('\n⚠️  无效选择，使用默认目录 .agents/skills');
    return ['.agents/skills'];
  }
  
  return validIndices.map(i => AVAILABLE_TARGETS[i].dir);
}

function installSkills(targetDirs, scope) {
  const basePath = scope === 'global' ? userHome : projectRoot;
  const scopeLabel = scope === 'global' ? '全局' : '项目';
  
  console.log(`\n📦 开始${scopeLabel}安装 SmartClip Skills...\n`);
  console.log(`   安装位置: ${basePath}\n`);
  
  let installedCount = 0;
  let failedCount = 0;

  targetDirs.forEach(dir => {
    const targetPath = path.join(basePath, dir);
    
    try {
      fs.mkdirSync(targetPath, { recursive: true });
      
      for (const skillName of skillNames) {
        const skillTargetPath = path.join(targetPath, skillName);
        fs.mkdirSync(skillTargetPath, { recursive: true });
        
        const sourceFile = path.join(__dirname, 'skills', skillName, 'SKILL.md');
        const targetFile = path.join(skillTargetPath, 'SKILL.md');
        
        if (!fs.existsSync(sourceFile)) {
          console.log(`  ⚠️  源文件不存在: ${skillName}`);
          continue;
        }
        
        fs.copyFileSync(sourceFile, targetFile);
      }
      
      console.log(`  ✅ 已安装到: ${dir}`);
      installedCount++;
    } catch (err) {
      console.log(`  ❌ 安装失败: ${dir} - ${err.message}`);
      failedCount++;
    }
  });

  console.log('\n' + '='.repeat(50));
  console.log(`📊 安装完成:`);
  console.log(`   模式: ${scopeLabel}`);
  console.log(`   成功: ${installedCount} 个目录`);
  if (failedCount > 0) {
    console.log(`   失败: ${failedCount} 个目录`);
  }
  console.log(`   技能: ${skillNames.length} 个`);
  console.log('='.repeat(50));
  
  if (installedCount > 0) {
    console.log('\n🎉 安装成功！现在 AI Agent 可以智能地使用 SmartClip MCP 了。');
    console.log('\n💡 提示: 运行 smartclip-agent-doctor 检查配置状态。');
  }
}

async function main() {
  const options = parseArgs();
  
  if (options.showHelp) {
    showHelp();
    process.exit(0);
  }
  
  let scope = options.scope;
  let targetDirs = options.targets;
  
  if (options.nonInteractive) {
    if (!scope) {
      scope = 'global';
    }
    if (!targetDirs) {
      targetDirs = ['.agents/skills'];
    }
  } else if (process.env.CI || !process.stdin.isTTY) {
    console.log('🔍 检测到非交互环境，使用默认全局安装到 .agents/skills');
    scope = 'global';
    targetDirs = ['.agents/skills'];
  } else {
    scope = await selectScope();
    targetDirs = await selectTargets();
  }
  
  installSkills(targetDirs, scope);
}

main().catch(err => {
  console.error('❌ 安装过程出错:', err.message);
  process.exit(1);
});