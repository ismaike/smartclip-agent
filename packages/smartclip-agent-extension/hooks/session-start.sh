#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOCTOR_SCRIPT="$SCRIPT_DIR/../bin/doctor.js"

if [ -f "$DOCTOR_SCRIPT" ]; then
  DOCTOR_JSON=$(node "$DOCTOR_SCRIPT" --json --no-health 2>/dev/null)
  if echo "$DOCTOR_JSON" | grep -q '"ok": true'; then
    echo "<hook_context>SmartClip doctor reports the local MCP setup looks healthy. You can use SmartClip tools when needed.</hook_context>"
  else
    echo "<hook_context>SmartClip doctor found setup or connection issues. If SmartClip is needed, verify .mcp.json, ensure the browser extension is installed, and confirm MCP service is enabled in SmartClip settings.</hook_context>"
  fi
else
  echo "<hook_context>SmartClip doctor is unavailable. If SmartClip commands fail, ask the user to verify installation and MCP setup.</hook_context>"
fi
