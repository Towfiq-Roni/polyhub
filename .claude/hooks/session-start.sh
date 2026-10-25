#!/usr/bin/env bash
# SessionStart briefing (stdout becomes model context). Always exits 0.
set -u
ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$ROOT" 2>/dev/null || exit 0

VER="$(head -1 .claude/VERSION 2>/dev/null | tr -d '[:space:]')"
VER="${VER:-?}"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "[hub-harness $VER] no git repo at $ROOT"
  exit 0
fi

BRANCH="$(git symbolic-ref --short -q HEAD 2>/dev/null)"
BRANCH="${BRANCH:-detached}"
HEAD_LINE="$(git log -1 --format='%h %s' 2>/dev/null | cut -c1-68)"
DIRTY="$(git status --short 2>/dev/null | wc -l | tr -d ' ')"
STASHES="$(git stash list 2>/dev/null | wc -l | tr -d ' ')"
if COUNTS="$(git rev-list --left-right --count '@{u}...HEAD' 2>/dev/null)"; then
  BEHIND="${COUNTS%%[[:space:]]*}"
  AHEAD="${COUNTS##*[[:space:]]}"
  UP="$AHEAD ahead / $BEHIND behind $(git rev-parse --abbrev-ref '@{u}' 2>/dev/null)"
else
  UP="no upstream"
fi

echo "[hub-harness $VER] branch=$BRANCH | HEAD=${HEAD_LINE:-none}"
echo "dirty=$DIRTY | stashes=$STASHES | $UP"
if [ -f tools/task.py ]; then
  python3 tools/task.py brief 2>/dev/null | head -4
fi
echo "Rules: push needs user say-so (HUB_PUSH_CONFIRMED=1) · read tasks/INDEX.md + ONE task file · <=3 files/delegation · money=integer poisha · ledger immutable"
echo "First: read docs/memory/PROGRESS.md; skim docs/memory/pitfalls/INDEX.md"
exit 0
