#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOCTOR_SCRIPT="$SCRIPT_DIR/../bin/doctor.js"

if [ -f "$DOCTOR_SCRIPT" ]; then
  node "$DOCTOR_SCRIPT" --session-context --no-health 2>/dev/null || \
    echo "<hook_context>SmartClip doctor found setup or connection issues. If SmartClip is needed, verify installation and MCP setup.</hook_context>"
else
  echo "<hook_context>SmartClip doctor is unavailable. If SmartClip commands fail, ask the user to verify installation and MCP setup.</hook_context>"
fi
