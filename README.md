# SmartClip Agent Extension

> Supercharge your AI Agents (Claude Code, Gemini CLI, Cursor, Windsurf, OpenCode) with the ability to read, extract, and save real browser web pages using [SmartClip](https://github.com/your-username/smartclip).

## What is this?

This repository contains the **Model Context Protocol (MCP)** server, **Skills**, **Hooks**, and **Commands** that connect your favorite CLI AI agents directly to your Chrome browser. 

By integrating this, your AI agent can:
1. **Bypass Captchas & Paywalls**: Because it reads from your active browser tab, if you are logged in to Jira, Twitter, Medium, or a local `localhost` dev server, the AI can read it too.
2. **Extract Clean Markdown**: Instantly convert any webpage into clean, readable Markdown structure for context gathering.
3. **Save to Your Notes**: Directly instruct the AI to clip pages or save generated summaries into Notion, Obsidian, Flomo, Siyuan, or Joplin.

---

## 🚀 Quick Start for AI CLI Tools (Gemini CLI / Claude Code / OpenCode)

If you use a modern AI CLI tool, this package acts as a full-fledged extension.

### 1. Install the MCP Server globally
```bash
npm install -g smartclip-mcp
```
*(Note: If you are building from source, run `npm link` in the `packages/smartclip-mcp` directory).*

### 2. Configure MCP in your workspace
Create or update the `.mcp.json` file in your project root:
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

### 3. Install SmartClip Agent Skills (Optional but Highly Recommended)
This step injects the AI "Skill" (instruction manual) into your workspace so the AI knows *exactly* how to use the MCP without polluting your personal notes.

In your project directory, run:
```bash
npx smartclip-agent-extension install-skills
```
*(If building locally, run `node packages/smartclip-agent-extension/install.js` from this repository).*

This script automatically detects `.gemini/`, `.claude/`, or `.opencode/` folders and places the `using-smartclip-mcp` skill in the right place.

---

## 💻 Usage in Cursor / Windsurf

1. Open **Settings** > **Features** > **MCP Servers**.
2. Click **+ Add New MCP Server**.
3. Set Name to `smartclip` and Type to `command`.
4. Command: `npx -y smartclip-mcp`.
5. Add the contents of [`packages/smartclip-agent-extension/skills/using-smartclip-mcp/SKILL.md`](packages/smartclip-agent-extension/skills/using-smartclip-mcp/SKILL.md) to your `.cursorrules` or AI instructions so the IDE understands how to behave.

---

## Chrome Extension Prerequisites

For this MCP to work, you **MUST** have the SmartClip Chrome extension installed and properly configured:
1. Install [SmartClip from the Chrome Web Store](https://chromewebstore.google.com/search/SmartClip).
2. Upgrade/Login as a Premium user.
3. Open SmartClip **Options** -> **General Settings**.
4. Turn ON **"Enable MCP Service"**.

---

## Architecture (The "Superpowers" Way)

This project embraces the plugin architecture inspired by the [Superpowers](https://github.com/obra/superpowers) project, structured as a monorepo:
- **`packages/smartclip-mcp/`**: The WebSocket bridge communicating with Chrome.
- **`packages/smartclip-agent-extension/`**: Contains the skills, hooks, and commands.
  - **`skills/`**: Markdown-based "Frontmatter" guides that teach the AI how to use tools properly (lazy-loaded to save tokens).
  - **`hooks/`**: Shell scripts like `session-start.sh` that run when the AI CLI boots up, automatically checking if port `18365` is open and injecting connection status into the AI's context.
  - **`commands/`**: Shortcut macros (e.g., `/clip`) for rapid execution.

---

## Available MCP Tools

| Tool | Description |
|------|-------------|
| `clip_page` | The primary tool. Pass `url` to extract a page. Pass `destination` to save it to your notebook. Leave `destination` empty to just read the Markdown. |
| `list_tabs` | Lists all open tabs in your Chrome browser to find the target `tabId`. |
| `save_clip` | Allows the AI to construct its own Markdown (like a summary) and save it directly to Notion, Obsidian, etc. |

## License
[MIT License](LICENSE) © 2024 maike