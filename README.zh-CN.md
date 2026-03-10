# SmartClip Agent 扩展

> 赋予你的 AI 智能体（Claude Code, Gemini CLI, Cursor, Windsurf, OpenCode）直接读取、提取和剪藏真实浏览器网页的能力。基于 [SmartClip](https://github.com/your-username/smartclip)。

## 这是什么？

本仓库包含 **Model Context Protocol (MCP)** 服务器代码，以及用于连接主流命令行 AI 的 **Skills (技能)**、**Hooks (生命周期钩子)** 和 **Commands (指令)**。

接入后，你的 AI 将获得以下超能力：
1. **无视防爬虫与登录墙**：因为 AI 是直接从你当前打开的浏览器标签页读取 DOM，所以只要你在浏览器里能看到的内容（内部 Jira、需要登录的 Medium、本地 localhost 调试页面），AI 都能直接阅读。
2. **提取纯净的 Markdown**：一键将任何网页转换为结构清晰的 Markdown 供 AI 进行上下文分析。
3. **直连个人知识库**：你可以命令 AI 直接将网页内容，或是它自己生成的总结，一键保存到你的 Notion、Obsidian、Flomo、思源笔记或 Joplin 中。

---

## 🚀 命令行 AI 快速上手 (Gemini CLI / Claude Code / OpenCode)

如果你使用新一代的 AI CLI，这个包将作为一个完整的生态扩展工作。

### 1. 全局安装 MCP Server
```bash
npm install -g smartclip-mcp
```
*(注：本地开发时请在 `mcp-server` 目录执行 `npm link`)*

### 2. 在工作区配置 MCP
在你的项目根目录创建或修改 `.mcp.json`：
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

### 3. 安装 SmartClip Agent 技能 (强烈建议)
这一步会将“技能使用说明书”注入到你的项目环境中。它可以教导 AI 正确使用 MCP，例如“只是阅读网页时千万不要传 destination 参数，以免污染用户的私人笔记”。

在项目根目录运行：
```bash
npx smartclip-skill install-skills
```
*(如果本地克隆了本仓库，直接执行 `node install.js`)*

安装脚本会自动检测当前目录下的 `.gemini/`、`.claude/` 或 `.opencode/` 文件夹，并将 `using-smartclip-mcp` 技能放置到对应位置供 AI 懒加载。

---

## 💻 在 Cursor / Windsurf 中使用

1. 打开 **Settings (设置)** > **Features** > **MCP Servers**。
2. 点击 **+ Add New MCP Server**。
3. 名称 (Name) 填入 `smartclip`，类型 (Type) 选择 `command`。
4. Command 填入：`npx -y smartclip-mcp`。
5. （关键）将本仓库中 [`skills/using-smartclip-mcp/SKILL.md`](skills/using-smartclip-mcp/SKILL.md) 的内容复制粘贴到你的 `.cursorrules` 文件中，让 AI 知道如何正确调用这些工具。

---

## Chrome 插件前置要求

为确保 MCP 正常工作，你**必须**安装并配置 SmartClip 浏览器插件：
1. 从 [Chrome 网上应用店](https://chromewebstore.google.com/search/SmartClip) 安装 SmartClip。
2. 登录并确保是 Premium 会员状态。
3. 打开插件的**设置 (Options)** -> **基础设置 (General Settings)**。
4. 打开 **"开启 MCP 服务 (Enable MCP Service)"** 开关。

---

## 扩展架构设计

本项目的设计灵感来源于 [Superpowers](https://github.com/obra/superpowers) 项目的插件架构：
- **`mcp-server/`**: 负责与 Chrome 建立 WebSocket 连接的核心桥接代码。
- **`skills/`**: 基于 Markdown Frontmatter 的技能说明。它们只在 AI 遇到相关问题时才动态加载，极大地节省了上下文 Token。
- **`hooks/`**: 包含 `session-start.sh` 等脚本。在 AI 启动时，它会自动检测 `18365` 端口是否通畅，并提前告诉 AI 插件是否在线。
- **`commands/`**: 预设的快捷指令宏，例如直接输入 `/clip` 来触发网页提取。

---

## 可用的 MCP 工具

| 工具名称 | 描述 |
|------|-------------|
| `clip_page` | 核心工具。传入 `url` 会打开并提取网页。如果不传 `destination`，则仅将 Markdown 返回给 AI 进行阅读；如果传入 `destination`，则直接静默保存到笔记软件。 |
| `list_tabs` | 列出当前 Chrome 中所有已打开的标签页（用于获取特定的 `tabId`）。 |
| `save_clip` | 允许 AI 构造自定义的 Markdown 内容（例如多篇文章的总结），并直接推送保存到用户的笔记库中。 |

## License
MIT