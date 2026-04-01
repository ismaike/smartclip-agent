---
name: using-smartclip-mcp
description: Use when you need to read or summarize a webpage, extract data from a specific URL or active browser tab, save/clip a webpage to a personal platform like Notion, Obsidian, Flomo, or Joplin, or when the user asks to view or process their daily clipping tasks.
---

# Using SmartClip MCP

## Overview
SmartClip MCP bridges the AI agent and the user's Chrome browser. This umbrella skill should route to the focused skills below whenever possible instead of carrying all instructions itself.

## Focused skills
- `read-webpage-with-smartclip` — reading and summarizing without saving
- `save-with-smartclip` — explicit save/clip workflows
- `process-smartclip-daily-tasks` — daily task queue flows
- `smartclip-troubleshooting` — setup, connection, and doctor workflows

## When to Use

- When the user asks you to summarize, read, or analyze a specific webpage (by URL or by referring to an open tab).
- When standard web fetching fails due to authentication or CAPTCHAs, since SmartClip runs inside the user's browser.
- When the user explicitly asks to save or "clip" a webpage to their notes (Notion, Obsidian, Flomo, Siyuan, Joplin, Feishu, etc.).
- When you need to save synthesized information (like a generated summary) directly to the user's knowledge base.
- When the user asks to view, process, or batch-clip their daily clipping tasks (e.g. "处理今天的任务", "clip my daily tasks", "show my task pool").

## Quick Reference

| Task | Tool to Use | Arguments to Pass |
|---|---|---|
| **Read a specific URL** | `clip_page` | `url: "https://..."` (No `destination`!) |
| **Read the active tab** | `clip_page` | (No arguments needed) |
| **Read a background tab** | `list_tabs` then `clip_page` | `list_tabs` -> find `tabId` -> `clip_page({ tabId: 123 })` |
| **Save a URL to Notion** | `clip_page` | `url: "https://...", destination: "notion"` |
| **Save a custom summary** | `save_clip` | `destination: "flomo", title: "...", contentMarkdown: "..."` |
| **View daily task pool** | `get_daily_tasks` | (No arguments, or `status: "pending"`) |
| **Clip one daily task** | `clip_daily_task` | `taskId: "xxx"` (get ID from `get_daily_tasks`) |
| **Clip all pending tasks** | `clip_all_daily_tasks` | (No arguments needed, uses default destination) |

## Routing Guidance
- If the user wants to read or summarize a webpage, prefer `read-webpage-with-smartclip`.
- If the user explicitly wants to save content, prefer `save-with-smartclip`.
- If the user mentions daily tasks, prefer `process-smartclip-daily-tasks`.
- If MCP is unavailable or disconnected, prefer `smartclip-troubleshooting`.

## Core Workflows

### ⚡️ STRICT RULE: The "One-Step" Principle
To minimize latency and prevent polluting user notes, follow these rules:
1. **NEVER** use `extract_page` followed by `convert_to_markdown`. These are low-level tools. 
2. **ALWAYS** use `clip_page` for reading, summarizing, or analyzing any webpage. It handles extraction and conversion in a single, optimized step.
3. **DO NOT** pass the `destination` parameter unless the user explicitly said "save this", "clip this to Notion", etc. 
4. If you just need the content to answer a question, call `clip_page` with **NO destination**.

### 1. Reading / Information Gathering (No Saving)
When the user just wants you to *read* a page to answer a question or summarize it:
```javascript
// BEST PRACTICE: One call, no saving, returns full Markdown.
clip_page({ url: 'https://github.com/org/repo/pull/1' })
```

### 2. Clipping / Saving to Notebook
When the user explicitly asks to save a page to their notebook:
```javascript
// Only use destination when requested.
clip_page({ destination: 'obsidian' })
```

### 3. Daily Task Pool (Automated Clipping)
When the user asks to view or process their daily clipping tasks (a queue of URLs synced from the cloud that need to be clipped):
```javascript
// Step 1: View pending tasks
get_daily_tasks({ status: 'pending' })

// Step 2a: Clip a specific task (auto-opens URL, extracts, saves, closes tab)
clip_daily_task({ taskId: 'task-id-from-step-1' })

// Step 2b: Or batch-clip ALL pending tasks sequentially
clip_all_daily_tasks()
```

**Important rules for daily tasks:**
- Unlike `clip_page`, daily task tools **always save** content. They use the user's configured default destination if none is specified.
- `clip_daily_task` and `clip_all_daily_tasks` automatically open the URL, extract content, save to the notebook, mark the task as completed, and close the tab.
- Before batch-processing with `clip_all_daily_tasks`, **always show the user the task list first** and confirm they want to proceed.
- If the user says "处理今天的任务" / "process my daily tasks" / "clip my tasks", start by calling `get_daily_tasks` to show them what's pending.

## Common Mistakes (Red Flags)

- ❌ **Polluting User Notes**: Passing the `destination` parameter when the user only asked you to "read" or "summarize" a page.
  - **Fix**: ONLY use `destination` if the user explicitly asks to save or clip it. If `destination` is omitted, `clip_page` will simply return the Markdown to you.
- ❌ **Ignoring `url` parameter in `clip_page`**: Trying to figure out how to open a tab first before clipping.
  - **Fix**: `clip_page` natively supports a `url` parameter. If you pass it, the extension will automatically open the tab, wait for it to load, and extract it.
- ❌ **Using `web_fetch` for logged-in pages**: Trying to use standard curl/fetch for private Jira/GitHub/internal docs.
  - **Fix**: Use `clip_page({ url: "..." })` instead, because it runs inside the user's Chrome browser and shares their cookies/session.

## Prerequisites & Auto-Installation
- **Crucial**: The `clip_page` tool MUST be available in your environment. If it is not, you cannot use this skill.
- **Auto-Installation Instructions (For AI Agents)**: If you detect that you do not have the `smartclip` MCP server configured (e.g. `clip_page` is missing), and you have access to terminal/shell execution and the user's workspace, **you should offer to configure it for the user automatically**.
  - **For Claude Code / Gemini CLI**: Propose adding the following to the `.mcp.json` file in the project root:
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
  - **For Cursor / Windsurf**: Instruct the user to add `npx -y smartclip-mcp` to their MCP settings.
- The user must have the Chrome browser open with the SmartClip extension installed and enabled.
- The "Enable MCP Service" toggle must be turned ON in the extension's General Settings (Premium feature). If the connection fails, politely remind the user of this requirement.

## Troubleshooting: Extension Not Connected
If you call `clip_page` or `list_tabs` and receive an error containing **"Chrome 扩展未连接"** or **"Chrome extension not connected"**, it means the MCP server is running but the browser extension is either not installed, not open, or the MCP toggle is disabled.
- **Your Action as an AI Agent**:
  1. Politely inform the user that the SmartClip extension is not connected.
  2. Ask if they need to install the extension.
  3. If they say yes, use your terminal/shell execution capability to automatically open the Chrome Web Store page for them!
     - Mac: `open "https://chromewebstore.google.com/search/SmartClip"`
     - Windows: `start "https://chromewebstore.google.com/search/SmartClip"`
     - Linux: `xdg-open "https://chromewebstore.google.com/search/SmartClip"`
  4. Remind them that after installation, they need to log in as a Premium user and turn on "Enable MCP Service" in the extension's settings.
