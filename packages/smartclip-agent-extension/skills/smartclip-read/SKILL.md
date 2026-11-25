---
name: smartclip-read
description: Read, summarize, or compare webpages via Chrome without saving.
---

# Read Webpages

- Always use read-only `read_page`; never pass `destination` or call `save_clip` unless explicitly asked to save.
- For background/multiple tabs: `list_tabs()` -> `read_page({ tabId })`, and cite title + URL in synthesis.
- If `truncated` is true and deeper content is needed, retry `read_page` with a larger `maxLength`.
- On hub/extension connection errors, switch to `smartclip-troubleshooting`.
