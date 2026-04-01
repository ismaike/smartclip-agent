# SmartClip Agent

`smartclip-agent` 是 SmartClip 的 AI agent 集成仓库，用于把 Chrome 扩展能力暴露给 Claude Code、Gemini CLI、OpenCode、Cursor、Windsurf 等客户端。

它主要解决三类问题：
- 让 AI 读取真实浏览器中的网页内容（包括登录态页面）
- 让 AI 直接调用 SmartClip 的剪藏与保存能力
- 让 AI 通过 skills / hooks / doctor 更稳定地发现和使用这些能力

## 仓库包含什么

这是一个 pnpm monorepo，当前包含 3 个包：

| 包名 | 目录 | 作用 |
|---|---|---|
| `smartclip-bridge-protocol` | `packages/smartclip-bridge-protocol` | 共享协议类型、错误码、schema |
| `smartclip-mcp` | `packages/smartclip-mcp` | MCP server（stdio）+ 本地 WebSocket bridge |
| `smartclip-agent-extension` | `packages/smartclip-agent-extension` | skills、hooks、doctor CLI、安装脚本 |

## 你应该先看哪份文档

### 如果你是使用者
请先看：

- [`docs/install-and-usage.md`](docs/install-and-usage.md)

这份文档按步骤说明：
- 如何安装 `smartclip-mcp`
- 如何配置 `.mcp.json`
- 如何安装 `smartclip-agent-extension`
- 如何运行 doctor
- 如何在 Claude Code / Gemini CLI / OpenCode / Cursor / Windsurf 中使用

### 如果你是维护者 / 发布者
请先看：

- [`docs/build-and-release.md`](docs/build-and-release.md)

这份文档按步骤说明：
- monorepo 结构
- 本地构建方式
- 发布前验证
- 版本管理
- npm 发布顺序
- 发布后 smoke test

## 面向用户的快速开始

### Step 1：安装并配置 SmartClip Chrome 扩展

你必须先：
1. 安装 SmartClip 扩展
2. 登录账号
3. 确保是 Premium 用户
4. 在扩展设置中打开 **Enable MCP Service / 开启 MCP 服务**

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

### Step 5：安装 skills 到当前项目

```bash
smartclip-agent-extension
```

### Step 6：运行诊断

```bash
smartclip-agent-doctor
```

通过后，重启 AI 客户端即可开始使用。

## 常用能力

| 能力 | 推荐工具 |
|---|---|
| 读取当前网页，不保存 | `clip_page`（不传 `destination`） |
| 保存网页到 Obsidian / Notion | `clip_page` + `destination` |
| 保存 AI 生成的总结 | `save_clip` |
| 查看每日任务池 | `get_daily_tasks` |
| 批量处理每日任务 | `clip_all_daily_tasks` |
| 查看 MCP 健康状态 | `get_status` |

## MCP 工具概览

| Tool | Description | Structured Output |
|------|-------------|------------------|
| `clip_page` | Read a page or save it to a destination | `{ url, title, markdown, saved, destination }` |
| `list_tabs` | List open Chrome tabs | `{ tabs, count }` |
| `extract_page` | Extract page content from a tab | structured output included |
| `convert_to_markdown` | Convert HTML to Markdown | structured output included |
| `save_clip` | Save generated content to a destination | `{ saved, destination, taskId, warning }` |
| `get_tasks` | Inspect clip task queue | `{ tasks, count }` |
| `get_daily_tasks` | Read daily task pool | `{ tasks, count, lastSyncAt }` |
| `clip_daily_task` | Process one daily task | structured output included |
| `clip_all_daily_tasks` | Process all pending daily tasks | `{ summary, results }` |
| `get_vocabulary` | Read user vocabulary | structured output included |
| `get_status` | Read MCP / extension health | `{ status }` |

## 安全与诊断

### 可选 session token 认证

可以在 `.mcp.json` 中配置：

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

配置后，扩展端必须使用同一个 token 完成握手。

### doctor

```bash
smartclip-agent-doctor
```

doctor 会检查：
- `.mcp.json` 是否配置 smartclip
- `smartclip-mcp` 是否可执行
- skills 源文件是否存在
- skills 是否已经部署到支持的 agent 目录

## 开发者常用命令

在仓库根目录：

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

发布相关请查看：
- [`docs/build-and-release.md`](docs/build-and-release.md)

## 更多说明

- MCP server 详细说明：[`packages/smartclip-mcp/README.md`](packages/smartclip-mcp/README.md)
- 中文说明：[`README.zh-CN.md`](README.zh-CN.md)

## License

[MIT License](LICENSE) © 2024 maike
