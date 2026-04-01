# SmartClip Agent

`smartclip-agent` 是 SmartClip 的 AI agent 集成仓库，用于把 Chrome 扩展能力提供给 Claude Code、Gemini CLI、OpenCode、Cursor、Windsurf 等客户端。

它主要解决三类问题：
- 让 AI 读取真实浏览器中的网页内容（包括登录态页面）
- 让 AI 直接调用 SmartClip 的剪藏与保存能力
- 让 AI 通过 skills、hooks、doctor 更稳定地发现和使用这些能力

## 仓库包含什么

这是一个 pnpm monorepo，当前包含 3 个包：

| 包名 | 目录 | 作用 |
|---|---|---|
| `smartclip-bridge-protocol` | `packages/smartclip-bridge-protocol` | 共享桥接协议类型、错误码、schema |
| `smartclip-mcp` | `packages/smartclip-mcp` | MCP server（stdio）+ 本地 WebSocket bridge |
| `smartclip-agent-extension` | `packages/smartclip-agent-extension` | skills、hooks、doctor CLI、安装脚本 |

## 建议阅读顺序

### 如果你是普通使用者
先看：

- [`docs/install-and-usage.md`](docs/install-and-usage.md)

这份手册按步骤说明：
- 如何安装 `smartclip-mcp`
- 如何配置 `.mcp.json`
- 如何安装 `smartclip-agent-extension`
- 如何运行 doctor
- 如何在不同 AI 客户端中使用 SmartClip

### 如果你是维护者 / 发布者
先看：

- [`docs/build-and-release.md`](docs/build-and-release.md)

这份手册按步骤说明：
- monorepo 结构
- 本地构建流程
- 发布前验证
- 版本管理
- npm 发布顺序
- 发布后 smoke test

## 给用户的快速开始

### Step 1：安装并配置 SmartClip Chrome 扩展

你必须先完成：
1. 安装 SmartClip 扩展
2. 登录 SmartClip 账号
3. 确保当前账号为 Premium
4. 在扩展设置中打开 **开启 MCP 服务 / Enable MCP Service**

### Step 2：安装 MCP server

```bash
npm install -g smartclip-mcp
```

### Step 3：在项目目录配置 `.mcp.json`

```json
{
  "mcpServers": {
    "smartclip": {
      "command": "npx",
      "args": ["-y", "smartclip-mcp"]
    }
  }
}
```

### Step 4：安装 agent extension（推荐）

```bash
npm install -g smartclip-agent-extension
```

### Step 5：向当前项目安装 skills

```bash
smartclip-agent-extension
```

### Step 6：执行诊断

```bash
smartclip-agent-doctor
```

通过后，重启你的 AI 客户端即可开始使用。

## 常用能力

| 场景 | 推荐工具 |
|---|---|
| 读取当前网页但不保存 | `clip_page`（不传 `destination`） |
| 保存网页到 Obsidian / Notion | `clip_page` + `destination` |
| 保存 AI 自己生成的总结 | `save_clip` |
| 查看每日任务池 | `get_daily_tasks` |
| 批量处理每日任务 | `clip_all_daily_tasks` |
| 检查 MCP 健康状态 | `get_status` |

## MCP 工具概览

| 工具 | 说明 | 结构化输出 |
|------|------|-----------|
| `clip_page` | 读取网页或保存到目标平台 | `{ url, title, markdown, saved, destination }` |
| `list_tabs` | 列出 Chrome 当前标签页 | `{ tabs, count }` |
| `extract_page` | 从标签页提取页面内容 | 已支持 structured output |
| `convert_to_markdown` | 把 HTML 转成 Markdown | 已支持 structured output |
| `save_clip` | 把生成内容保存到指定平台 | `{ saved, destination, taskId, warning }` |
| `get_tasks` | 查看剪藏任务队列 | `{ tasks, count }` |
| `get_daily_tasks` | 查看每日任务池 | `{ tasks, count, lastSyncAt }` |
| `clip_daily_task` | 处理单个每日任务 | 已支持 structured output |
| `clip_all_daily_tasks` | 处理全部待办每日任务 | `{ summary, results }` |
| `get_vocabulary` | 查看生词本 | 已支持 structured output |
| `get_status` | 查看 MCP / 扩展健康状态 | `{ status }` |

## 安全与诊断

### 可选 session token 认证

你可以在 `.mcp.json` 中加入：

```json
{
  "mcpServers": {
    "smartclip": {
      "command": "npx",
      "args": ["-y", "smartclip-mcp"],
      "env": {
        "SMARTCLIP_MCP_SESSION_TOKEN": "your-secret-token"
      }
    }
  }
}
```

配置后，扩展必须使用相同 token 才能完成握手。

### doctor

```bash
smartclip-agent-doctor
```

doctor 会检查：
- `.mcp.json` 中是否存在 smartclip 配置
- `smartclip-mcp` 是否可执行
- skills 源文件是否存在
- skills 是否已经部署到支持的 agent 目录

## 开发者常用命令

在仓库根目录执行：

```bash
pnpm install
pnpm build
```

单包调试：

```bash
pnpm --filter smartclip-bridge-protocol build
pnpm --filter smartclip-mcp build
pnpm --filter smartclip-mcp test
```

发布相关说明请查看：
- [`docs/build-and-release.md`](docs/build-and-release.md)

## 更多文档

- 安装与使用手册：[`docs/install-and-usage.md`](docs/install-and-usage.md)
- MCP server 详细说明：[`packages/smartclip-mcp/README.md`](packages/smartclip-mcp/README.md)
- 英文入口文档：[`README.md`](README.md)

## 开源协议

[MIT License](LICENSE) © 2024 maike
