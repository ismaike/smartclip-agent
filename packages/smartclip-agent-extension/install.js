#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const {
  SKILL_NAMES: skillNames,
  AVAILABLE_TARGETS,
  DEFAULT_TARGET,
  ALL_TARGET_DIRS,
  createInstallPlan,
  createUninstallPlan,
  resolveBasePath,
} = require('./lib/installTopology.js');

const userHome = require('os').homedir();
const projectRoot = process.cwd();

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    command: 'install',
    targets: null,
    scope: null,
    nonInteractive: false,
    showHelp: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (i === 0 && arg === 'doctor') {
      options.command = 'doctor';
      options.doctorArgs = args.slice(1);
      return options;
    } else if (arg === '--help' || arg === '-h') {
      options.showHelp = true;
    } else if (arg === 'uninstall' || arg === 'remove') {
      options.command = 'uninstall';
    } else if (arg === 'upgrade') {
      options.command = 'upgrade';
    } else if (arg === '--uninstall' || arg === '--remove') {
      options.command = 'uninstall';
      options.nonInteractive = true;
    } else if (arg === '--upgrade' || arg === '-u') {
      options.command = 'upgrade';
      options.nonInteractive = true;
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
      options.targets = ALL_TARGET_DIRS;
      options.nonInteractive = true;
    } else if (arg === '--default' || arg === '-d') {
      options.targets = [DEFAULT_TARGET];
      options.nonInteractive = true;
    }
  }

  return options;
}

function showHelp() {
  console.log(`
SmartClip Agent Skills 管理工具

用法:
  smartclip-agent-extension [命令] [选项]

命令:
  install (默认)    安装 Skills
  uninstall         卸载 Skills
  upgrade           升级 Skills（覆盖安装）
  doctor            运行诊断检查（等价于 smartclip-agent-doctor）

安装选项:
  -g, --global      全局安装
  -p, --project     项目安装
  -t, --targets     指定安装目录（逗号分隔）
  -a, --all         安装到所有支持的目录
  -d, --default     安装到默认目录 (.agents/skills)

卸载选项:
  -g, --global      卸载全局 Skills（默认 scope）
  -p, --project     卸载项目 Skills
  -t, --targets     指定卸载目录
  -a, --all         卸载当前 scope 下所有支持的目录

升级选项:
  -g, --global      升级全局 Skills（默认 scope）
  -p, --project     升级项目 Skills
  -t, --targets     指定升级目录
  -a, --all         升级当前 scope 下所有支持的目录

通用选项:
  -h, --help        显示帮助信息

示例:
  # 交互式安装
  smartclip-agent-extension
  
  # 全局安装（默认仅写 ~/.agents/skills）
  smartclip-agent-extension --global
  
  # 项目安装到所有目录
  smartclip-agent-extension --project --all
  
  # 卸载全局默认目录 (~/.agents/skills)
  smartclip-agent-extension uninstall --global
  
  # 卸载全局所有 3 个支持目录
  smartclip-agent-extension uninstall --all

  # 卸载当前项目所有 3 个支持目录
  smartclip-agent-extension uninstall --project --all
  
  # 升级全局所有 3 个支持目录
  smartclip-agent-extension upgrade --global --all

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

async function selectScope(command) {
  const commandLabel = command === 'uninstall' ? '卸载' : '安装';
  
  console.log(`\n🚀 SmartClip Agent Skills ${commandLabel}向导\n`);
  console.log('请选择范围:\n');
  console.log('  [1] 全局 - 用户主目录');
  console.log('      Mac/Linux: ~/.agents/skills 等');
  console.log('      Windows:   %USERPROFILE%\\.agents\\skills 等');
  console.log('');
  console.log('  [2] 项目 - 当前项目目录');
  console.log('      当前目录: ' + projectRoot);
  console.log('');
  console.log('  [q] 退出\n');

  const answer = await prompt('请选择 (默认: 1): ');
  
  const input = answer.toLowerCase();
  
  if (input === 'q' || input === 'quit') {
    console.log('\n已取消。');
    process.exit(0);
  }
  
  if (!input || input === '1') {
    return 'global';
  }
  
  if (input === '2') {
    return 'project';
  }
  
  console.log('\n⚠️  无效选择，使用默认全局');
  return 'global';
}

async function selectTargets(command) {
  const verb = command === 'uninstall' ? '卸载' : '安装到';
  
  console.log(`\n请选择要${verb}的目录（输入序号，多个用逗号分隔）:\n`);
  
  AVAILABLE_TARGETS.forEach((target, index) => {
    const defaultMark = index === 0 ? ' (默认)' : '';
    console.log(`  [${index + 1}] ${target.name}${defaultMark}`);
    console.log(`      ${target.description}`);
  });
  
  console.log('\n  [a] 全部');
  console.log('  [q] 退出\n');

  const answer = await prompt('请选择 (默认: 1): ');
  
  const input = answer.toLowerCase();
  
  if (input === 'q' || input === 'quit') {
    console.log('\n已取消。');
    process.exit(0);
  }
  
  if (input === 'a' || input === 'all') {
    return ALL_TARGET_DIRS;
  }
  
  if (!input) {
    return [DEFAULT_TARGET];
  }
  
  const indices = input.split(/[,，\s]+/).map(s => parseInt(s.trim()) - 1);
  const validIndices = indices.filter(i => i >= 0 && i < AVAILABLE_TARGETS.length);
  
  if (validIndices.length === 0) {
    console.log('\n⚠️  无效选择，使用默认目录 .agents/skills');
    return [DEFAULT_TARGET];
  }
  
  return validIndices.map(i => AVAILABLE_TARGETS[i].dir);
}

function installSkills(targetDirs, scope, isUpgrade = false) {
  const basePath = resolveBasePath(scope, { home: userHome, cwd: projectRoot });
  const scopeLabel = scope === 'global' ? '全局' : '项目';
  const actionLabel = isUpgrade ? '升级' : '安装';
  
  console.log(`\n📦 开始${scopeLabel}${actionLabel} SmartClip Skills...\n`);
  console.log(`   ${actionLabel}位置: ${basePath}\n`);
  
  const plan = createInstallPlan({ scope, targets: targetDirs, packageRoot: __dirname, env: { home: userHome, cwd: projectRoot } });
  
  // 按目标目录分组执行
  const dirs = [...new Set(plan.map(p => p.targetDir))];
  let installedCount = 0;
  let failedCount = 0;
  let upgradedCount = 0;

  dirs.forEach(dir => {
    const dirPlan = plan.filter(p => p.targetDir === dir);
    const isExisting = fs.existsSync(dir);
    
    try {
      fs.mkdirSync(dir, { recursive: true });
      
      for (const entry of dirPlan) {
        if (!fs.existsSync(entry.sourceFile)) {
          console.log(`  ⚠️  源文件不存在: ${entry.skillName}`);
          continue;
        }
        
        const skillTargetDir = path.dirname(entry.targetFile);
        if (fs.existsSync(entry.targetFile)) {
          upgradedCount++;
        }
        
        fs.mkdirSync(skillTargetDir, { recursive: true });
        fs.copyFileSync(entry.sourceFile, entry.targetFile);
      }
      
      const statusLabel = isExisting ? '已升级' : '已安装';
      console.log(`  ✅ ${statusLabel}: ${path.relative(basePath, dir)}`);
      installedCount++;
    } catch (err) {
      console.log(`  ❌ ${actionLabel}失败: ${path.relative(basePath, dir)} - ${err.message}`);
      failedCount++;
    }
  });

  console.log('\n' + '='.repeat(50));
  console.log(`📊 ${actionLabel}完成:`);
  console.log(`   模式: ${scopeLabel}`);
  console.log(`   成功: ${installedCount} 个目录`);
  if (upgradedCount > 0) {
    console.log(`   升级: ${upgradedCount} 个技能`);
  }
  if (failedCount > 0) {
    console.log(`   失败: ${failedCount} 个目录`);
  }
  console.log(`   技能: ${skillNames.length} 个`);
  console.log('='.repeat(50));
  
  if (installedCount > 0) {
    console.log(`\n🎉 ${actionLabel}成功！现在 AI Agent 可以智能地使用 SmartClip MCP 了。`);
    console.log('\n💡 提示: 运行 smartclip-agent-doctor 检查配置状态。');
  }
}

function uninstallSkills(targetDirs, scope) {
  const basePath = resolveBasePath(scope, { home: userHome, cwd: projectRoot });
  const scopeLabel = scope === 'global' ? '全局' : '项目';
  
  console.log(`\n🗑️  开始${scopeLabel}卸载 SmartClip Skills...\n`);
  console.log(`   卸载位置: ${basePath}\n`);
  
  const plan = createUninstallPlan({ scope, targets: targetDirs, env: { home: userHome, cwd: projectRoot } });
  
  // 按目标目录分组执行
  const dirs = [...new Set(plan.map(p => p.targetDir))];
  let removedCount = 0;
  let failedCount = 0;
  let notFoundCount = 0;

  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      console.log(`  ⚠️  目录不存在: ${path.relative(basePath, dir)}`);
      notFoundCount++;
      return;
    }
    
    const dirPlan = plan.filter(p => p.targetDir === dir);
    let removedSkills = 0;
    
    try {
      for (const entry of dirPlan) {
        if (fs.existsSync(entry.skillPath)) {
          fs.rmSync(entry.skillPath, { recursive: true, force: true });
          removedSkills++;
        }
      }
      
      if (removedSkills > 0) {
        console.log(`  ✅ 已卸载: ${path.relative(basePath, dir)} (${removedSkills} 个技能)`);
        removedCount++;
      } else {
        console.log(`  ℹ️  未找到技能: ${path.relative(basePath, dir)}`);
        notFoundCount++;
      }
    } catch (err) {
      console.log(`  ❌ 卸载失败: ${path.relative(basePath, dir)} - ${err.message}`);
      failedCount++;
    }
  });

  console.log('\n' + '='.repeat(50));
  console.log(`📊 卸载完成:`);
  console.log(`   模式: ${scopeLabel}`);
  console.log(`   成功: ${removedCount} 个目录`);
  if (notFoundCount > 0) {
    console.log(`   未找到: ${notFoundCount} 个目录`);
  }
  if (failedCount > 0) {
    console.log(`   失败: ${failedCount} 个目录`);
  }
  console.log('='.repeat(50));
  
  if (removedCount > 0) {
    console.log('\n✅ 卸载成功！如需重新安装，请运行 smartclip-agent-extension。');
  }
}

async function main() {
  const options = parseArgs();

  if (options.command === 'doctor') {
    const { main: runDoctorCli } = require('./bin/doctor.js');
    const code = await runDoctorCli(['node', 'doctor', ...(options.doctorArgs || [])]);
    process.exit(code);
  }
  
  if (options.showHelp) {
    showHelp();
    process.exit(0);
  }
  
  let scope = options.scope;
  let targetDirs = options.targets;
  const command = options.command;
  
  if (options.nonInteractive) {
    if (!scope) {
      scope = 'global';
    }
    if (!targetDirs) {
      targetDirs = [DEFAULT_TARGET];
    }
  } else if (process.env.CI || !process.stdin.isTTY) {
    console.log('🔍 检测到非交互环境，使用默认全局安装到 .agents/skills');
    scope = 'global';
    targetDirs = [DEFAULT_TARGET];
  } else {
    scope = await selectScope(command);
    targetDirs = await selectTargets(command);
  }
  
  if (command === 'uninstall') {
    uninstallSkills(targetDirs, scope);
  } else if (command === 'upgrade') {
    installSkills(targetDirs, scope, true);
  } else {
    installSkills(targetDirs, scope, false);
  }
}

main().catch(err => {
  console.error('❌ 操作过程出错:', err.message);
  process.exit(1);
});
