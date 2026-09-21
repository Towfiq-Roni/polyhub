#!/usr/bin/env bash
# PostToolUse nudge: docs/memory is an adopted claude-obsidian vault (see DECISIONS.md).
# Reminds (never auto-applies — vault mutation requires reviewed transaction approval).
set -euo pipefail

INPUT="$(cat)"
FILE_PATH="$(printf '%s' "$INPUT" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))' 2>/dev/null || true)"

case "$FILE_PATH" in
  */docs/memory/PROGRESS.md|*/docs/memory/DECISIONS.md|docs/memory/PROGRESS.md|docs/memory/DECISIONS.md)
    printf '%s' '{"systemMessage":"docs/memory changed — docs/memory is an adopted claude-obsidian vault. Run /claude-obsidian:save if this update is worth preserving as a linked vault note."}'
    ;;
esac
