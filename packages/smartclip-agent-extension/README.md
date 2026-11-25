# smartclip-agent-extension

[Official Website](https://smartclip.app) | [GitHub](https://github.com/ismaike/smartclip-agent) | [Main MCP Package (`smartclip-mcp`)](https://www.npmjs.com/package/smartclip-mcp)

Optional **Agent Skills**, **SessionStart hooks**, and diagnostic CLI companion for [`smartclip-mcp`](https://www.npmjs.com/package/smartclip-mcp).

> Note: [`smartclip-mcp`](https://www.npmjs.com/package/smartclip-mcp) already includes built-in MCP `instructions`, 4 native MCP `Prompts`, `setup`, and `doctor`. Install `smartclip-agent-extension` when you want lightweight `SKILL.md` workflow playbooks deployed for Claude Code, Gemini CLI, or `.agents/skills`-compatible agents.

## Included Skills

- `smartclip-read` — Read, summarize, or compare webpages via Chrome without saving.
- `smartclip-save` — Explicitly save webpages or AI summaries to Notion, Obsidian, Flomo, SiYuan, Feishu, and 11 more destinations.
- `smartclip-daily` — Triage and clip SmartClip daily task pool items with confirmation.
- `smartclip-troubleshooting` — Diagnose SmartClip MCP setup, Local Hub, or Chrome extension connection/auth issues.

## Installation & Usage

```bash
npm install -g smartclip-agent-extension

# Interactive install
smartclip-agent-extension

# Non-interactive examples (--global without --targets writes ~/.agents/skills only)
smartclip-agent-extension --global --default
smartclip-agent-extension --global --targets .claude/skills
smartclip-agent-extension --global --all
smartclip-agent-extension --project --all

# Diagnostics & upgrade (--all applies to all 3 directories in the selected scope)
smartclip-agent-extension doctor
smartclip-agent-extension upgrade --global --all
```

## License

MIT © maike
