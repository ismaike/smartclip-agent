# SmartClip Agent 安装与使用手册

本文档面向最终用户，说明如何安装 `smartclip-agent`、配置 MCP、安装技能，并在 AI CLI/IDE 中使用 SmartClip。

## 1. 你会得到什么

安装完成后，你的 AI agent 可以：
- 读取当前 Chrome 中打开的网页
- 提取网页正文并转成 Markdown
- 将内容保存到 Obsidian / Notion / Flomo / Joplin / 思源 / 飞书等
- 查看和处理 SmartClip 的每日任务池

## 2. 安装前准备

### Step 1：准备运行环境

确保已安装：
- Node.js >= 18
- npm 或 pnpm
- Chrome 浏览器
- SmartClip Chrome 扩展

### Step 2：准备 SmartClip 扩展

在 Chrome 中完成以下操作：

1. 安装 SmartClip 扩展
2. 登录 SmartClip 账号
3. 确认当前账号为 Premium（MCP 功能需要 Premium）
4. 打开 **SmartClip → Options → General Settings**
5. 打开 **Enable MCP Service / 开启 MCP 服务**

## 3. 安装方式概览

通常有两部分：

### 必装部分
1. `smartclip-mcp`
   - MCP server
   - 为 AI 客户端提供 stdio MCP 服务

### 推荐安装部分
2. `smartclip-agent-extension`
   - 安装技能、hooks、doctor CLI
   - 帮助 Claude Code / Gemini CLI / OpenCode 更稳定地调用 SmartClip

## 4. 安装 smartclip-mcp

### Step 1：全局安装

```bash
npm install -g smartclip-mcp
```

或：

```bash
pnpm add -g smartclip-mcp
```

### Step 2：验证安装

```bash
smartclip-mcp --help
```

如果没有 help 输出也没关系，只要命令可执行即可。

## 5. 配置 MCP

在你的项目根目录创建 `.mcp.json`：

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

### 可选：启用 session token 认证

如果你希望本地桥接更安全，可以加上环境变量：

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

然后在 SmartClip 扩展设置中的 MCP 诊断区域，填入或确认同一个 token。

## 6. 安装 smartclip-agent-extension（推荐）

### Step 1：全局安装

```bash
npm install -g smartclip-agent-extension
```

或：

```bash
pnpm add -g smartclip-agent-extension
```

### Step 2：安装 skills 到你的 agent 工作区

在你的项目目录执行：

```bash
smartclip-agent-extension
```

#### 交互式安装

执行后会提示选择安装范围：

```
🚀 SmartClip Agent Skills 安装向导

请选择安装范围:

  [1] 全局安装 - 安装到用户主目录 (推荐)
      Mac/Linux: ~/.agents/skills 等
      Windows:   %USERPROFILE%\.agents\skills 等

  [2] 项目安装 - 安装到当前项目目录
      当前目录: /path/to/your/project

  [q] 退出

请选择 (默认: 1):
```

选择范围后，会继续提示选择目标目录：

```
请选择要安装到的目录（输入序号，多个用逗号分隔）:

  [1] Standard (.agents/skills) (默认)
      推荐 - 标准通用目录
  [2] Claude Code (.claude/skills)
      Claude Code 客户端
  [3] Gemini CLI (.gemini/skills)
      Gemini CLI 客户端

  [a] 全部安装
  [q] 退出

请选择 (默认: 1):
```

#### 非交互模式

```bash
# 全局安装（推荐）
smartclip-agent-extension --global

# 项目安装
smartclip-agent-extension --project

# 全局安装到默认目录
smartclip-agent-extension --global --default

# 项目安装到所有目录
smartclip-agent-extension --project --all

# 指定范围和目录
smartclip-agent-extension --global --targets .agents/skills,.claude/skills
```

**全局安装路径**：
- Mac/Linux: `~/.agents/skills`, `~/.claude/skills`, `~/.gemini/skills`
- Windows: `%USERPROFILE%\.agents\skills`, `%USERPROFILE%\.claude\skills`, `%USERPROFILE%\.gemini\skills`

**项目安装路径**：
- 当前目录下的 `.agents/skills`, `.claude/skills`, `.gemini/skills`

### Step 3：确认安装结果

它会尝试向以下目录安装技能（根据你的选择）：
- `.agents/skills` - 标准通用目录（推荐）
- `.claude/skills` - Claude Code
- `.gemini/skills` - Gemini CLI

应出现以下技能目录：
- `smartclip`
- `smartclip-read`
- `smartclip-save`
- `smartclip-daily`
- `smartclip-troubleshooting`

## 7. 运行 doctor 检查

安装后建议执行：

```bash
smartclip-agent-doctor
```

如果希望得到结构化结果：

```bash
smartclip-agent-doctor --json
```

doctor 主要检查：
- `.mcp.json` 是否存在 `smartclip` 配置
- `smartclip-mcp` 是否可执行
- SmartClip 相关 skills 是否已部署到可识别目录

## 8. 在不同客户端中的使用方式

### Claude Code

1. 在项目目录中放置 `.mcp.json`
2. 确保 `.claude/skills` 已存在
3. 执行 `smartclip-agent-extension`
4. 打开 Claude Code 并进入该项目

推荐使用方式：
- “读取当前网页” → `clip_page`（不传 `destination`）
- “保存到 Obsidian/Notion” → `clip_page` + `destination`
- “检查连接状态” → `get_status`

### Gemini CLI / OpenCode

流程与 Claude Code 类似：
1. 在项目目录中配置 `.mcp.json`
2. 创建对应的 skills 目录
3. 执行 `smartclip-agent-extension`
4. 重启 agent CLI

### Cursor / Windsurf

Cursor / Windsurf 不一定直接读取 skills 目录，通常需要：

1. 配置 MCP server：`npx -y smartclip-mcp`
2. 手动把 `smartclip/SKILL.md` 的核心说明加入你的 rules / instructions
3. 如需更细粒度控制，可把拆分后的 skill 内容分别整理到规则系统中

## 9. 推荐使用姿势

### 场景 1：只读网页，不保存

告诉 AI：
- “读取当前网页内容”
- “总结这个页面”
- “读取这个 URL 并分析”

此时应优先使用：
- `clip_page`（**不传** `destination`）

### 场景 2：保存网页到笔记工具

告诉 AI：
- “把当前页面保存到 Obsidian”
- “把这个网页剪藏到 Notion”

此时应使用：
- `clip_page` + `destination`

### 场景 3：保存 AI 自己生成的总结

告诉 AI：
- “把你刚才的总结保存到 Notion”

此时应使用：
- `save_clip`

### 场景 4：处理每日任务池

告诉 AI：
- “看看今天有哪些待处理任务”
- “处理一个 daily task”
- “批量处理所有待剪藏任务”

此时应使用：
- `get_daily_tasks`
- `clip_daily_task`
- `clip_all_daily_tasks`

## 10. 常见问题排查

### 问题 1：AI 说扩展未连接

按顺序检查：
1. Chrome 是否已打开
2. SmartClip 扩展是否已安装
3. MCP 开关是否已打开
4. 是否为 Premium 账号
5. 扩展设置页中的诊断状态是否正常
6. 执行 `smartclip-agent-doctor`

### 问题 2：配置了 `.mcp.json` 但工具还是不可用

检查：
- 当前 AI 客户端是否支持 MCP
- `.mcp.json` 是否放在正确项目根目录
- 当前会话是否已经重启
- `npx -y smartclip-mcp` 是否能被执行

### 问题 3：设置了 token 后认证失败

检查：
- `.mcp.json` 中的 `SMARTCLIP_MCP_SESSION_TOKEN`
- SmartClip 扩展中的 token
- 是否存在前后空格或复制错误

### 问题 4：只能读网页，不能保存

检查：
- SmartClip 扩展中的目标平台是否已经配置
- 对应平台授权是否有效（如 Notion/Obsidian）
- 你是否明确让 AI 使用保存动作，而不是只做读取

## 11. 最小可用安装流程（推荐新用户）

如果你只想最快跑通，请按这 6 步操作：

### Step 1
安装 SmartClip Chrome 扩展并登录 Premium 账号

### Step 2
在扩展设置中打开 MCP 服务

### Step 3
全局安装 MCP server：

```bash
npm install -g smartclip-mcp
```

### Step 4
在项目目录创建 `.mcp.json`

### Step 5
全局安装 extension：

```bash
npm install -g smartclip-agent-extension
```

### Step 6
在项目目录执行：

```bash
smartclip-agent-extension
smartclip-agent-doctor
```

通过后，重启你的 AI 客户端即可开始使用。
