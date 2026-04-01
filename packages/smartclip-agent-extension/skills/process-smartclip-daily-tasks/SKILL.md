---
name: process-smartclip-daily-tasks
description: Use when the user asks to view, review, process, or batch-clip their SmartClip daily task pool.
---

# Process SmartClip Daily Tasks

Use this skill for the synced daily task queue.

## Rules
- Start with `get_daily_tasks`.
- Before `clip_all_daily_tasks`, show pending tasks and confirm with the user.
- Daily task tools save content automatically.

## Common flows
1. Inspect pending tasks: `get_daily_tasks({ status: 'pending' })`
2. Clip one task: `clip_daily_task({ taskId })`
3. Clip all pending tasks: `clip_all_daily_tasks()`

## Important distinction
Unlike read-only `clip_page`, daily task tools are operational workflows that persist content and update task state.
