---
name: using-smartclip-mcp
description: Use when you need to read or summarize a webpage, extract data from a specific URL or active browser tab, or when you are explicitly asked to save/clip a webpage or notes to a personal platform like Notion, Obsidian, Flomo, or Joplin.
---

# Using SmartClip MCP

## Overview
SmartClip MCP bridges the AI agent and the user's Chrome browser. It allows you to read the user's open tabs, extract clean Markdown from any URL (including authenticated or local pages), and optionally save content to their personal knowledge base.

## When to Use

- When the user asks you to summarize, read, or analyze a specific webpage (by URL or by referring to an open tab).
- When standard web fetching fails due to authentication or CAPTCHAs, since SmartClip runs inside the user's browser.
- When the user explicitly asks to save or "clip" a webpage to their notes (Notion, Obsidian, Flomo, Siyuan, Joplin, Feishu, etc.).
- When you need to save synthesized information (like a generated summary) directly to the user's knowledge base.

## Quick Reference

| Task | Tool to Use | Arguments to Pass |
|---|---|---|
| **Read a specific URL** | `clip_page` | `url: "https://..."` (No `destination`!) |
| **Read the active tab** | `clip_page` | (No arguments needed) |
| **Read a background tab** | `list_tabs` then `clip_page` | `list_tabs` -> find `tabId` -> `clip_page({ tabId: 123 })` |
| **Save a URL to Notion** | `clip_page` | `url: "https://...", destination: "notion"` |
| **Save a custom summary** | `save_clip` | `destination: "flomo", title: "...", contentMarkdown: "..."` |

## Core Workflows

### 1. Reading / Information Gathering (No Saving)
When the user just wants you to *read* a page to answer a question or summarize it:
```javascript
// Good: Reads the page and returns Markdown to you. Note the ABSENCE of destination.
clip_page({ url: 'https://github.com/org/repo/pull/1' })
```

### 2. Clipping / Saving to Notebook
When the user explicitly asks to save a page to their notebook:
```javascript
// Good: Extracts the active tab and saves it to Obsidian.
clip_page({ destination: 'obsidian' })
```

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
