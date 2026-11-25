---
name: smartclip-troubleshooting
description: Diagnose SmartClip MCP setup, Local Hub, or Chrome extension connection/auth issues.
---

# SmartClip Troubleshooting

1. With shell access, run `npx -y smartclip-mcp doctor --json` (or `smartclip-agent-doctor --json`); without shell, call `get_status`.
2. If client MCP config is missing, run `npx -y smartclip-mcp setup`.
3. Confirm Chrome is open, SmartClip extension is enabled with a **Pro** account, and **Enable MCP Service** is on.
4. After changing `SMARTCLIP_MCP_SESSION_TOKEN` or `SMARTCLIP_MCP_ALLOWED_ORIGINS`, run `npx -y smartclip-mcp daemon stop` so a new Hub picks up the config.
5. Ensure the extension uses the exact `SMARTCLIP_MCP_SESSION_TOKEN` (invalid handshakes are rejected). All browser extension origins are allowed by default unless `SMARTCLIP_MCP_ALLOWED_ORIGINS` is explicitly set—if set, include your `chrome-extension://<id>`.
