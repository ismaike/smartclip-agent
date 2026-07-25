# SmartClip Agent 构建与发布手册

本文档面向维护者，说明如何在本地构建、验证并发布 `smartclip-agent` monorepo 中的 npm 包。

## 1. 仓库结构

`smartclip-agent` 是一个 pnpm monorepo，当前包含 3 个核心包：

| 包名 | 目录 | 作用 |
|---|---|---|
| `smartclip-bridge-protocol` | `packages/smartclip-bridge-protocol` | MCP WebSocket 桥接协议的共享类型、schema、错误码、Bridge Action 契约（输入/归一化结果校验与归一化逻辑） |
| `smartclip-mcp` | `packages/smartclip-mcp` | MCP stdio server，负责与 AI 客户端通信，并启动本地 WebSocket server |
| `smartclip-agent-extension` | `packages/smartclip-agent-extension` | 安装 skills / hooks / doctor CLI 的辅助包 |

根目录脚本：

```bash
pnpm build    # 构建全部包
pnpm test     # 运行全部测试
```

## 2. 版本管理（Release Please）

本仓库使用 **release-please**（通过 GitHub Actions）自动管理版本号、CHANGELOG 和 GitHub Release。

### 2.1 Commit 规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

```
type(scope): 描述
```

**type 与版本影响：**

| type | 版本影响 | CHANGELOG 分类 |
|------|---------|---------------|
| `feat` | `minor` (0.x.0) | ✨ Features |
| `fix` | `patch` (0.0.x) | 🐛 Bug Fixes |
| `perf` | `patch` | ⚡ Performance Improvements |
| `revert` | `patch` | ⏪ Reverts |
| `docs` | 不触发 | 📝 Documentation |
| `style` | 不触发 | 💄 Styles |
| `refactor` | 不触发 | 🔨 Code Refactoring |
| `test` | 不触发 | 🧪 Tests |
| `build` | 不触发 | 📦 Build System |

**BREAKING CHANGE** 会触发 `major` 版本。在 commit body 中写明：

```
feat(mcp): 改变连接协议

BREAKING CHANGE: 握手流程从同步改为异步
```

### 2.2 单包版本控制

在 scope 中使用包名前缀，只更新对应包：

```
feat(mcp): 添加批量剪藏工具
fix(bridge-protocol): 修复类型定义
chore(agent-extension): 更新安装脚本
```

包名映射：

| scope | 包 |
|---|---|
| `mcp` | `smartclip-mcp` |
| `bridge-protocol` | `smartclip-bridge-protocol` |
| `agent-extension` | `smartclip-agent-extension` |

### 2.3 自动发布流程

```
推送符合规范的 commit 到 main
        ↓
release-please Action 自动运行
        ↓
创建 Release PR
  - 自动计算版本号
  - 自动更新 CHANGELOG.md
  - 自动更新 .release-please-manifest.json
        ↓
你审阅 PR，确认无误后合并
        ↓
自动创建 GitHub Release + Git Tag
```

### 2.4 本地预览

在推送到 main 之前，可以本地预览 release-please 会生成什么：

```bash
npx release-please release-pr --dry-run --target-branch=main
```

## 3. 本地构建

### Step 1：构建全部包

```bash
pnpm build
```

这会递归执行：
- `packages/smartclip-bridge-protocol`: `tsc`
- `packages/smartclip-mcp`: `tsc`
- `smartclip-agent-extension` 当前无 build 步骤

### Step 2：单包构建（可选）

```bash
pnpm --filter smartclip-bridge-protocol build
pnpm --filter smartclip-mcp build
```

## 4. 发布前验证

### 运行测试

```bash
pnpm test
```

或单包测试：

```bash
pnpm --filter smartclip-bridge-protocol test
pnpm --filter smartclip-mcp test
pnpm --filter smartclip-agent-extension test
```

### 打包前检查

注意各包的发布产物：
- `smartclip-mcp` 的发布产物来自 `dist/`
- `smartclip-agent-extension` 的发布产物包含 `install.js`、`bin/doctor.js`、`skills/`、`hooks/`
- `smartclip-bridge-protocol` 需要先构建出 `dist/`

## 5. 手动发布（可选）

release-please 会自动创建 GitHub Release，但如果你需要手动发布到 npm：

```bash
# 确保已登录 npm
npm whoami

# 按依赖顺序发布
pnpm --filter smartclip-bridge-protocol publish
pnpm --filter smartclip-mcp publish
pnpm --filter smartclip-agent-extension publish
```

## 6. 发布后验证

```bash
# 确认 npm 版本
npm view smartclip-bridge-protocol version
npm view smartclip-mcp version
npm view smartclip-agent-extension version

# 本地模拟安装
mkdir -p /tmp/smartclip-agent-smoke
cd /tmp/smartclip-agent-smoke
npm init -y
npm install -D smartclip-mcp smartclip-agent-extension
npx smartclip-agent-doctor --json || true
```
