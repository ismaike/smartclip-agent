---
name: smartclip-save
description: Explicitly save or clip webpages or notes to Notion, Obsidian, Flomo, or other SmartClip destinations.
---

# Save with SmartClip

- Save only when explicitly asked (use `read_page` for reading).
- Verbatim webpage: `clip_page` with `destination`.
- AI-synthesized summary/notes: `save_clip` (`destination`, `url`, `title`, `contentMarkdown`, optional `excerpt`/`tags`); confirm outline/destination first if ambiguous.
