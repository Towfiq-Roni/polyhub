#!/usr/bin/env python3
"""PreToolUse(Edit|Write|MultiEdit|NotebookEdit): block edits to protected paths.

Exit 0 = allow, 2 = block (reason on stderr). Invalid/empty JSON = exit 0 (fail-open).
Rules (paths realpath'd; relative paths resolve against payload cwd):
  R1 .env files: basename `.env` or `.env.*` not ending `.example` (`.envrc` passes).
  R2 any path segment exactly `.git` (`.gitignore`, `.github`, `foo.git/` pass).
  R3 EXISTING file under `prisma/migrations/` (new migration paths pass; forward-only).
  R4 `<root>/TASKS.md` (retired monolith; use tools/task.py).
ponytail: Bash writes (`echo > .env`, `sed -i`, `git checkout`) are NOT covered -> mistake-guard
only; upgrade path = parse Bash targets like require-task does.
"""
import json
import os
import sys

TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}


def reason_for(path, root):
    real = os.path.realpath(path)
    parts = real.split(os.sep)
    name = os.path.basename(real)
    if (name == ".env" or name.startswith(".env.")) and not name.endswith(".example"):
        return "env files hold secrets (use *.example templates)"
    if ".git" in parts:
        return ".git internals are protected"
    if any(parts[i] == "prisma" and parts[i + 1] == "migrations" for i in range(len(parts) - 1)) and os.path.isfile(real):
        return "existing migrations are immutable (forward-only; add a new migration)"
    if real == os.path.join(os.path.realpath(root), "TASKS.md"):
        return "monolith retired; use `python3 tools/task.py new|log|start|done`"
    return None


def main():
    try:
        payload = json.load(sys.stdin)
        if payload.get("tool_name") not in TOOLS:
            return 0
        ti = payload.get("tool_input") or {}
        path = ti.get("file_path") or ti.get("notebook_path")
        if not path:
            return 0
        cwd = payload.get("cwd") or os.getcwd()
        root = os.environ.get("CLAUDE_PROJECT_DIR") or cwd
        path = os.path.join(cwd, path)  # absolute path wins in join
    except (ValueError, AttributeError, TypeError):
        return 0
    why = reason_for(path, root)
    if why:
        print(f"Blocked by hub harness: {path}: {why}. Ask the user if this is really needed.", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
