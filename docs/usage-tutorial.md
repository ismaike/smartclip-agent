# SmartClip + Claude Code 使用教程

让 Claude Code 通过 SmartClip 读取你浏览器里的网页、提取正文、剪藏到笔记平台。本教程面向 **Claude Code** 用户，覆盖安装、配置、技能部署到日常使用的完整流程。

## 你将获得什么

装好之后，在 Claude Code 里直接用自然语言就能：

- 📖 **读取网页** ——「帮我读一下当前打开的这个页面」「总结 https://example.com 的内容」
- 💾 **剪藏到笔记** ——「把这个页面保存到 Obsidian/Notion/思源」
- 📋 **处理每日任务** ——「看看今天有哪些待剪藏的任务，帮我全部处理」
- 🔍 **检查连接** ——「SmartClip 连接正常吗？」

这些操作都通过 SmartClip Chrome 扩展读取你**真实浏览器会话**里的内容，包括需要登录的页面。

---

## 前置条件

开始前请确认：

- ✅ 已安装 **Node.js ≥ 18**（`node -v` 检查）
- ✅ 已安装 **Claude Code** 并能正常启动
- ✅ 已安装 **Chrome 浏览器**
- ✅ 已安装 **SmartClip Chrome 扩展** 并完成登录
- ✅ SmartClip 账号为 **Pro**（MCP 功能需要 Pro）
- ✅ 在扩展设置里打开了 **Enable MCP Service / 开启 MCP 服务**

---

## 第一步：安装 smartclip-mcp

`smartclip-mcp` 是 MCP server，负责让 Claude Code 和 SmartClip 扩展通信。

全局安装：

```bash
npm install -g smartclip-mcp
```

或使用 pnpm：

```bash
pnpm add -g smartclip-mcp
```

验证：

```bash
smartclip-mcp --help
```

没有 help 输出也没关系，只要命令可执行即可。

---

## 第二步：配置 Claude Code 项目的 MCP

进入你要使用 SmartClip 的项目目录，创建 `.mcp.json`：

```bash
cd /path/to/your/project
```

创建 `.mcp.json`，内容如下：

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

### 启用 Session Token（推荐）

为了让本地桥接更安全，建议配置 session token。修改 `.mcp.json`：

```json
{
  "mcpServers": {
    "smartclip": {
      "command": "npx",
      "args": ["-y", "smartclip-mcp"],
      "env": {
        "SMARTCLIP_MCP_SESSION_TOKEN": "你的-secret-token"
      }
    }
  }
}
```

然后在 **SmartClip 扩展 → Options → General Settings → MCP 诊断区域**，填入**同一个 token**。两端必须一致，否则连接会失败。

> 💡 token 任选一串字符即可，例如 UUID。它只是本地认证凭证，不与 SmartClip 云端交互。

---

## 第三步：安装 SmartClip Skills（推荐）

Skills 让 Claude Code 更智能地选择正确的工具和流程。`smartclip-agent-extension` 负责把它们部署到 Claude Code 的 `.claude/skills` 目录。

### 全局安装扩展包

```bash
npm install -g smartclip-agent-extension
```

### 部署 skills 到项目

在你的项目目录执行：

```bash
smartclip-agent-extension
```

交互式向导会让你选择：

```
🚀 SmartClip Agent Skills 安装向导

请选择范围:
  [1] 全局 - 用户主目录
  [2] 项目 - 当前项目目录        ← 推荐，选这个
  [q] 退出

请选择要安装到的目录:
  [1] Standard (.agents/skills)
  [2] Claude Code (.claude/skills)  ← 选这个
  [3] Gemini CLI (.gemini/skills)
  [a] 全部
```

选择「项目」+「Claude Code (.claude/skills)」，会安装 4 个技能：

| 技能 | 触发场景 |
|---|---|
| `smartclip-read` | 「读一下这个页面」「总结内容」 |
| `smartclip-save` | 「保存到 Obsidian」「剪藏到 Notion」 |
| `smartclip-daily` | 「今天的每日任务」「批量处理任务」 |
| `smartclip-troubleshooting` | 连接异常、MCP 不可用时 |

### 非交互模式（可选）

如果不想走交互向导，一行命令装到项目的 Claude Code 目录：

```bash
smartclip-agent-extension --project --targets .claude/skills
```

---

## 第四步：验证安装

运行 doctor 自检：

```bash
smartclip-agent-doctor
```

如果想要 JSON 格式的结果：

```bash
smartclip-agent-doctor --json
```

doctor 会检查：

- `.mcp.json` 是否存在 `smartclip` 配置
- `smartclip-mcp` 是否可执行
- SmartClip 扩展连接是否健康
- skills 是否已部署到 `.claude/skills`

看到 ✅ 全绿即表示配置完成。

---

## 第五步：在 Claude Code 中使用

**重启 Claude Code 会话**，让它加载新的 `.mcp.json` 和 skills。

进入项目后，直接用自然语言与 Claude Code 对话即可。SmartClip 会在后台自动选择合适的工具。

### 场景 1：读取当前网页

```
> 帮我读一下当前 Chrome 里打开的这个页面
```

Claude Code 会调用 `clip_page`（不传 destination），返回 Markdown 格式的正文。

### 场景 2：读取指定 URL

```
> 总结一下 https://example.com/article 的内容
```

SmartClip 会自动在 Chrome 里打开该 URL（使用你的登录态），提取正文并返回。

### 场景 3：剪藏到笔记平台

```
> 把当前页面保存到 Obsidian
> 帮我把这个 URL 剪藏到思源笔记
```

支持的目标平台（共 16 种）：`obsidian`、`notion`、`markdown`、`flomo`、`siyuan`、`logseq`、`joplin`、`feishu`、`yuque`、`memos`、`wolai`、`getbiji`、`flowus`、`s3_doc`、`aliyun_oss_doc`、`tencent_cos_doc`。

### 场景 4：处理每日剪藏任务

```
> 看看今天有哪些待剪藏的任务
> 帮我处理所有每日任务
```

SmartClip 会列出待办任务，或一键批量处理全部 pending 任务。

### 场景 5：检查连接状态

```
> SmartClip 连接正常吗？
> 检查一下 MCP 的健康状态
```

---

## 可用工具一览

SmartClip MCP 共提供 8 个工具，Claude Code 会根据你的意图自动选择。你通常不需要手动指定工具名。

| 工具 | 作用 | 主要参数 |
|---|---|---|
| `clip_page` | 提取网页正文，可选保存 | `url` / `tabId`、`destination`（可选）、`mode`（`full`/`selection`）|
| `list_tabs` | 列出 Chrome 所有标签页 | 无 |
| `save_clip` | 保存内容到指定平台 | `url`、`destination`、`title`、`contentHtml` 等 |
| `get_daily_tasks` | 查看每日待剪藏任务池 | `status`（`pending`/`completed`/`skipped`）|
| `clip_daily_task` | 处理单个每日任务 | `taskId`、`destination`、`closeTab` |
| `clip_all_daily_tasks` | 批量处理所有待办任务 | `destination`、`mode`、`closeTab` |
| `get_vocabulary` | 获取用户生词本 | 无 |
| `get_status` | 检查连接健康状态 | 无 |

---

## 高级配置

### 从本地源码启动（开发自测）

如果你在开发 SmartClip，想用本地构建产物而非 npm 发布版，修改 `.mcp.json`：

```json
{
  "mcpServers": {
    "smartclip": {
      "command": "node",
      "args": ["/绝对路径/smartclip-agent/packages/smartclip-mcp/dist/index.js"],
      "env": {
        "SMARTCLIP_MCP_SESSION_TOKEN": "你的-token"
      }
    }
  }
}
```

> ⚠️ 改完 `.mcp.json` **必须重启 Claude Code 会话**才会生效，配置在会话启动时被快照，不支持热加载。

### 多客户端使用限制

SmartClip 的连接模型有一个重要限制：

- `smartclip-mcp` 是 **stdio server + 本地 WebSocket bridge** 的组合
- 浏览器扩展只连接固定地址 `ws://127.0.0.1:18365`，且扩展内只维护一条 MCP bridge 连接
- **同一时刻只能有一个 AI 客户端真正使用 SmartClip**

如果你同时在 Claude Code 和 Cursor 里启用了 SmartClip，后启动的客户端会抢不到扩展连接。推荐做法：

1. 只在当前正在工作的客户端里启用 SmartClip
2. 切换客户端前，先关闭旧客户端的 `smartclip-mcp` 进程
3. 在新客户端触发一次 SmartClip 工具调用，或在扩展设置页点「立即重连」

---

## 排错

如果 SmartClip 工具调用超时或报错，按以下顺序排查：

### 1. 运行 doctor

```bash
smartclip-agent-doctor --json
```

查看具体哪一项失败。

### 2. 端口 18365 被占用

```bash
lsof -nP -iTCP:18365
```

如果有多个进程占用，说明有多个 `smartclip-mcp` 实例。结束多余的：

```bash
# 找到占用进程的 PID，然后
/bin/kill -9 <PID>
```

### 3. 扩展未连接

在 SmartClip 扩展设置页：
- 确认「Enable MCP Service」已开启
- 确认 Session Token 与 `.mcp.json` 里的 `SMARTCLIP_MCP_SESSION_TOKEN` **完全一致**
- 点击「立即重连 / 重新检查」

### 4. Session Token 不匹配

如果工具调用长时间挂起后超时，通常是 token 两端不一致。检查：

- `.mcp.json` 的 `SMARTCLIP_MCP_SESSION_TOKEN`
- 扩展 Options 里的 Session Token

两端必须完全相同。

### 5. schema 不匹配报错

如果看到类似「状态数据格式无效」「缺少 premium 字段」的错误，说明运行的 `smartclip-mcp` 版本与扩展版本不匹配。升级到最新版：

```bash
npm update -g smartclip-mcp
```

然后重启 Claude Code 会话。

---

## 卸载

如果需要完全移除 SmartClip：

```bash
# 卸载 skills
smartclip-agent-extension uninstall --project

# 卸载全局包
npm uninstall -g smartclip-mcp smartclip-agent-extension
```

然后删除项目里的 `.mcp.json` 中 `smartclip` 配置项。

---

## 进一步阅读

- 安装与使用细节：[`docs/install-and-usage.md`](install-and-usage.md)
- 构建与发布：[`RELEASE.md`](../RELEASE.md)
- Bridge Action 契约设计：[`docs/adr/0001-bridge-action-contract.md`](adr/0001-bridge-action-contract.md)
- Skills 安装拓扑设计：[`docs/adr/0002-skills-install-topology.md`](adr/0002-skills-install-topology.md)
- MCP 工具列表：[`../README.md`](../README.md)
