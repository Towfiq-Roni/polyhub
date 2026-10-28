#!/usr/bin/env bash
# Pipe tests for .claude/hooks/session-start.sh (spec 8.3). Prints "N passed, M failed".
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$REPO/.claude/hooks/session-start.sh"
pass=0; fail=0
ok() { pass=$((pass+1)); }
bad() { fail=$((fail+1)); echo "FAIL: $1"; }
check() { if eval "$2"; then ok; else bad "$1"; fi; }
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t

# 1. real repo
out="$(CLAUDE_PROJECT_DIR="$REPO" bash "$HOOK" 2>&1)"; rc=$?
check "repo exit 0" '[ $rc -eq 0 ]'
check "repo <=15 lines" '[ "$(printf "%s\n" "$out" | wc -l)" -le 15 ]'
ver="$(tr -d '[:space:]' < "$REPO/.claude/VERSION")"
check "repo line1 header" 'printf "%s\n" "$out" | head -1 | grep -Fq "[hub-harness $ver] branch="'
check "repo dirty=" 'printf "%s" "$out" | grep -q "dirty="'
check "repo stashes=" 'printf "%s" "$out" | grep -q "stashes="'
check "repo Focus:" 'printf "%s" "$out" | grep -q "Focus:"'
check "repo Next:" 'printf "%s" "$out" | grep -q "Next:"'
check "repo no Active:" '! printf "%s" "$out" | grep -q "Active:"'
check "repo INDEX ref" 'printf "%s" "$out" | grep -q "tasks/INDEX.md"'
check "repo no traceback" '! printf "%s" "$out" | grep -qi traceback'

# 2. non-git dir
mkdir "$TMP/nogit"
out="$(CLAUDE_PROJECT_DIR="$TMP/nogit" bash "$HOOK" 2>&1)"; rc=$?
check "nogit exit 0" '[ $rc -eq 0 ]'
check "nogit <=3 lines" '[ "$(printf "%s\n" "$out" | wc -l)" -le 3 ]'
check "nogit says no git repo" 'printf "%s" "$out" | grep -q "no git repo"'
check "nogit no traceback" '! printf "%s" "$out" | grep -qi traceback'

# 3. git repo without tools/task.py
mkdir "$TMP/bare" && git -C "$TMP/bare" init -q && git -C "$TMP/bare" commit -q --allow-empty -m "init commit"
out="$(CLAUDE_PROJECT_DIR="$TMP/bare" bash "$HOOK" 2>&1)"; rc=$?
check "notask exit 0" '[ $rc -eq 0 ]'
check "notask no traceback" '! printf "%s" "$out" | grep -qi traceback'
check "notask no upstream" 'printf "%s" "$out" | grep -q "no upstream"'
check "notask version ?" 'printf "%s" "$out" | head -1 | grep -q "hub-harness ?"'
check "notask no Focus" '! printf "%s" "$out" | grep -q "Focus:"'

# 4. clone, 1 ahead / 0 behind, then 0 ahead / 1 behind
git clone -q "$TMP/bare" "$TMP/clone" 2>/dev/null
git -C "$TMP/clone" commit -q --allow-empty -m "local"
out="$(CLAUDE_PROJECT_DIR="$TMP/clone" bash "$HOOK" 2>&1)"
check "1 ahead / 0 behind" 'printf "%s" "$out" | grep -q "1 ahead / 0 behind"'
git -C "$TMP/clone" reset -q --hard HEAD~1
git -C "$TMP/bare" commit -q --allow-empty -m "remote"
git -C "$TMP/clone" fetch -q
out="$(CLAUDE_PROJECT_DIR="$TMP/clone" bash "$HOOK" 2>&1)"
check "0 ahead / 1 behind" 'printf "%s" "$out" | grep -q "0 ahead / 1 behind"'
# dirty + stash counts
echo x > "$TMP/clone/f"; out="$(CLAUDE_PROJECT_DIR="$TMP/clone" bash "$HOOK" 2>&1)"
check "dirty=1" 'printf "%s" "$out" | grep -q "dirty=1"'

echo "$pass passed, $fail failed"
[ $fail -eq 0 ]
