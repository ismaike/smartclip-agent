# SmartClip Agent 安装与使用手册

本文档面向最终用户，说明如何安装 `smartclip-mcp`（以及可选的 `smartclip-agent-extension`）、配置 MCP、运行诊断，并在 AI CLI/IDE 中使用 SmartClip。

## 1. 你会得到什么

安装完成后，你的 AI agent 可以：

- 只读当前 Chrome 中打开的网页（含登录态页面）并转成 Markdown（`read_page`）
- 将网页或 AI 整理后的总结保存到 Obsidian / Notion / Flomo / Joplin / 思源 / 飞书等 16 个平台（`clip_page` / `save_clip`）
- 查看和处理 SmartClip 的每日任务池，查看生词本（只读）
- 多个 AI 客户端并发共享同一个 Chrome 扩展连接

## 2. 安装前准备

1. Node.js >= 18
2. Chrome 浏览器与 SmartClip Chrome 扩展
3. 在扩展中登录 Pro 账号，打开 **SmartClip → Options → General Settings → Enable MCP Service / 开启 MCP 服务**

## 3. 快速安装（推荐 3 步完成）

### Step 1：安装并一键配置客户端

```bash
npm install -g smartclip-mcp
smartclip-mcp setup
```

`smartclip-mcp setup` 支持以下 5 个配置目标（保留已有其他 MCP 服务器，但会**替换**已有的 `mcpServers.smartclip` 条目）：
- 项目目录 `.mcp.json`
- Claude Code（`~/.claude.json`）
- Cursor（`~/.cursor/mcp.json`）
- Gemini CLI（`~/.gemini/settings.json`）
- Windsurf（`~/.codeium/windsurf/mcp_config.json`）

选择策略说明：
- **交互终端（TTY）**：启动选择向导，可输入序号（如 `1,2`）或输入 `a` 写入全部已探测目标；直接回车默认仅写入第 1 项（`.mcp.json`）。
- **非交互环境（无 `--client`）**：仅写入磁盘上已存在的全局客户端配置；若都不存在，则写入当前目录 `.mcp.json`。若要一次性写入全部 5 个目标，请显式传入 `--client all`。

常用非交互参数：

```bash
smartclip-mcp setup --client all --transport stdio
smartclip-mcp setup --client claude,cursor --transport stdio
smartclip-mcp setup --client cursor --transport http
smartclip-mcp setup --client project --token your-secret-token
```

> 说明：`--transport http` 会按客户端生成对应格式（Claude Code / `.mcp.json` 使用 `{"type": "http", "url": "..."}`，Gemini CLI 使用 `{"httpUrl": "..."}`，Cursor / Windsurf 使用 `{"url": "..."}`）。使用 HTTP 模式不会由客户端自动拉起 Hub，须先手动运行 `smartclip-mcp daemon start`。

### Step 2：重启 AI 客户端（或启动 Local Hub）

重启对应的 AI 客户端使新配置生效；若使用 Streamable HTTP 模式或希望在启动客户端前先预热连接，可先运行：

```bash
smartclip-mcp daemon start
```

### Step 3：运行健康检查

当客户端已拉起 `smartclip-mcp`（或已手动 `daemon start`）后，运行诊断验证：

```bash
smartclip-mcp doctor
```

查看实时健康探针或管理后台 Local Bridge Hub：

```bash
smartclip-mcp --healthcheck --json
smartclip-mcp daemon status
smartclip-mcp daemon stop
```

## 4. 可选：安装高阶工作流 Skills（`smartclip-agent-extension`）

`smartclip-mcp` 已自带 MCP `instructions` 与 4 个原生 Prompts，普通场景无需额外装包。如果你希望为支持 `SKILL.md` 的客户端（Claude Code / Gemini CLI 等）补充工作流规则，可额外安装：

```bash
npm install -g smartclip-agent-extension
smartclip-agent-extension
```

支持交互或参数安装（不会在 `npm install` 时静默写入文件；未指定 `--targets` 时默认仅写入 `.agents/skills`）：

```bash
# 全局安装到默认标准目录 (~/.agents/skills)
smartclip-agent-extension --global

# 全局安装到 Claude Code / Gemini CLI 对应目录，或全部 3 个目录
smartclip-agent-extension --global --targets .claude/skills
smartclip-agent-extension --global --targets .gemini/skills
smartclip-agent-extension --global --all

# 项目安装到所有目录
smartclip-agent-extension --project --all

# 指定范围和多个目录
smartclip-agent-extension --global --targets .agents/skills,.claude/skills
```

支持的目标目录：
- `.agents/skills` - 标准通用目录（默认）
- `.claude/skills` - Claude Code
- `.gemini/skills` - Gemini CLI

包含的 4 个技能：
- `smartclip-read`
- `smartclip-save`
- `smartclip-daily`
- `smartclip-troubleshooting`

卸载、升级与扩展诊断（`--all` 默认作用于全局 3 个目录，卸载/升级项目级目录需加 `--project`）：

```bash
smartclip-agent-extension uninstall --global
smartclip-agent-extension uninstall --all
smartclip-agent-extension uninstall --project --all
smartclip-agent-extension upgrade --global --all
smartclip-agent-extension doctor
smartclip-agent-doctor
```

## 5. 连接架构：Local Bridge Hub（多客户端共享）

```text
Claude Code (stdio) ──┐
Gemini CLI  (stdio) ──┼──▶ Local Bridge Hub (127.0.0.1:18365) ◀──WS(/)──▶ Chrome 扩展
Cursor / Windsurf  ───┘       ├─ /mcp    (Streamable HTTP)
                              └─ /health (毫秒级状态检查)
```

- 同一时刻可以同时打开多个 Claude Code、Cursor 或 Gemini CLI 窗口共享同一个 SmartClip 扩展连接。
- 涉及操作标签页或保存的动作会在 Hub 内部自动串行排队，防止互相干扰。
- 如在受限沙箱或需单进程直连，可使用 `--no-daemon` 或设置 `SMARTCLIP_MCP_NO_DAEMON=1`。

## 6. 安全配置与环境变量

- **Origin 白名单**：默认仅放行浏览器扩展 Origin（`chrome-extension://`、`moz-extension://`、`safari-web-extension://`），阻止网页跨站劫持。若设置了 `SMARTCLIP_MCP_ALLOWED_ORIGINS`，会**完全覆盖**默认扩展白名单，因此列表必须精确包含所有要使用的扩展 Origin（逗号分隔）。
- **Session Token**：若启动 Local Hub 的进程带有 `SMARTCLIP_MCP_SESSION_TOKEN`，扩展必须完成带同一 token 的 `hello` 握手才能连接，不再允许静默降级绕过。新版 `smartclip-mcp` 代理若检测到与运行中 Hub 的 token/版本/Origin 配置不一致，会自动重启 Hub 以应用新配置；若需移除 token 或手动使用 `daemon start` / HTTP 模式，请先运行 `smartclip-mcp daemon stop` 再用新环境变量启动 Hub（例如 `SMARTCLIP_MCP_SESSION_TOKEN=your-secret-token smartclip-mcp daemon start`）。

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

### 环境变量清单

| 变量 | 默认值 | 说明（修改后需重启 Hub 生效） |
|---|---|---|
| `SMARTCLIP_MCP_SESSION_TOKEN` | 未设置 | 扩展 `hello` 握手认证 token（设置后禁止 `legacyMode` 降级） |
| `SMARTCLIP_MCP_ALLOWED_ORIGINS` | 放行扩展协议 | 逗号分隔的精确 WebSocket Origin 白名单（**覆盖**默认扩展协议规则） |
| `SMARTCLIP_MCP_WS_BIND_HOST` | `127.0.0.1` | Hub / WebSocket 监听地址（Docker/WSL 场景可设为 `0.0.0.0`） |
| `SMARTCLIP_MCP_PORT` | `18365` | Hub / WebSocket 监听端口（同 `--port`） |
| `SMARTCLIP_MCP_NO_DAEMON` | `0` | 设为 `1` 时禁用共享 Hub，在当前进程内直连（单客户端模式） |
| `SMARTCLIP_HOME` | `~/.smartclip` | 状态目录（存放 `hub.json`） |

## 7. 推荐使用姿势

- **只读网页**：直接让 AI 总结或分析网页 → 优先使用 `read_page`（不保存，正文直接返回）
- **保存网页**：明确要求保存到 Obsidian / Notion 等 → 使用 `clip_page` + `destination`
- **保存 AI 总结**：把总结保存到笔记平台 → 使用 `save_clip`
- **处理每日任务池**：查看并处理待办 → `get_daily_tasks` / `clip_daily_task` / `clip_all_daily_tasks`

## 8. 常见问题排查

1. **AI 说扩展未连接**：执行 `smartclip-mcp doctor` 检查 Chrome 是否打开、扩展是否开启 MCP 服务且为 Pro 账号。
2. **设置了 token 后连接被拒绝**：核对配置中的 `SMARTCLIP_MCP_SESSION_TOKEN` 与扩展设置页中的 token 是否完全一致；若刚改动或清除了 token，先执行 `smartclip-mcp daemon stop` 再重启客户端或 `daemon start`。
3. **未打包扩展开发调试连接被 403 拒绝**：默认策略已放行所有 `chrome-extension://`（含未打包扩展）；若被 403 拒绝，请检查是否显式设置了 `SMARTCLIP_MCP_ALLOWED_ORIGINS` 且遗漏了该未打包扩展的 Origin。
