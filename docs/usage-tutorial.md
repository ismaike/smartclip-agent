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

> 💡 token 任选一串字符即可，例如 UUID。它只是本地认证凭证，不与 SmartClip 云端交互。Session Token 由启动 Local Hub 的进程读取；新版代理检测到新 token 时会自动重启旧 Hub，若要移除 token 或排查异常请先执行 `smartclip-mcp daemon stop`。

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

## 第四步：重启客户端并验证安装

1. **重启 Claude Code 会话**，让它加载新的 `.mcp.json` 和 skills（或在终端先执行 `smartclip-mcp daemon start` 启动后台 Local Hub）。
2. 运行诊断命令确认环境与连接状态：

```bash
smartclip-mcp doctor
smartclip-agent-doctor
```

如果想要 JSON 格式的结果：

```bash
smartclip-mcp doctor --json
smartclip-agent-doctor --json
```

两个诊断命令分工不同：
- `smartclip-mcp doctor`：检查客户端 MCP 配置、Local Hub 运行状态、Chrome 扩展握手与 Pro 权限。
- `smartclip-agent-doctor`：检查 `.mcp.json`、`smartclip-mcp` 可执行性、本地健康探针与 `.claude/skills` 部署情况。

看到 ✅ 全绿即表示配置完成。

---

## 第五步：在 Claude Code 中使用

进入项目后，直接用自然语言与 Claude Code 对话即可。SmartClip 会在后台自动选择合适的工具。

### 场景 1：读取当前网页

```
> 帮我读一下当前 Chrome 里打开的这个页面
```

Claude Code 会调用只读工具 `read_page`（不保存到任何笔记平台），返回 Markdown 格式的正文。

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

SmartClip MCP 共提供 9 个工具，Claude Code 会根据你的意图自动选择。你通常不需要手动指定工具名。

| 工具 | 作用 | 主要参数 |
|---|---|---|
| `read_page` | 只读提取网页正文为 Markdown（不保存） | `url` / `tabId`、`mode`（`full`/`selection`）、`maxLength`（默认 `50000`）|
| `clip_page` | 提取网页正文，可选保存到笔记平台 | `url` / `tabId`、`destination`（可选）、`mode`（`full`/`selection`）|
| `save_clip` | 保存内容到指定平台 | `url`、`destination`、`title`、`contentHtml` 等 |
| `list_tabs` | 列出 Chrome 所有标签页 | 无 |
| `get_daily_tasks` | 查看每日待剪藏任务池 | `status`（`pending`/`completed`/`skipped`）|
| `clip_daily_task` | 处理单个每日任务 | `taskId`、`destination`、`closeTab` |
| `clip_all_daily_tasks` | 批量处理所有待办任务 | `destination`、`mode`、`closeTab` |
| `get_vocabulary` | 查看用户生词本（只读） | 无 |
| `get_status` | 检查连接健康状态 | 无 |

---

## 高级配置

### 从本地源码启动（开发自测）

如果你在开发 SmartClip，想用本地构建产物而非 npm 发布版，先停掉可能仍在运行的发布版后台 Hub：

```bash
smartclip-mcp daemon stop
```

然后修改 `.mcp.json`：

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

> ⚠️ 改完 `.mcp.json` **必须重启 Claude Code 会话**才会生效，配置在会话启动时被快照，不支持热加载。如果已有同版本号的旧 Hub 在后台运行，需先执行 `smartclip-mcp daemon stop`，避免继续复用旧构建产物。

### 多客户端并发共享（Local Bridge Hub）

SmartClip 默认采用 **Local Bridge Hub** 架构实现多客户端并发共享：

- `smartclip-mcp` 默认作为薄 stdio 代理启动，在 `127.0.0.1:18365` 自动复用或拉起后台共享 Local Hub
- 浏览器扩展只连接固定地址 `ws://127.0.0.1:18365/`，但多个 Claude Code、Cursor、Gemini CLI、Windsurf 窗口（stdio 或 Streamable HTTP `http://127.0.0.1:18365/mcp`）可以**同时连接并共享同一条扩展连接**
- 涉及标签页切换与写入保存的动作会在 Hub 内部自动串行排队，避免多客户端互相打断

如果你处于受限沙箱或确实需要单进程直连独占模式，可传入 `--no-daemon` 或设置 `SMARTCLIP_MCP_NO_DAEMON=1`。

---

## 排错

如果 SmartClip 工具调用超时或报错，按以下顺序排查：

### 1. 运行 doctor

```bash
smartclip-mcp doctor --json
smartclip-agent-doctor --json
```

先通过 `smartclip-mcp doctor` 确认 `client-configs`、`hub-daemon`、`extension-connection`（含握手/token）与 `extension-capability`（Pro 与 MCP 开关），再用 `smartclip-agent-doctor` 检查 skills 部署。

### 2. 检查或重启 Local Bridge Hub

```bash
smartclip-mcp daemon status
smartclip-mcp daemon stop
```

> ⚠️ 默认模式下端口 `18365` 由一个 detached 的 Local Hub 进程监听，stdio 代理和 Chrome 扩展都会连向它，因此 `lsof -nP -iTCP:18365` 看到多个进程属于正常现象。**不要直接 `kill -9` 共享 Hub**，这会中断其他客户端正在进行的调用和 Streamable HTTP 会话，并遗留 `~/.smartclip/hub.json`。仅在使用 `--no-daemon` 单进程模式或 `daemon stop` 无法停止异常进程时，再通过 `lsof` / `kill` 清理。

### 3. 扩展未连接

在 SmartClip 扩展设置页：
- 确认「Enable MCP Service」已开启且账号为 Pro
- 确认 Session Token 与 `.mcp.json` 里的 `SMARTCLIP_MCP_SESSION_TOKEN` **完全一致**
- 点击「立即重连 / 重新检查」

### 4. Session Token 不匹配

如果工具调用长时间挂起或提示握手失败，通常是 token 两端不一致，或旧 Hub 仍在使用旧配置。检查：

- `.mcp.json` 的 `SMARTCLIP_MCP_SESSION_TOKEN`
- 扩展 Options 里的 Session Token

两端必须完全相同；修改或移除 token 后运行 `smartclip-mcp daemon stop`，再由客户端重新拉起新 Hub。

### 5. schema 不匹配或版本滞后报错

如果看到类似「状态数据格式无效」「缺少字段」的错误，说明运行的 `smartclip-mcp` 或后台 Hub 版本与扩展版本不匹配。升级到最新版并重启后台 Hub：

```bash
npm update -g smartclip-mcp
smartclip-mcp daemon stop
```

然后重启 Claude Code 会话。

---

## 卸载

如果需要完全移除 SmartClip：

```bash
# 1. 停止后台 Local Bridge Hub（会自动清理 ~/.smartclip/hub.json）
smartclip-mcp daemon stop

# 2. 卸载项目中的 Claude Code skills（不带 --targets 时默认只删 .agents/skills）
smartclip-agent-extension uninstall --project --targets .claude/skills
# 如需清理项目内所有支持的 skills 目录，可改用：
# smartclip-agent-extension uninstall --project --all

# 3. 卸载全局包
npm uninstall -g smartclip-mcp smartclip-agent-extension
```

然后删除项目 `.mcp.json` 中的 `smartclip` 配置项；如需彻底清理状态目录，可按需删除 `~/.smartclip`（若自定义了 `SMARTCLIP_HOME` 则删除对应目录）。

---

## 进一步阅读

- 安装与使用细节：[`docs/install-and-usage.md`](install-and-usage.md)
- 构建与发布：[`RELEASE.md`](../RELEASE.md)
- Bridge Action 契约设计：[`docs/adr/0001-bridge-action-contract.md`](adr/0001-bridge-action-contract.md)
- Skills 安装拓扑设计：[`docs/adr/0002-skills-install-topology.md`](adr/0002-skills-install-topology.md)
- MCP 工具列表：[`../README.md`](../README.md)
