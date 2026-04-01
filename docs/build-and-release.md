# SmartClip Agent 构建与发布手册

本文档面向维护者，说明如何在本地构建、验证并发布 `smartclip-agent` monorepo 中的 npm 包。

## 1. 仓库结构

`smartclip-agent` 是一个 pnpm monorepo，当前包含 3 个核心包：

| 包名 | 目录 | 作用 |
|---|---|---|
| `smartclip-bridge-protocol` | `packages/smartclip-bridge-protocol` | MCP WebSocket 桥接协议的共享类型、schema、错误码 |
| `smartclip-mcp` | `packages/smartclip-mcp` | MCP stdio server，负责与 AI 客户端通信，并启动本地 WebSocket server |
| `smartclip-agent-extension` | `packages/smartclip-agent-extension` | 安装 skills / hooks / doctor CLI 的辅助包 |

根目录脚本：

```bash
pnpm build              # 等价于 pnpm -r build
pnpm changeset          # 添加 changeset（交互式）
pnpm changeset:version  # 更新版本号和 CHANGELOG
pnpm changeset:publish  # 发布到 npm
pnpm release            # 构建 + 发布
```

## 2. 发布前准备

### Step 1：准备环境

要求：
- Node.js >= 18
- pnpm
- 已登录 npm：

```bash
npm whoami
```

如果未登录：

```bash
npm login
```

### Step 2：安装依赖

在仓库根目录执行：

```bash
cd smartclip-agent
pnpm install
```

### Step 3：确认工作区干净

建议发布前保证 git 工作区干净：

```bash
git status
```

如果存在未提交改动，建议先：
- 提交
- 或单独切换到 release 分支/标签后再发布

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

如果要单独排查某个包：

```bash
pnpm --filter smartclip-bridge-protocol build
pnpm --filter smartclip-mcp build
```

## 4. 发布前验证

### Step 1：运行协议包测试

```bash
cd packages/smartclip-bridge-protocol
pnpm test
```

### Step 2：运行 MCP 包测试

```bash
cd ../smartclip-mcp
pnpm test
```

当前应覆盖：
- protocol contract tests
- handshake tests
- structured output tests
- mock extension integration tests

### Step 3：运行 extension 包测试

```bash
cd ../smartclip-agent-extension
node __tests__/doctor.test.js
node __tests__/skills-layout.test.js
```

### Step 4：可选的打包前检查

建议检查各包的 `package.json` 中以下字段是否正确：
- `name`
- `version`
- `license`
- `repository`
- `files`
- `bin`

特别注意：
- `smartclip-mcp` 的发布产物来自 `dist/`
- `smartclip-agent-extension` 的发布产物包含 `install.js`、`bin/doctor.js`、`skills/`、`hooks/`
- `smartclip-bridge-protocol` 需要先构建出 `dist/`

## 5. 版本管理（Changesets 流程）

本仓库使用 **Changesets** 管理版本和 CHANGELOG。Changesets 是专为 monorepo 设计的工具，支持独立版本号和自动处理包间依赖。

### 5.1 开发时添加 Changeset

每次完成一个功能或修复后，运行：

```bash
pnpm changeset
```

CLI 会交互式提示：

1. **选择受影响的包**：用空格选择，回车确认
   - `smartclip-bridge-protocol`
   - `smartclip-mcp`
   - `smartclip-agent-extension`

2. **选择变更类型**：
   - `patch` - 修复 bug（0.0.x）
   - `minor` - 新功能（0.x.0）
   - `major` - 重大变更（x.0.0）

3. **输入变更描述**：用于 CHANGELOG 的摘要

完成后会在 `.changeset/` 目录生成一个 markdown 文件，如：

```markdown
---
"smartclip-mcp": minor
---

Add batch clipping tool for processing multiple pages
```

提交这个 changeset 文件：

```bash
git add .changeset/*.md
git commit -m "feat(mcp): add batch clipping tool"
```

### 5.2 版本更新流程

当准备发布时：

```bash
# 1. 查看待发布的 changesets
ls .changeset/*.md  # 排除 config.json 和 README.md

# 2. 运行版本更新（更新 package.json + 生成 CHANGELOG.md）
pnpm changeset:version

# 3. 提交版本变更
git add .
git commit -m "chore: version packages"
```

`changeset:version` 会：
- 根据 changesets 更新各包的版本号
- 为每个包生成 `CHANGELOG.md`
- 自动更新依赖包的版本（如 bridge-protocol 更新时，smartclip-mcp 自动 patch bump）

### 5.3 自动依赖更新

由于 `smartclip-mcp` 依赖 `smartclip-bridge-protocol`，当后者更新时：

| bridge-protocol 变更 | bridge-protocol 版本 | smartclip-mcp 版本 |
|---|---|---|
| patch | 0.1.0 → 0.1.1 | 0.7.0 → 0.7.1（自动） |
| minor | 0.1.0 → 0.2.0 | 0.7.0 → 0.7.1（自动） |
| major | 0.1.0 → 1.0.0 | 0.7.0 → 0.7.1（自动） |

这是由 `.changeset/config.json` 中 `updateInternalDependencies: "patch"` 控制的。

### 5.4 CHANGELOG 格式

生成的 `packages/smartclip-mcp/CHANGELOG.md` 示例：

```markdown
# smartclip-mcp

## 0.8.0

### Minor Changes

- 7a3b2c1: Add batch clipping tool for processing multiple pages

### Patch Changes

- Updated dependencies [5d4e3f2]
  - smartclip-bridge-protocol@0.1.1

## 0.7.0

### Minor Changes

- 3c2d1e0: Initial MCP server release
```

## 6. 推荐发布顺序

虽然根目录提供了 `pnpm publish-all`，但从维护角度，建议理解发布顺序：

1. `smartclip-bridge-protocol`
2. `smartclip-mcp`
3. `smartclip-agent-extension`

原因：
- `smartclip-mcp` 依赖 `smartclip-bridge-protocol`
- `smartclip-agent-extension` 与前两者耦合较低，通常最后发布

## 7. 执行发布

使用 Changesets 一键发布：

```bash
# 构建 + 发布到 npm
pnpm release

# 或分步执行：
pnpm build
pnpm changeset:publish

# 推送 git tags
git push --follow-tags
```

Changesets 会自动：
- 发布所有有变更的包到 npm
- 为每个包创建 git tag（如 `smartclip-mcp@0.8.0`）
- 保持正确的发布顺序（依赖包先发布）

### 验证发布状态

```bash
# 查看本地 tags
git tag -l

# 确认 npm 版本
npm view smartclip-bridge-protocol version
npm view smartclip-mcp version
npm view smartclip-agent-extension version
```

## 8. 发布后验证

### Step 1：确认 npm 上版本可见

```bash
npm view smartclip-bridge-protocol version
npm view smartclip-mcp version
npm view smartclip-agent-extension version
```

### Step 2：本地模拟安装

在一个临时目录中测试：

```bash
mkdir -p /tmp/smartclip-agent-smoke
cd /tmp/smartclip-agent-smoke
npm init -y
npm install -D smartclip-mcp smartclip-agent-extension
```

### Step 3：验证 CLI

```bash
npx smartclip-mcp --help || true
npx smartclip-agent-doctor --json || true
```

### Step 4：验证 skills 安装

在包含 `.claude/skills` 或 `.gemini/skills` 的目录中执行：

```bash
npx smartclip-agent-extension
```

然后确认以下目录已生成：
- `using-smartclip-mcp`
- `read-webpage-with-smartclip`
- `save-with-smartclip`
- `process-smartclip-daily-tasks`
- `smartclip-troubleshooting`

## 9. 常见发布问题

### 问题 1：`tsc` 失败

排查：
```bash
pnpm build
pnpm --filter smartclip-mcp build
pnpm --filter smartclip-bridge-protocol build
```

### 问题 2：测试通过但发布后命令不可用

检查：
- `bin` 字段是否正确
- 发布包是否包含目标文件
- `files` 字段是否遗漏 `dist/` 或 `bin/`

### 问题 3：doctor 正常但用户仍无法连接扩展

通常与运行环境有关：
- Chrome 未打开
- SmartClip 扩展未启用 MCP
- Premium 未开通
- session token 不一致

## 10. 推荐发布检查清单

发布前建议逐项确认：

- [ ] `pnpm install`
- [ ] `pnpm build`
- [ ] `smartclip-bridge-protocol` 测试通过
- [ ] `smartclip-mcp` 测试通过
- [ ] `smartclip-agent-extension` 测试通过
- [ ] 添加 changeset（`pnpm changeset`）
- [ ] 运行版本更新（`pnpm changeset:version`）
- [ ] 提交版本变更
- [ ] npm 已登录
- [ ] 至少完成一次本地 smoke test

完成以上步骤后再执行 `pnpm release` 正式发布。
