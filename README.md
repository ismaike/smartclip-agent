# SmartClip Agent & MCP Server

English | [简体中文](README.zh-CN.md) | [Official Website](https://smartclip.app) | [Install & Usage Guide](docs/install-and-usage.md)

**SmartClip MCP (`smartclip-mcp`) is a Chrome Extension–powered Model Context Protocol (MCP) server that lets AI coding agents—Claude Code, Cursor, Windsurf, Gemini CLI, and OpenCode—read logged-in webpages as clean Markdown and clip them to 16 note-taking apps.**

Unlike headless scrapers or single-app connectors, `smartclip-mcp` connects directly to your real Chrome session via a **Local Bridge Hub** (`127.0.0.1:18365`), reusing your existing browser cookies, paywall/intranet sessions, Turndown conversion rules, and destination credentials—while allowing multiple AI clients to share one extension connection concurrently.

---

## Why SmartClip MCP vs. Alternatives?

| Capability | **SmartClip MCP** | Fetch / Firecrawl MCP | Playwright / Browser MCP | Single-App MCP (Notion / Obsidian only) |
|---|---|---|---|---|
| **Reads logged-in / paywalled / intranet pages** | Yes (uses your live Chrome session) | No (anonymous HTTP/headless) | Partial (requires separate profile/login) | No |
| **Bypasses anti-bot walls** | Yes (real user browser) | Often blocked | Often flagged | N/A |
| **Clean HTML-to-Markdown extraction** | Built-in Turndown engine (`read_page`) | Varies | Raw DOM / accessibility tree | N/A |
| **Multi-platform note clipping** | **16 destinations** in one toolset | Read-only | Read/Automate only | 1 destination |
| **Concurrent multi-client sharing** | **Local Bridge Hub** (stdio + Streamable HTTP) | N/A | Often single-browser lock | Varies |

---

## Quick Start (3 Steps)

### 1. Enable MCP in the SmartClip Chrome Extension

1. Install the **SmartClip** Chrome extension from [smartclip.app](https://smartclip.app) and sign in (Pro subscription required for MCP service).
2. Open **SmartClip → Options → General Settings** and enable **Enable MCP Service**.

### 2. Configure Your AI Client

```bash
npx smartclip-mcp setup
```

In interactive mode, `setup` detects installed client configs and lets you pick targets (pressing Enter writes the first item, `.mcp.json`; enter `a` or run `npx smartclip-mcp setup --client all` to write all 5 targets). It preserves other MCP servers while replacing any existing `smartclip` entry:
- Project `.mcp.json`
- Claude Code (`~/.claude.json`)
- Cursor (`~/.cursor/mcp.json`)
- Gemini CLI (`~/.gemini/settings.json`)
- Windsurf (`~/.codeium/windsurf/mcp_config.json`)

For **OpenCode** or manual **stdio** configuration:

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

> Streamable HTTP (`--transport http`) requires starting the Local Hub first (`npx -y smartclip-mcp daemon start`). `setup` emits client-specific HTTP fields (`type: "http"` + `url` for Claude Code / `.mcp.json`, `httpUrl` for Gemini CLI, `url` for Cursor / Windsurf).

### 3. Restart Your Client & Verify Health

Restart your AI client so it loads the new MCP configuration (or start the Hub manually with `npx -y smartclip-mcp daemon start`), then run:

```bash
npx -y smartclip-mcp doctor
```

---

## Local Bridge Hub Architecture

```text
Claude Code (stdio) ──┐
Gemini CLI  (stdio) ──┼──▶ smartclip-mcp Local Hub (127.0.0.1:18365) ◀──WS(/)──▶ SmartClip Chrome Extension
Cursor / Windsurf  ───┘       ├─ /mcp    (Streamable HTTP)
                              └─ /health (sub-second health probe)
```

- **Multi-client concurrency**: Run Claude Code, Cursor, and Gemini CLI at the same time sharing one extension connection; write/tab-switching actions are serialized automatically inside the Hub.
- **Persistent browser link**: Restarting an AI session does not drop the Chrome extension WebSocket bridge.
- **Standalone fallback**: Pass `--no-daemon` (or set `SMARTCLIP_MCP_NO_DAEMON=1`) to run in single-process mode inside restricted containers.

---

## 16 Supported Note-Taking Destinations

Defined in `smartclip-bridge-protocol` (`destinationSchema`):

| Category | Destinations |
|---|---|
| **Local & Knowledge Bases** | `obsidian` (Obsidian), `siyuan` (SiYuan / 思源笔记), `logseq` (Logseq), `joplin` (Joplin), `markdown` (Markdown download) |
| **Cloud Workspaces & Docs** | `notion` (Notion), `feishu` (Feishu / 飞书), `yuque` (Yuque / 语雀), `wolai` (Wolai), `flowus` (FlowUs) |
| **Quick Capture & Memos** | `flomo` (Flomo), `memos` (Memos), `getbiji` (GetBiji / Get笔记) |
| **Object Storage Sync** | `s3_doc` (AWS S3), `aliyun_oss_doc` (Aliyun OSS / 阿里云 OSS), `tencent_cos_doc` (Tencent COS / 腾讯云 COS) |

---

## MCP Tools (9) & Native Prompts (4)

| Tool | Purpose | Read-Only | Structured Output |
|---|---|---|---|
| `read_page` | Read current tab, `tabId`, or URL as Markdown (full text returned in `content[].text`) | Yes | `{ url, title, markdown, totalLength, truncated, warning, createdTabId }` |
| `clip_page` | Extract a webpage and optionally save to a destination | No | `{ url, title, markdown, saved, destination, taskId, warning, createdTabId, clip }` |
| `save_clip` | Save AI-synthesized Markdown/HTML summaries to a destination | No | `{ saved, destination, taskId, warning }` |
| `list_tabs` | List open Chrome tabs | Yes | `{ tabs, count }` |
| `get_daily_tasks` | View SmartClip daily clipping task pool | Yes | `{ tasks, count, lastSyncAt }` |
| `clip_daily_task` | Process one daily task | No | `{ taskId, title, url, saved, clipTaskId, warning, markdown }` |
| `clip_all_daily_tasks` | Batch-process all pending daily tasks | No | `{ summary, results }` |
| `get_vocabulary` | Read user vocabulary list | Yes | `{ words, count, enabled }` |
| `get_status` | Inspect MCP / extension health and Pro status | Yes | `{ status }` |

Built-in MCP Prompts: `read-webpage`, `clip-webpage`, `process-daily-tasks`, `research-and-save`.

---

## Security & Diagnostics

- **CSWSH Protection (Origin Check)**: WebSocket upgrades only accept browser extension origins (`chrome-extension://`, `moz-extension://`, `safari-web-extension://`) by default and reject webpage origins (`403`). Setting `SMARTCLIP_MCP_ALLOWED_ORIGINS` **overrides** (replaces) this default rule with an exact comma-separated allowlist—include every extension origin you use.
- **Strict Session Token Auth**: Read from the environment of the process starting the Local Hub. When `SMARTCLIP_MCP_SESSION_TOKEN` is set, connections failing or timing out on the `hello` handshake are closed immediately without legacy fallback. Newer proxies auto-restart a running Hub on token/version mismatch; if removing a token or running `daemon start`, stop the old Hub first (`daemon stop`).
- **Internal Hub Isolation**: `/bridge/invoke` and `/hub/shutdown` reject browser `Origin` headers and require the per-instance secret in `~/.smartclip/hub.json`.

### Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `SMARTCLIP_MCP_SESSION_TOKEN` | unset | Shared token required during extension `hello` handshake |
| `SMARTCLIP_MCP_ALLOWED_ORIGINS` | extension protocols | Comma-separated exact WebSocket Origin allowlist (overrides default) |
| `SMARTCLIP_MCP_WS_BIND_HOST` | `127.0.0.1` | Hub / WebSocket bind host (use `0.0.0.0` in Docker/WSL) |
| `SMARTCLIP_MCP_PORT` | `18365` | Hub / WebSocket listening port (same as `--port`) |
| `SMARTCLIP_MCP_NO_DAEMON` | `0` | Set to `1` to disable the shared Hub and connect inline |
| `SMARTCLIP_HOME` | `~/.smartclip` | State directory storing `hub.json` |

```bash
npx -y smartclip-mcp doctor                 # Check client configs, Local Hub & extension health
npx -y smartclip-mcp --healthcheck --json   # Fast non-blocking health probe
npx -y smartclip-mcp daemon status          # Inspect background Hub status
npx -y smartclip-mcp daemon stop            # Stop Hub (required when clearing tokens or switching builds)
```
*(If installed globally via `npm install -g smartclip-mcp`, you can omit `npx -y`.)*

---

## Optional: Agent Skills (`smartclip-agent-extension`)

`smartclip-mcp` already ships with MCP `instructions` and 4 native `Prompts`. If you also want `SKILL.md` workflow playbooks for Claude Code or Gemini CLI:

```bash
npm install -g smartclip-agent-extension
smartclip-agent-extension
```

---

## Frequently Asked Questions (FAQ)

### How do I let Claude Code or Cursor read logged-in, paywalled, or internal webpages?
Configure `smartclip-mcp` via `npx smartclip-mcp setup`, open the page in Chrome with the SmartClip extension enabled, and ask your agent to read it. It calls `read_page`, which extracts clean Markdown directly from your authenticated Chrome tab without running a separate headless browser.

### Can multiple AI clients (e.g. Claude Code + Cursor) use SmartClip at the same time?
Yes. `smartclip-mcp` starts a shared Local Bridge Hub on `127.0.0.1:18365` supporting both stdio proxy clients and Streamable HTTP (`http://127.0.0.1:18365/mcp`). Concurrent tab-reading and clipping requests are safely coordinated inside the Hub.

### What is the difference between `read_page`, `clip_page`, and `save_clip`?
Use `read_page` when you only want the AI to read or summarize a page without saving anything; use `clip_page` with `destination` to clip a webpage directly to a note app; use `save_clip` to save AI-synthesized notes, translations, or multi-tab research summaries.

---

## Monorepo Packages & Development

| Package | Path | Purpose |
|---|---|---|
| `smartclip-bridge-protocol` | `packages/smartclip-bridge-protocol` | Shared bridge schemas, error codes, and action contracts |
| `smartclip-mcp` | `packages/smartclip-mcp` | Local Bridge Hub, MCP Server (stdio & Streamable HTTP), unified CLI |
| `smartclip-agent-extension` | `packages/smartclip-agent-extension` | Optional `SKILL.md` playbooks, hooks, and doctor CLI |

```bash
pnpm install
pnpm build
pnpm test
```

## License

[MIT License](LICENSE) © 2024 maike
