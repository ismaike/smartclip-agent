# SmartClip MCP Server

让 AI 代理（如 Claude Code）通过 [Model Context Protocol](https://modelcontextprotocol.io/) 操作 SmartClip Chrome 扩展，实现网页剪藏自动化。

## 架构

```
Claude Code <--stdio/MCP--> smartclip-mcp (WebSocket server) <--WebSocket--> Chrome 扩展
```

MCP Server 启动时会在本地开一个 WebSocket server（`ws://127.0.0.1:18365`），SmartClip 扩展自动连接。

### 当前连接限制

- 当前实现是 **单客户端独占**，不是多客户端共享服务。
- 浏览器扩展当前只会连接一个固定地址：`ws://127.0.0.1:18365`。
- 扩展内部只维护一条 MCP bridge 连接，因此同一时刻只能有一个 AI 客户端实例真正使用 SmartClip。
- 如果一个 Claude Code / Gemini CLI / OpenCode 已经启动并占用了 `smartclip-mcp`，另一个客户端通常要等前一个 `smartclip-mcp` 退出后才能接管。
- 即使手动启动多个 `smartclip-mcp` 实例，或者让它们绑定不同端口，也不能让多个客户端同时共享当前这一个浏览器扩展连接；最多只能切换连接目标。

### 握手与认证

连接建立后，扩展和 MCP server 执行版本化握手：

1. 扩展发送 `hello` 消息（含 `protocolVersion`、可选 `sessionToken`）
2. MCP server 校验版本和 token，回复 `hello_ack`
3. 握手完成后，所有 action 消息必须携带请求 ID，server 匹配 ID 返回响应

如果 MCP server 配置了 `SMARTCLIP_MCP_SESSION_TOKEN` 环境变量，未携带正确 token 的握手将被拒绝。

旧版扩展（不发送 `hello`）自动进入 legacy 模式以保持向后兼容。

### 结构化输出

所有工具返回 `structuredContent`，包含类型化的结果字段（如 `tabs`、`count`、`summary`），方便 agent 解析和展示。

## 快速开始

### 1. 安装 SmartClip 扩展

确保 Chrome 中已安装并启用 SmartClip 扩展（v0.0.5+，包含 MCP 支持）。

### 2. 配置 Claude Code

在项目根目录创建 `.mcp.json`：

```json
{
  "mcpServers": {
    "smartclip": {
      "command": "npx",
      "args": ["-y", "smartclip-mcp"],
      "env": {
        "SMARTCLIP_MCP_SESSION_TOKEN": "your-token-here"
      }
    }
  }
}
```

`SMARTCLIP_MCP_SESSION_TOKEN` 是可选的——设置后，扩展必须在握手时提供相同的 token 才能连接。

### 3. Agent 技能安装（可选）

安装 `smartclip-agent-extension` 会自动注册场景化技能，帮助 AI agent 更准确地使用 SmartClip 工具：

```bash
npm install -g smartclip-agent-extension
smartclip-agent-extension
```

安装完成后运行 `smartclip-agent-doctor` 验证配置是否正确。

## 可用工具

| 工具 | 说明 | 结构化输出字段 |
|------|------|--------------|
| `list_tabs` | 列出 Chrome 中所有打开的标签页 | `{ tabs, count }` |
| `extract_page` | 提取指定标签页的网页内容 | `{ url, title, content }` |
| `convert_to_markdown` | 将 HTML 转换为 Markdown | `{ markdown }` |
| `save_clip` | 保存剪藏到指定平台 | `{ saved, destination, clip }` |
| `clip_page` | 一键剪藏（提取 + 转换 + 保存） | `{ url, title, markdown, saved, destination }` |
| `get_tasks` | 查看剪藏任务状态 | `{ tasks, count }` |
| `get_daily_tasks` | 查看每日待剪藏任务池 | `{ tasks, count, lastSyncAt }` |
| `clip_daily_task` | 自动打开并剪藏单个每日任务 | `{ taskId, saved }` |
| `clip_all_daily_tasks` | 批量处理所有待办每日任务 | `{ summary: { total, succeeded, failed }, results }` |
| `get_vocabulary` | 获取用户自定义词汇表 | `{ vocabulary }` |
| `get_status` | 获取 MCP 连接健康状态 | `{ status }` |

## 使用示例

在 Claude Code 中：

```
> 帮我把当前打开的网页剪藏到 Obsidian
> 列出我打开的所有标签页
> 把这个页面的内容提取出来转成 Markdown
> 看看今天有哪些待剪藏的任务
> 帮我处理所有每日任务
> 检查 SmartClip 连接状态
```

## 支持的保存平台

- Obsidian（通过 Local REST API）
- Notion
- Flomo
- Joplin
- 思源笔记
- 飞书
- Markdown 文件下载

## 故障排查

### 运行 doctor 检查

```bash
smartclip-agent-doctor
```

这会检查 `.mcp.json` 配置、MCP server 安装和技能文件是否就位。

### "Chrome 扩展未连接"

1. 确保 Chrome 浏览器已打开
2. 确保 SmartClip 扩展已安装并启用
3. 尝试在 `chrome://extensions` 中刷新 SmartClip 扩展
4. 扩展会每 30 秒自动尝试重连 MCP Server
5. 如果配置了 session token，确认扩展端也设置了相同的 token

### 认证失败

检查 `.mcp.json` 中 `SMARTCLIP_MCP_SESSION_TOKEN` 和扩展设置页 MCP 诊断面板中的 token 是否一致。

### 端口冲突

MCP Server 默认使用端口 `18365`。如果被占用，请关闭占用该端口的进程。

### 多客户端同时使用

当前不支持多个 AI 客户端同时共享同一个 SmartClip 扩展连接。

如果你想从另一个客户端接管：

1. 先关闭当前正在使用 SmartClip 的客户端，或结束它启动的 `smartclip-mcp` 进程
2. 再在新的客户端里触发一次 SmartClip 工具调用
3. 如果扩展还没自动接上，可在扩展设置页点击“立即重连”或“重新检查”

## 开发

```bash
cd packages/smartclip-mcp
pnpm install
pnpm build
pnpm test
```

## License

MIT
