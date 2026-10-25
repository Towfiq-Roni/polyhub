#!/usr/bin/env bash
# Pipe-test for .claude/hooks/protect-paths.py (spec 2026-10-25-harness-adoption §8.2).
# Real PreToolUse payload shape; fixture tree supplies "existing" migration files.
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$REPO/.claude/hooks/protect-paths.py"
exec python3 - "$HOOK" <<'PY'
import json, os, subprocess, sys, tempfile

hook = sys.argv[1]
fix = os.path.realpath(tempfile.mkdtemp())
mig = os.path.join(fix, "apps/api/prisma/migrations")
os.makedirs(os.path.join(mig, "20260913091033_init_auth"))
for p in ("20260913091033_init_auth/migration.sql", "migration_lock.toml"):
    open(os.path.join(mig, p), "w").write("x")
tmpout = os.path.realpath(tempfile.mkdtemp())
passed = failed = 0

def run(stdin, cwd=None):
    env = dict(os.environ, CLAUDE_PROJECT_DIR=fix)
    r = subprocess.run([sys.executable, hook], input=stdin, capture_output=True, text=True, env=env)
    return r.returncode, r.stdout, r.stderr

def payload(tool, key, path, cwd=None):
    ti = {} if key is None else {key: path}
    return json.dumps({"session_id": "s", "transcript_path": "/tmp/t.jsonl", "cwd": cwd or fix,
                       "hook_event_name": "PreToolUse", "tool_name": tool, "tool_input": ti})

def case(name, expect, stdin):
    global passed, failed
    code, out, err = run(stdin)
    ok = code == expect
    if expect == 2:
        ok = ok and err.startswith("Blocked by hub harness")
    else:
        ok = ok and out == "" and err == ""
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f" (exit={code} out={out!r} err={err!r})"))
    passed, failed = (passed + 1, failed) if ok else (passed, failed + 1)

def f(p): return os.path.join(fix, p)
blocks = [
    ("env-root", "Write", "file_path", f(".env")),
    ("env-infra-dev", "Write", "file_path", f("infra/.env.dev")),
    ("env-api", "Edit", "file_path", f("apps/api/.env")),
    ("env-infra-prod", "Write", "file_path", f("infra/.env.prod")),
    ("env-local", "Write", "file_path", f(".env.local")),
    ("env-web-production", "Write", "file_path", f("apps/web/.env.production")),
    ("git-config", "Edit", "file_path", f(".git/config")),
    ("git-hook", "Write", "file_path", f(".git/hooks/pre-commit")),
    ("migration-existing-sql", "Edit", "file_path", f("apps/api/prisma/migrations/20260913091033_init_auth/migration.sql")),
    ("migration-lock-existing", "Edit", "file_path", f("apps/api/prisma/migrations/migration_lock.toml")),
    ("notebook-env", "NotebookEdit", "notebook_path", f(".env")),
    ("multiedit-env", "MultiEdit", "file_path", f(".env")),
    ("tasks-md-root", "Write", "file_path", f("TASKS.md")),
]
for n, t, k, p in blocks: case("block-" + n, 2, payload(t, k, p))
case("block-relative-env", 2, payload("Write", "file_path", ".env"))
# symlink into .git must still block (realpath)
os.makedirs(f(".git"), exist_ok=True)
os.symlink(f(".git"), f("gitlink"))
case("block-symlink-to-git", 2, payload("Write", "file_path", f("gitlink/config")))

allows = [
    ("env-dev-example", "infra/.env.dev.example"), ("env-prod-example", "infra/.env.prod.example"),
    ("env-example", ".env.example"), ("envrc", ".envrc"), ("gitignore", ".gitignore"),
    ("github-ci", ".github/workflows/ci.yml"), ("gitattributes", ".gitattributes"),
    ("husky", ".husky/pre-commit"),
    ("migration-new", "apps/api/prisma/migrations/20991231000000_new_thing/migration.sql"),
    ("schema", "apps/api/prisma/schema.prisma"), ("progress", "docs/memory/PROGRESS.md"),
    ("tasks-index", "tasks/INDEX.md"), ("shared-src", "packages/shared/src/x.ts"),
    ("docs-envs", "docs/envs.md"), ("environment-md", "environment.md"),
    ("archive-tasks", "docs/agentic/archive/TASKS-2026-10-25.md"), ("nested-tasks-md", "docs/TASKS.md"),
]
for n, p in allows: case("allow-" + n, 0, payload("Write", "file_path", f(p)))
case("allow-foo.git", 0, payload("Write", "file_path", os.path.join(tmpout, "foo.git/bar")))
case("allow-no-file-path", 0, payload("Write", None, None))
case("allow-not-json", 0, "not json")
case("allow-empty-json", 0, "{}")
case("allow-read-tool-env", 0, payload("Read", "file_path", f(".env")))
print(f"{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
PY
