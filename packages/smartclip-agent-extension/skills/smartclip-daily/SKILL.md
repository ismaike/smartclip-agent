---
name: smartclip-daily
description: View, triage, or clip SmartClip daily task pool items.
---

# SmartClip Daily Tasks

- Start with `get_daily_tasks({ status: 'pending' })` and list `title`, `url`, and `taskId`.
- Clip one item: `clip_daily_task({ taskId })`.
- Batch clip: ask the user to confirm (and target `destination` if overriding) before calling `clip_all_daily_tasks()`, as daily task tools persist notes and mutate task state.
