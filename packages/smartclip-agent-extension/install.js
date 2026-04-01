#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

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

const userHome = process.env.HOME || process.env.USERPROFILE;
const projectRoot = process.cwd();

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    targets: null,
    nonInteractive: false,
    showHelp: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      options.showHelp = true;
    } else if (arg === '--targets' || arg === '-t') {
      options.targets = args[++i]?.split(',').map(t => t.trim()).filter(Boolean);
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
  -t, --targets     指定安装目录（逗号分隔，非交互模式）
  -a, --all         安装到所有支持的目录
  -d, --default     安装到默认目录 (.agents/skills)

示例:
  smartclip-agent-extension                    # 交互式选择
  smartclip-agent-extension --default          # 安装到 .agents/skills
  smartclip-agent-extension --all              # 安装到所有目录
  smartclip-agent-extension --targets .agents/skills,.claude/skills

支持的目录:
  .agents/skills      标准通用目录（推荐）
  .claude/skills      Claude Code
  .gemini/skills      Gemini CLI
`);
}

async function interactiveSelect() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log('\n🚀 SmartClip Agent Skills 安装向导\n');
    console.log('请选择要安装到的目录（输入序号，多个用逗号分隔，如: 1,2,3）:\n');
    
    AVAILABLE_TARGETS.forEach((target, index) => {
      const defaultMark = index === 0 ? ' (默认)' : '';
      console.log(`  [${index + 1}] ${target.name}${defaultMark}`);
      console.log(`      ${target.description}`);
    });
    
    console.log('\n  [a] 全部安装');
    console.log('  [q] 退出\n');

    rl.question('请选择 (默认: 1): ', (answer) => {
      rl.close();
      
      const input = answer.trim().toLowerCase();
      
      if (input === 'q' || input === 'quit') {
        console.log('\n已取消安装。');
        process.exit(0);
      }
      
      if (input === 'a' || input === 'all') {
        return resolve(AVAILABLE_TARGETS.map(t => t.dir));
      }
      
      if (!input) {
        return resolve(['.agents/skills']);
      }
      
      const indices = input.split(/[,，\s]+/).map(s => parseInt(s.trim()) - 1);
      const validIndices = indices.filter(i => i >= 0 && i < AVAILABLE_TARGETS.length);
      
      if (validIndices.length === 0) {
        console.log('\n⚠️  无效选择，使用默认目录 .agents/skills');
        return resolve(['.agents/skills']);
      }
      
      const selectedDirs = validIndices.map(i => AVAILABLE_TARGETS[i].dir);
      resolve(selectedDirs);
    });
  });
}

function installSkills(targetDirs) {
  console.log('\n📦 开始安装 SmartClip Skills...\n');
  
  let installedCount = 0;
  let failedCount = 0;
  const installedPaths = [];

  targetDirs.forEach(dir => {
    const targetPath = path.join(projectRoot, dir);
    
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
        installedPaths.push(skillTargetPath);
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
  
  let targetDirs;
  
  if (options.nonInteractive && options.targets) {
    // 非交互模式：验证并使用指定的目录
    targetDirs = options.targets.filter(t => 
AVAILABLE_TARGETS.some(available => available.dir === t)
    );
    
    if (targetDirs.length === 0) {
      console.log('⚠️  无效的目标目录，使用默认目录 .agents/skills');
      targetDirs = ['.agents/skills'];
    }
  } else if (process.env.CI || !process.stdin.isTTY) {
    console.log('🔍 检测到非交互环境，使用默认目录 .agents/skills');
    targetDirs = ['.agents/skills'];
  } else {
    targetDirs = await interactiveSelect();
  }
  
  installSkills(targetDirs);
}

main().catch(err => {
  console.error('❌ 安装过程出错:', err.message);
  process.exit(1);
});