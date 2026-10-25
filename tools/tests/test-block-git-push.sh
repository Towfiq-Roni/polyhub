#!/usr/bin/env bash
# Pipe-test for .claude/hooks/block-git-push.py (spec §8.1). Real PreToolUse payload shape.
# Prints PASS|FAIL <name>, then "N passed, M failed"; exit 1 if any failed.
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$ROOT/.claude/hooks/block-git-push.py"
export ROOT HOOK
python3 - <<'PY'
import json, os, subprocess, sys

hook, root = os.environ["HOOK"], os.environ["ROOT"]

def payload(tool, command=None, file_path=None):
    ti = {}
    if command is not None:
        ti["command"] = command
    if file_path is not None:
        ti["file_path"] = file_path
    return json.dumps({"session_id": "s", "transcript_path": "/tmp/t.jsonl", "cwd": root,
                       "hook_event_name": "PreToolUse", "tool_name": tool, "tool_input": ti})

BLOCK = [
    "git push", "git push origin main", "git -C /tmp/x push", "git -c user.name=a push --force",
    "git --git-dir=.git push", "cd apps && git push", "git add -A && git commit -m x && git push",
    "git status; git push", "echo ok | git push", "(git push)", "bash -c 'git push origin main'",
    "sudo git push", "env FOO=1 git push", "/usr/bin/git push", "HUB_PUSH_CONFIRMED=0 git push",
    "git commit -m ok\ngit push", "if true; then git push; fi",
    "HUB_PUSH_CONFIRMED=1 git status && git push", 'eval "git push"', "git push --dry-run", "x=1 git push",
]
ALLOW = [
    "HUB_PUSH_CONFIRMED=1 git push origin main", "env HUB_PUSH_CONFIRMED=1 git push",
    "HUB_PUSH_CONFIRMED=1 git -C x push", 'git commit -m "document git push policy"',
    'git commit -m "a; git push"',
    'git commit -m "$(cat <<\'EOF\'\nfix: never git push\nwon\'t\nEOF\n)"',
    'echo "git push"', 'grep -rn "git push" CLAUDE.md', "git status", "git log --oneline -5",
    "git pull --rebase", "git stash", "git remote -v", "git diff HEAD~1", "pnpm --filter api test",
    "cat <<'EOF' > f\ndon't git push\nEOF", "git branch --set-upstream-to=origin/main", "gh pr view",
    "git config alias.p push", "git commit --amend -m push", "git log --grep='git push'", "",
    "echo 'unterminated",
]

passed = failed = 0
def run(name, expect, stdin):
    global passed, failed
    p = subprocess.run(["python3", hook], input=stdin, capture_output=True, text=True)
    ok = p.returncode == expect
    if expect == 2:
        ok = ok and p.stderr.startswith("Blocked by hub harness")
    else:
        ok = ok and p.stdout == "" and p.stderr == ""
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " (exit %d, stderr=%r)" % (p.returncode, p.stderr[:80])))
    passed += ok
    failed += not ok

for c in BLOCK:
    run("block: " + repr(c), 2, payload("Bash", c))
for c in ALLOW:
    run("allow: " + repr(c), 0, payload("Bash", c))
run("allow: tool Edit with file_path", 0, payload("Edit", file_path="/x/git push.txt"))
run("allow: tool Read", 0, payload("Read", file_path="/x"))
run("allow: stdin not json", 0, "not json")
run("allow: stdin {}", 0, "{}")
run("allow: stdin empty", 0, "")
print("%d passed, %d failed" % (passed, failed))
sys.exit(1 if failed else 0)
PY
