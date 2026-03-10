# SmartClip MCP Server

让 AI 代理（如 Claude Code）通过 [Model Context Protocol](https://modelcontextprotocol.io/) 操作 SmartClip Chrome 扩展，实现网页剪藏自动化。

## 架构

```
Claude Code <--stdio/MCP--> smartclip-mcp (WebSocket server) <--WebSocket--> Chrome 扩展
```

MCP Server 启动时会在本地开一个 WebSocket server（`ws://127.0.0.1:18365`），SmartClip 扩展自动连接。

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
      "args": ["-y", "smartclip-mcp"]
    }
  }
}
```

就这样！无需额外安装步骤。

## 可用工具

| 工具 | 说明 |
|------|------|
| `list_tabs` | 列出 Chrome 中所有打开的标签页 |
| `extract_page` | 提取指定标签页的网页内容 |
| `convert_to_markdown` | 将 HTML 转换为 Markdown |
| `save_clip` | 保存剪藏到指定平台 |
| `clip_page` | 一键剪藏（提取 + 转换 + 保存） |
| `get_tasks` | 查看剪藏任务状态 |

## 使用示例

在 Claude Code 中：

```
> 帮我把当前打开的网页剪藏到 Obsidian
> 列出我打开的所有标签页
> 把这个页面的内容提取出来转成 Markdown
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

### "Chrome 扩展未连接"

1. 确保 Chrome 浏览器已打开
2. 确保 SmartClip 扩展已安装并启用
3. 尝试在 `chrome://extensions` 中刷新 SmartClip 扩展
4. 扩展会每 30 秒自动尝试重连 MCP Server

### 端口冲突

MCP Server 默认使用端口 `18365`。如果被占用，请关闭占用该端口的进程。

## 开发

```bash
cd packages/smartclip-mcp
npm install
npm run build
npm start
```

## License

MIT
