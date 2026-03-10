#!/bin/bash

# Check if the SmartClip MCP Server port is listening
if lsof -i :18365 > /dev/null 2>&1; then
    echo "<hook_context>SmartClip MCP Server is currently ONLINE and listening on port 18365. The user's Chrome browser is connected.</hook_context>"
else
    echo "<hook_context>SmartClip MCP Server is currently OFFLINE or the Chrome extension is not connected. If the user asks you to clip or read a webpage, you MUST remind them to open their Chrome browser, ensure the SmartClip extension is active, and verify that the 'Enable MCP Service' toggle is ON in settings.</hook_context>"
fi
