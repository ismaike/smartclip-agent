---
name: smartclip-troubleshooting
description: Use when SmartClip MCP tools are unavailable, the browser extension is disconnected, MCP health checks fail, or setup/installation needs repair.
---

# SmartClip Troubleshooting

Use this skill when SmartClip is installed incorrectly or not connected.

## Common symptoms
- `clip_page` missing
- "Chrome extension not connected"
- MCP configured but browser bridge offline
- skill files not installed

## What to do
1. Run `smartclip-agent-extension doctor --json` if shell access is available.
2. Verify `.mcp.json` contains a `smartclip` server.
3. Verify the SmartClip extension is installed, browser is open, and MCP service is enabled.
4. If needed, guide the user to the Chrome Web Store page.

## Important reminders
- MCP service is premium-gated in the extension.
- A running MCP server alone is not enough; the extension must also connect.
