# SmartClip Agent

[English](README.md) | 简体中文 | [官方网站](https://smartclip.app) | [安装与使用手册](docs/install-and-usage.md)

`smartclip-agent` 是 [SmartClip](https://smartclip.app) 的 AI Agent 集成仓库，通过 **Local Bridge Hub** 将 Chrome 扩展的真实浏览器登录态读取能力与 16 个笔记平台剪藏能力暴露给 Claude Code、Cursor、Windsurf、Gemini CLI、OpenCode 等客户端。

## 为什么选择 SmartClip MCP？

| 能力维度 | **SmartClip MCP** | Fetch / Firecrawl MCP | Playwright / 浏览器自动化 MCP | 单平台笔记 MCP |
|---|---|---|---|---|
| **读取登录态 / 付费墙 / 内网页面** | 支持（复用真实 Chrome 会话） | 不支持 | 需单独维护登录态 | 不支持 |
| **抗反爬能力** | 强（真实用户浏览器） | 易被拦截 | 易触发风控 | 不适用 |
| **一键保存笔记平台** | **原生支持 16 个中外平台** | 仅读取 | 仅读取/自动化 | 仅支持 1 个平台 |
| **多 AI 客户端并发共享** | **Local Bridge Hub 并发复用** | 不适用 | 常受限于单浏览器实例 | 视实现而定 |

## 仓库包含什么

| 包名 | 目录 | 作用 |
|---|---|---|
| `smartclip-bridge-protocol` | `packages/smartclip-bridge-protocol` | 共享桥接协议类型、错误码、schema、Bridge Action 契约 |
| `smartclip-mcp` | `packages/smartclip-mcp` | Local Bridge Hub + MCP Server（stdio & Streamable HTTP）+ 统一 CLI |
| `smartclip-agent-extension` | `packages/smartclip-agent-extension` | 可选工作流 Skills、hooks、doctor 辅助包 |

## 快速开始

1. 访问 [smartclip.app](https://smartclip.app) 安装 SmartClip Chrome 扩展，登录 **Pro** 账号并开启 **Enable MCP Service**。
2. 配置 AI 客户端：
   ```bash
   npx smartclip-mcp setup
   ```
   > 交互式向导默认按选择写入（直接回车写 `.mcp.json`，输入 `a` 或加 `--client all` 写入全部 5 个客户端：`.mcp.json`、Claude Code、Cursor、Gemini CLI、Windsurf）；会保留其他 MCP 服务器并替换已有 `smartclip` 条目。OpenCode 或其他客户端可手动配置 `command: "npx"`、`args: ["-y", "smartclip-mcp"]`（若使用 Streamable HTTP 需先执行 `npx -y smartclip-mcp daemon start`）。
3. **重启 AI 客户端**（或先运行 `npx -y smartclip-mcp daemon start`）使配置生效并拉起 Local Hub，再运行诊断检查：
   ```bash
   npx -y smartclip-mcp doctor
   ```

如需为 Claude Code / Gemini CLI 等安装可选工作流 Skills：

```bash
npm install -g smartclip-agent-extension
smartclip-agent-extension
```

## Local Bridge Hub 架构（支持多客户端并发）

`smartclip-mcp` 会在本地 `127.0.0.1:18365` 维护一个后台 Local Bridge Hub：
- 多个 stdio 客户端与 Streamable HTTP 客户端（`http://127.0.0.1:18365/mcp`）共享同一条 Chrome 扩展连接（`ws://127.0.0.1:18365/`）。
- 读写标签页与剪藏保存操作自动串行排队，避免多客户端同时操作冲突。
- 无需改动已发布的 SmartClip 扩展。

## 支持的 16 个保存平台

- **本地与知识库**：`obsidian`、`siyuan`（思源笔记）、`logseq`、`joplin`、`markdown`（Markdown 下载）
- **云端文档与笔记**：`notion`、`feishu`（飞书）、`yuque`（语雀）、`wolai`、`flowus`
- **碎片记录**：`flomo`、`memos`、`getbiji`（Get笔记）
- **对象存储同步**：`s3_doc`（S3）、`aliyun_oss_doc`（阿里云 OSS）、`tencent_cos_doc`（腾讯云 COS）

## 常用能力与 MCP 工具

| 场景 | 推荐工具 |
|---|---|
| 只读网页 / 总结（不保存） | `read_page` |
| 保存网页到笔记平台 | `clip_page` + `destination` |
| 保存 AI 总结内容 | `save_clip` |
| 查看 / 批量处理每日任务 | `get_daily_tasks` / `clip_daily_task` / `clip_all_daily_tasks` |
| 查看生词本 / 健康状态 | `get_vocabulary` / `get_status` / `list_tabs` |

同时通过 MCP 原生提供 `instructions` 与 4 个 Prompts（`read-webpage`、`clip-webpage`、`process-daily-tasks`、`research-and-save`）。

## 安全与诊断

- WebSocket 默认拒绝网页 Origin，防止跨站劫持；设置 `SMARTCLIP_MCP_ALLOWED_ORIGINS` 会**覆盖**默认扩展规则，列表须包含要使用的每个扩展 Origin。
- `SMARTCLIP_MCP_SESSION_TOKEN` 由启动 Local Hub 的进程读取，开启后强制要求 `hello` token 握手，禁止降级绕过。新版代理检测到配置变化会自动重启旧 Hub；移除 token 或使用 `daemon start` 时请先 `daemon stop`。

### 环境变量

| 变量 | 默认值 | 作用 |
|---|---|---|
| `SMARTCLIP_MCP_SESSION_TOKEN` | 未设置 | 扩展 `hello` 握手认证 token |
| `SMARTCLIP_MCP_ALLOWED_ORIGINS` | 放行扩展协议 | 逗号分隔的精确 Origin 白名单（覆盖默认规则） |
| `SMARTCLIP_MCP_WS_BIND_HOST` | `127.0.0.1` | Hub / WebSocket 监听地址（Docker/WSL 可设 `0.0.0.0`） |
| `SMARTCLIP_MCP_PORT` | `18365` | Hub / WebSocket 监听端口（同 `--port`） |
| `SMARTCLIP_MCP_NO_DAEMON` | `0` | 设为 `1` 时禁用共享 Hub，单进程直连 |
| `SMARTCLIP_HOME` | `~/.smartclip` | 状态目录（存放 `hub.json`） |

- 常用诊断与管理命令：
  ```bash
  npx -y smartclip-mcp doctor
  npx -y smartclip-mcp --healthcheck --json
  npx -y smartclip-mcp daemon status
  npx -y smartclip-mcp daemon stop
  ```

## 常见问题（FAQ）

- **如何让 Claude Code / Cursor 读取需要登录的页面或内网文档？**
  使用 `npx smartclip-mcp setup` 配置并重启客户端后，在 Chrome 打开目标页面，让 AI 调用 `read_page` 即可直接复用你的浏览器登录态提取干净的 Markdown。
- **修改或移除 `SMARTCLIP_MCP_SESSION_TOKEN` 后为什么不生效？**
  `daemon start` 或早期代理启动的旧 Hub 可能仍驻留后台。请先运行 `npx -y smartclip-mcp daemon stop` 停掉后台旧 Hub，下一次调用（或重新 `daemon start`）会加载最新配置。

## 更多文档

- 安装与使用手册：[`docs/install-and-usage.md`](docs/install-and-usage.md)
- MCP server 详细说明：[`packages/smartclip-mcp/README.md`](packages/smartclip-mcp/README.md)
- 英文入口文档：[`README.md`](README.md)

## 开源协议

[MIT License](LICENSE) © 2024 maike
