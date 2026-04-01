---
name: save-with-smartclip
description: Use when the user explicitly wants to save, clip, or send webpage content or generated markdown into Notion, Obsidian, Flomo, Joplin, or another SmartClip destination.
---

# Save with SmartClip

Use this skill only when the user clearly asks to save content.

## Rules
- If saving a webpage directly, use `clip_page` with `destination`.
- If saving AI-generated markdown, use `save_clip`.
- Avoid silent saving when the user only asked to read.

## Common flows
- Save current page: `clip_page({ destination: 'obsidian' })`
- Save a URL: `clip_page({ url: 'https://...', destination: 'notion' })`
- Save synthesized notes: `save_clip({ destination, title, contentMarkdown })`

## Good prompts that trigger this skill
- "save this to notion"
- "clip this article to obsidian"
- "put this summary into flomo"
