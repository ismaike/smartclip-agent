# SmartClip MCP Server (`smartclip-mcp`)

[Official Website](https://smartclip.app) | [GitHub](https://github.com/ismaike/smartclip-agent) | [中文手册](https://github.com/ismaike/smartclip-agent/blob/main/docs/install-and-usage.md)

**`smartclip-mcp` is a Chrome Extension–powered Model Context Protocol (MCP) server that enables Claude Code, Cursor, Windsurf, Gemini CLI, and OpenCode to read logged-in webpages as Markdown and clip content to 16 note-taking apps.**

## Key Advantages

- **Authenticated Browser Access**: Reads paywalled, logged-in, and internal pages directly from your active Chrome session via the SmartClip extension.
- **16 Destinations Out of the Box**: Save to Obsidian, Notion, Flomo, SiYuan (思源笔记), Feishu (飞书), Yuque (语雀), Logseq, Joplin, Memos, Wolai, FlowUs, GetBiji, Markdown download, S3, Aliyun OSS, and Tencent COS.
- **Local Bridge Hub (Multi-Client Concurrency)**: Multiple stdio and Streamable HTTP (`http://127.0.0.1:18365/mcp`) clients share one Chrome extension connection (`ws://127.0.0.1:18365/`), with automatic serialization for tab-switching and clipping writes.
- **Built-in MCP `instructions` & 4 Native `Prompts`**: Guides agents to use `read_page` for read-only tasks and `clip_page` / `save_clip` only when saving is requested.

## Quick Start

### 1. Prepare SmartClip Chrome Extension

1. Install **SmartClip** from [smartclip.app](https://smartclip.app) and sign in with a **Pro** account.
2. Enable **Enable MCP Service** in SmartClip Options.

### 2. Configure Your AI Client

```bash
npx smartclip-mcp setup
```

Supported auto-setup targets: `.mcp.json`, `~/.claude.json` (Claude Code), `~/.cursor/mcp.json` (Cursor), `~/.gemini/settings.json` (Gemini CLI), and `~/.codeium/windsurf/mcp_config.json` (Windsurf). In interactive mode, pressing Enter writes the first item (`.mcp.json`); pass `--client all` to write all 5 targets. Existing `smartclip` entries are replaced while preserving other servers.

Manual **stdio** configuration (also works for **OpenCode** and other stdio MCP clients):

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

Manual **Streamable HTTP** configuration (run `npx -y smartclip-mcp daemon start` first—HTTP clients do not auto-spawn the Hub):

```json
// Cursor / Windsurf
{
  "mcpServers": {
    "smartclip": {
      "url": "http://127.0.0.1:18365/mcp"
    }
  }
}
```

- **Claude Code / `.mcp.json`**: add `"type": "http"` alongside `"url": "http://127.0.0.1:18365/mcp"`.
- **Gemini CLI**: use `"httpUrl": "http://127.0.0.1:18365/mcp"` (`"url"` in Gemini CLI selects SSE).
- `npx smartclip-mcp setup --transport http` writes the right format per client automatically.

### 3. Restart Client, Diagnostics & Daemon Control

Restart your AI client to load the configuration (or start the Hub via `daemon start`), then verify:

```bash
npx -y smartclip-mcp doctor
npx -y smartclip-mcp --healthcheck --json
npx -y smartclip-mcp daemon status
npx -y smartclip-mcp daemon stop
```

## Available MCP Tools (9)

| Tool | Description | Structured Output |
|---|---|---|
| `read_page` | Read a webpage as Markdown (read-only; full text returned in `content[].text`) | `{ url, title, markdown, totalLength, truncated, warning, createdTabId }` |
| `clip_page` | Extract a page or clip it to a destination | `{ url, title, markdown, saved, destination, taskId, warning, createdTabId, clip }` |
| `save_clip` | Save AI-generated Markdown/HTML to a destination | `{ saved, destination, taskId, warning }` |
| `list_tabs` | List open Chrome tabs | `{ tabs, count }` |
| `get_daily_tasks` | View daily clipping task pool | `{ tasks, count, lastSyncAt }` |
| `clip_daily_task` | Process one daily task | `{ taskId, title, url, saved, clipTaskId, warning, markdown }` |
| `clip_all_daily_tasks` | Batch-process all pending daily tasks | `{ summary: { total, succeeded, failed }, results }` |
| `get_vocabulary` | Read user vocabulary | `{ words, count, enabled }` |
| `get_status` | Inspect MCP / extension connection and Pro status | `{ status }` |

Native MCP Prompts: `read-webpage`, `clip-webpage`, `process-daily-tasks`, `research-and-save`.

## Security & Environment Variables

- **Origin Validation**: WebSocket upgrades only accept browser extension origins (`chrome-extension://`, `moz-extension://`, `safari-web-extension://`) by default, blocking webpage CSWSH (`403`). Setting `SMARTCLIP_MCP_ALLOWED_ORIGINS` **overrides** (replaces) the default rule with an exact comma-separated allowlist.
- **Session Token Auth**: Read by the process that starts the Local Hub. Set `SMARTCLIP_MCP_SESSION_TOKEN` to require token verification during the `hello` handshake (no legacy fallback when enabled). Newer proxies auto-restart a Hub on token/version mismatch; stop any manually started Hub via `npx -y smartclip-mcp daemon stop` when removing tokens.

| Variable | Default | Purpose |
|---|---|---|
| `SMARTCLIP_MCP_SESSION_TOKEN` | unset | Shared token for extension `hello` handshake |
| `SMARTCLIP_MCP_ALLOWED_ORIGINS` | extension protocols | Exact comma-separated WebSocket Origin allowlist (overrides default) |
| `SMARTCLIP_MCP_WS_BIND_HOST` | `127.0.0.1` | Hub / WebSocket bind host (use `0.0.0.0` in Docker/WSL) |
| `SMARTCLIP_MCP_PORT` | `18365` | Hub / WebSocket port (same as `--port`) |
| `SMARTCLIP_MCP_NO_DAEMON` | `0` | Set to `1` to disable the shared Hub |
| `SMARTCLIP_HOME` | `~/.smartclip` | State directory storing `hub.json` |

## FAQ

- **How does SmartClip MCP differ from Playwright or Fetch MCP?**
  SmartClip runs inside your existing Chrome browser rather than launching a fresh headless browser, preserving your logins and integrating directly with 16 note-taking apps.
- **Can I use Claude Code and Cursor at the same time?**
  Yes. Both connect to the Local Bridge Hub on `127.0.0.1:18365` without port conflicts.

## License

MIT
