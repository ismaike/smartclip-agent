# SmartClip MCP Server

让 AI 代理（如 Claude Code）通过 [Model Context Protocol](https://modelcontextprotocol.io/) 操作 SmartClip Chrome 扩展，实现网页剪藏自动化。

## 架构

```
Claude Code <--stdio/MCP--> smartclip-mcp (WebSocket server) <--WebSocket--> Chrome 扩展
```

MCP Server 启动时会在本地开一个 WebSocket server（`ws://127.0.0.1:18365`），SmartClip 扩展自动连接。

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

## 开发

```bash
cd packages/smartclip-mcp
pnpm install
pnpm build
pnpm test
```

## License

MIT
