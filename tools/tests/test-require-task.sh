#!/usr/bin/env bash
# Pipe-test for .claude/hooks/require-task.py (spec 2026-10-25-harness-adoption §8.4).
# Fixtures live in temp dirs (CLAUDE_PROJECT_DIR=$FIX); the hook's RUNLOG is the fixture's
# docs/agentic/RUNLOG.md, never the real one. Real tasks/ is never touched.
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$REPO/.claude/hooks/require-task.py"
exec python3 - "$HOOK" "$REPO/tools/task.py" <<'PY'
import json, os, shutil, subprocess, sys, tempfile

hook, task_py = sys.argv[1], sys.argv[2]
KEYS = ["id", "title", "goal", "source", "priority", "status", "trace", "sprint",
        "deps", "build_spec", "started", "completed", "agents"]
SPEC = "docs/agentic/build-specs/spec.md"
passed = failed = 0

def mkfix():
    fix = os.path.realpath(tempfile.mkdtemp())
    os.makedirs(os.path.join(fix, "docs/agentic/build-specs"))
    open(os.path.join(fix, SPEC), "w").write("spec\n")
    open(os.path.join(fix, "docs/agentic/RUNLOG.md"), "w").write("start\n")
    return fix

def task(fix, n, status, spec=SPEC):
    os.makedirs(os.path.join(fix, "tasks"), exist_ok=True)
    fm = {"id": n, "title": "T%d" % n, "goal": "g", "source": "s", "priority": 1, "status": status,
          "trace": "", "sprint": "-", "deps": [], "build_spec": spec, "started": "", "completed": "",
          "agents": ""}
    body = "---\n" + "".join("%s: %s\n" % (k, json.dumps(fm[k])) for k in KEYS) + "---\n# #%d T\n\n" % n
    body += "## Description / AC\nd\n\n## Build spec\n- none yet\n\n## Changelog\n- 2026-10-25 [new] created\n\n## Completion notes\n-\n"
    open(os.path.join(fix, "tasks", "%03d-t%d.md" % (n, n)), "w").write(body)

def focus(fix, val):
    os.makedirs(os.path.join(fix, "tasks"), exist_ok=True)
    open(os.path.join(fix, "tasks", ".focus"), "w").write(val)

def fx_A(): return mkfix()
def fx_B():
    f = mkfix(); task(f, 1, "TODO", ""); task(f, 2, "DONE"); return f
def fx_C():
    f = mkfix(); task(f, 3, "IN_PROGRESS", "docs/agentic/build-specs/missing.md"); focus(f, "3\n"); return f
def fx_D():
    f = mkfix(); task(f, 4, "IN_PROGRESS"); focus(f, "4\n")
    open(os.path.join(f, "tasks/999-bad.md"), "w").write("garbage no frontmatter\n"); return f
def fx_E():
    f = mkfix(); task(f, 4, "IN_PROGRESS"); task(f, 5, "IN_PROGRESS"); focus(f, "4\n"); return f
def fx_F():
    f = mkfix(); task(f, 4, "IN_PROGRESS"); return f
def fx_G():
    f = mkfix(); task(f, 2, "DONE"); focus(f, "2\n"); return f
def fx_H(v):
    def mk():
        f = mkfix(); task(f, 4, "IN_PROGRESS"); focus(f, v); return f
    return mk
def fx_I():
    f = mkfix(); task(f, 4, "IN_PROGRESS", ""); focus(f, "4\n"); return f
def fx_J():
    f = mkfix(); task(f, 1, "TODO", ""); task(f, 4, "IN_PROGRESS"); task(f, 5, "IN_PROGRESS"); focus(f, "1\n"); return f
def fx_K():  # focus target file corrupt
    f = mkfix(); task(f, 4, "IN_PROGRESS"); focus(f, "4\n")
    open(os.path.join(f, "tasks/004-t4.md"), "w").write("not frontmatter\n"); return f

def payload(fix, tool, key, val, cwd=None):
    ti = {} if key is None else {key: val}
    return json.dumps({"session_id": "s", "transcript_path": "/tmp/t.jsonl", "cwd": cwd or fix,
                       "hook_event_name": "PreToolUse", "tool_name": tool, "tool_input": ti})

def run(fix, stdin, extra=None):
    env = dict(os.environ, CLAUDE_PROJECT_DIR=fix)
    env.pop("HUB_SKIP_TASK_GATE", None)
    env.update(extra or {})
    r = subprocess.run([sys.executable, hook], input=stdin, capture_output=True, text=True, env=env)
    return r.returncode, r.stdout, r.stderr

def check(name, expect, res):
    global passed, failed
    code, out, err = res
    ok = code == expect
    if expect == 2:
        ok = ok and err.startswith("Blocked by hub harness") and "no focused task" in err
    else:
        ok = ok and out == "" and err == ""
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " (exit=%s out=%r err=%r)" % res))
    passed, failed = (passed + 1, failed) if ok else (passed, failed + 1)

# (name, tool, key, value, cwd-relative-to-fix or None)
BLOCKS = [
    ("edit-apps", "Edit", "file_path", "apps/api/src/x.ts", None),
    ("write-packages", "Write", "file_path", "packages/shared/src/y.ts", None),
    ("multiedit-web", "MultiEdit", "file_path", "apps/web/app/page.tsx", None),
    ("notebook", "NotebookEdit", "notebook_path", "apps/a.ipynb", None),
    ("sed-i", "Bash", "command", "sed -i 's/a/b/' apps/api/src/main.ts", None),
    ("sed-i-empty", "Bash", "command", "sed -i '' 's/a/b/' apps/api/x", None),
    ("redirect", "Bash", "command", "echo x > packages/shared/foo.ts", None),
    ("tee", "Bash", "command", "tee apps/api/x.ts", None),
    ("cp-dest", "Bash", "command", "cp /tmp/a apps/api/src/a.ts", None),
    ("mv", "Bash", "command", "mv apps/a apps/b", None),
    ("rm", "Bash", "command", "rm apps/api/src/a.ts", None),
    ("perl-pi", "Bash", "command", "perl -pi -e 's/a/b/' apps/web/x.ts", None),
    ("pipe-tee-a", "Bash", "command", "cat x | tee -a packages/shared/y.ts", None),
    ("python-open-w", "Bash", "command", "python3 -c \"open('apps/api/x','w').write('1')\"", None),
    ("cwd-relative-redirect", "Bash", "command", "echo x > src/a.ts", "apps/api"),
    ("cd-then-append", "Bash", "command", "cd apps/api && echo x >> src/a.ts", None),
    ("heredoc-redirect", "Bash", "command", "cat > apps/api/x.ts <<'EOF'\ndon't\nEOF", None),
    ("abs-path-redirect", "Bash", "command", "echo x > @FIX@/apps/api/z.ts", None),
    ("py-heredoc-open", "Bash", "command", "python3 - <<'EOF'\nopen('apps/api/x','w').write('a')\nEOF", None),
    ("py-path-write-text", "Bash", "command", "python3 - <<'EOF'\nfrom pathlib import Path\nPath('apps/api/src/x.ts').write_text('a')\nEOF", None),
    ("node-writefilesync", "Bash", "command", "node -e \"require('fs').writeFileSync('packages/shared/foo.ts','a')\"", None),
    ("node-fs-writefilesync-dq", "Bash", "command", "node -e 'fs.writeFileSync(\"apps/web/a.ts\", \"x\")'", None),
    ("py-open-abs", "Bash", "command", "python3 -c \"open('@FIX@/apps/api/x','w').write('a')\"", None),
    ("py-path-abs", "Bash", "command", "python3 -c \"from pathlib import Path; Path('@FIX@/packages/shared/f.ts').write_text('a')\"", None),
    ("node-abs", "Bash", "command", "node -e \"fs.writeFileSync('@FIX@/apps/api/x.ts','a')\"", None),
]
ALLOWS = [
    ("py-heredoc-edit-tasks-prose", "Bash", "command", "python3 - <<'EOF'\np='TASKS.md'\ns=open(p).read()\nopen(p,'w').write(s.replace('x','see apps/api and packages/shared'))\nEOF", None),
    ("py-heredoc-edit-do-md", "Bash", "command", "python3 - <<'EOF'\nopen('.claude/commands/do.md','w').write('touch apps/ or packages/')\nEOF", None),
    ("py-heredoc-progress-prose", "Bash", "command", "python3 - <<'EOF'\nPath('docs/memory/PROGRESS.md').write_text('apps/web done')\nEOF", None),
    ("py-literal-no-write-target", "Bash", "command", "python3 - <<'EOF'\nx='apps/api/x'\nprint(x)\nopen('/tmp/rt.out','w').write(x)\nEOF", None),
    ("node-e-prettierignore", "Bash", "command", "node -e \"fs.writeFileSync('.prettierignore','apps/api/prisma/migrations\\n')\"", None),
    ("py-read-apps-write-docs", "Bash", "command", "python3 -c \"open('docs/a.md','w').write(open('apps/api/x').read())\"", None),
    ("edit-progress", "Edit", "file_path", "docs/memory/PROGRESS.md", None),
    ("edit-claude-md", "Edit", "file_path", "CLAUDE.md", None),
    ("write-hook", "Write", "file_path", ".claude/hooks/x.py", None),
    ("write-task", "Write", "file_path", "tasks/001-x.md", None),
    ("edit-infra", "Edit", "file_path", "infra/docker-compose.yml", None),
    ("write-spec", "Write", "file_path", "docs/agentic/build-specs/x.md", None),
    ("edit-root-package", "Edit", "file_path", "package.json", None),
    ("edit-eslint", "Edit", "file_path", "eslint.config.mjs", None),
    ("edit-epics", "Edit", "file_path", "planning/EPICS.md", None),
    ("edit-artifact-dist", "Edit", "file_path", "apps/api/dist/x.js", None),
    ("pnpm-test", "Bash", "command", "pnpm --filter api test", None),
    ("git-status", "Bash", "command", "git status", None),
    ("cat-apps", "Bash", "command", "cat apps/api/src/main.ts", None),
    ("grep-apps", "Bash", "command", "grep -rn foo apps/", None),
    ("ls-apps", "Bash", "command", "ls apps/ packages/", None),
    ("cp-from-apps", "Bash", "command", "cp apps/api/src/a.ts /tmp/a.ts", None),
    ("echo-tmp", "Bash", "command", "echo hi > /tmp/x", None),
    ("rm-dist", "Bash", "command", "rm -rf apps/api/dist", None),
    ("rm-next", "Bash", "command", "rm -rf apps/web/.next", None),
    ("rm-node-modules", "Bash", "command", "rm -rf apps/api/node_modules", None),
    ("sed-n", "Bash", "command", "sed -n 1,5p apps/api/src/main.ts", None),
    ("shared-build", "Bash", "command", "pnpm --filter @hub/shared build", None),
    ("git-commit-msg", "Bash", "command", 'git commit -m "fix apps/api bug"', None),
    ("echo-docs", "Bash", "command", "echo x > docs/a.md", None),
    ("devnull-in-apps-cwd", "Bash", "command", "pnpm test 2>&1 | tail -5 > /dev/null", "apps/api"),
    ("out-in-docs-cwd", "Bash", "command", "echo hi > out.txt", "docs"),
    ("node-e", "Bash", "command", 'node -e "console.log(1)"', None),
    ("task-show", "Bash", "command", "python3 tools/task.py show", None),
    ("mkdir-tasks", "Bash", "command", "mkdir -p tasks", None),
    ("quoted-redirect-text", "Bash", "command", 'echo "a > apps/b"', None),
    ("read-apps", "Read", "file_path", "apps/api/src/main.ts", None),
    ("no-path", "Edit", None, None, None),
    ("empty-command", "Bash", "command", "", None),
    ("unterminated-quote", "Bash", "command", "echo 'unterminated", None),
]
FIXTURES = [("A", fx_A), ("B", fx_B), ("C", fx_C), ("D", fx_D), ("E", fx_E), ("F", fx_F), ("G", fx_G),
            ("H-abc", fx_H("abc\n")), ("H-nofile", fx_H("77\n")), ("H-empty", fx_H("")),
            ("I", fx_I), ("J", fx_J), ("K", fx_K)]
BLOCKED_FIX = {"A", "B", "C", "F", "G", "H-abc", "H-nofile", "H-empty", "I", "J", "K"}
OK_FIX = {"D", "E"}

def pl(fix, c):
    n, t, k, v, cwd = c
    if isinstance(v, str):
        v = v.replace("@FIX@", fix)
    return payload(fix, t, k, v, os.path.join(fix, cwd) if cwd else None)

for fname, mk in FIXTURES:
    fix = mk()
    for c in BLOCKS:
        check("%s-%s-%s" % ("block" if fname in BLOCKED_FIX else "focused-ok", fname, c[0]),
              2 if fname in BLOCKED_FIX else 0, run(fix, pl(fix, c)))
    for c in ALLOWS:
        check("allow-%s-%s" % (fname, c[0]), 0, run(fix, pl(fix, c)))
    shutil.rmtree(fix)

# invalid payloads fail open
fix = fx_A()
check("allow-not-json", 0, run(fix, "not json"))
check("allow-empty-stdin", 0, run(fix, ""))
check("allow-json-list", 0, run(fix, "[]"))

# bypass: env var only, logged once (consecutive dupes suppressed), no log when nothing would block
runlog = os.path.join(fix, "docs/agentic/RUNLOG.md")
edit = payload(fix, "Edit", "file_path", "apps/api/src/x.ts")
bp = {"HUB_SKIP_TASK_GATE": "1"}
r1, r2 = run(fix, edit, bp), run(fix, edit, bp)
lines = [l for l in open(runlog).read().splitlines() if "require-task | BYPASS" in l]
ok = r1[0] == 0 and r2[0] == 0 and "BYPASS" in r1[2] and "BYPASS" in r2[2] and len(lines) == 1 \
    and "HUB_SKIP_TASK_GATE=1 Edit" in lines[0] and "|" in lines[0] and lines[0][4] == "-"
print(("PASS " if ok else "FAIL ") + "bypass-allows-and-logs-once" + ("" if ok else " %r %r %r" % (r1, r2, lines)))
passed, failed = (passed + 1, failed) if ok else (passed, failed + 1)
check("bypass-absent-still-blocks", 2, run(fix, edit))
runlog_before = open(runlog).read()
fixd = fx_D()
check("bypass-env-no-block-silent", 0, run(fixd, payload(fixd, "Edit", "file_path", "apps/api/src/x.ts"), bp))
ok = open(os.path.join(fixd, "docs/agentic/RUNLOG.md")).read() == "start\n"
print(("PASS " if ok else "FAIL ") + "bypass-no-log-when-allowed")
passed, failed = (passed + 1, failed) if ok else (passed, failed + 1)
shutil.rmtree(fix); shutil.rmtree(fixd)

# focus-switch sequence with the real task.py
fix = fx_E()
os.makedirs(os.path.join(fix, "tools"))
shutil.copy(task_py, os.path.join(fix, "tools/task.py"))
def cli(*a):
    return subprocess.run([sys.executable, os.path.join(fix, "tools/task.py")] + list(a),
                          capture_output=True, text=True, cwd=fix)
def sweep(step, expect):
    for c in BLOCKS:
        check("switch-%s-%s" % (step, c[0]), expect, run(fix, pl(fix, c)))
sweep("x-focused", 0)
r = cli("start", "5", "--spec", SPEC); ok = r.returncode == 0
print(("PASS " if ok else "FAIL ") + "switch-start-5" + ("" if ok else " " + r.stderr))
passed, failed = (passed + 1, failed) if ok else (passed, failed + 1)
sweep("y-focused", 0)
r = cli("status", "5", "BLOCKED", "t"); ok = r.returncode == 0
print(("PASS " if ok else "FAIL ") + "switch-status-5" + ("" if ok else " " + r.stderr))
passed, failed = (passed + 1, failed) if ok else (passed, failed + 1)
sweep("focus-cleared-x-still-wip", 2)
r = cli("start", "4"); ok = r.returncode == 0
print(("PASS " if ok else "FAIL ") + "switch-start-4" + ("" if ok else " " + r.stderr))
passed, failed = (passed + 1, failed) if ok else (passed, failed + 1)
sweep("x-refocused", 0)
r = cli("done", "4", "--gate-pass", "ok"); ok = r.returncode == 0
print(("PASS " if ok else "FAIL ") + "switch-done-4" + ("" if ok else " " + r.stderr))
passed, failed = (passed + 1, failed) if ok else (passed, failed + 1)
sweep("after-done", 2)
shutil.rmtree(fix)

print("%d passed, %d failed" % (passed, failed))
sys.exit(1 if failed else 0)
PY
