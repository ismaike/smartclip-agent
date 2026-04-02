---
name: smartclip-read
description: Use when the user wants to read, summarize, inspect, or analyze a webpage without saving it to their note-taking app.
---

# Read Webpages with SmartClip

Use this skill when the goal is browser-assisted reading only.

## Primary rule
- Prefer `clip_page`.
- Do **not** pass `destination` unless the user explicitly wants to save.
- Do **not** chain `extract_page` -> `convert_to_markdown` for normal reading flows.

## Common flows
- Read a URL: `clip_page({ url: 'https://...' })`
- Read current tab: `clip_page({})`
- Read a background tab: `list_tabs` -> choose tab -> `clip_page({ tabId })`

## When this skill is correct
- Summaries
- Research
- Explaining page contents
- Reading authenticated pages through the user’s browser session

## If it fails
If the tool reports the extension is not connected, switch to `smartclip-troubleshooting`.
