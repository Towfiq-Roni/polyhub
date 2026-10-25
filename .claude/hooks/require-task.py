#!/usr/bin/env python3
"""PreToolUse(Edit|Write|MultiEdit|NotebookEdit|Bash): product code needs the ONE focused task.

Exit codes: 0 allow, 2 block (message on stderr, fed back to the model). Invalid/empty JSON
on stdin, a non-object payload, or any other tool = exit 0 (fail-open only there). An
unexpected hook bug exits 1 (non-blocking by Claude Code semantics).

Gate scope: paths under <root>/apps/ or <root>/packages/ (not node_modules|dist|.next|
coverage|test-results segments) plus Bash commands that write there (heuristic below).
docs/, .claude/, tasks/, infra/, planning/, root configs are always allowed.

Focus predicate (D5): `tasks/.focus` parses as int N AND tasks/N(3 digits)-*.md exists AND its
frontmatter status is IN_PROGRESS AND build_spec is non-empty AND that file exists under the
root. Any failure (missing/garbage/empty .focus, DONE/TODO/BLOCKED target, corrupt target file,
missing spec) = no focus = block. Only that ONE task file is read; other IN_PROGRESS tasks
are parked and inert.

Escape hatch: env HUB_SKIP_TASK_GATE=1 in the hook's own process env (only the human can set
it, e.g. `HUB_SKIP_TASK_GATE=1 claude`). When it bypasses a would-be block it prints
`BYPASS HUB_SKIP_TASK_GATE=1` to stderr and appends one line to docs/agentic/RUNLOG.md
(consecutive duplicates suppressed).

ponytail: Bash-write heuristic is conservative (false positives are the enemy, DEC-059).
Not covered: git checkout/apply/restore, pnpm/prisma generators, dd, curl -o, editors,
$(...)/backtick bodies -> mistake-guard, not a security boundary -> upgrade path: a
filesystem-level guard or git pre-commit check.
python/node rule only sees QUOTED-LITERAL write targets (open/Path.write_text/fs.writeFile*);
computed/dynamic targets (variables, f-strings, joins) are not detected (D8).
"""
import datetime
import glob
import json
import os
import re
import shlex
import sys

PROD = ("apps", "packages")
ARTIFACT = {"node_modules", "dist", ".next", "coverage", "test-results"}
SEP = {";", "&&", "||", "|", "&", "|&", "(", ")", "\n"}
PATHWRITERS = {"tee", "truncate", "patch", "rm", "mv", "touch", "mkdir", "rmdir", "install", "ln"}
HEREDOC = re.compile(r"(?<!<)<<-?\s*(['\"]?)([A-Za-z_]\w*)\1")
# Quoted-literal TARGET of a write call: open('p','w'|'a'|'x'), Path('p').write_text/bytes, fs.write/appendFile[Sync]('p').
PYTARGET = re.compile(
    r"""\bopen\(\s*[rbuf]*['"]([^'"]+)['"]\s*,\s*['"][wax]"""
    r"""|\bPath\(\s*['"]([^'"]+)['"]\s*\)\s*\.write_(?:text|bytes)\b"""
    r"""|\b(?:write|append)File(?:Sync)?\(\s*['"`]([^'"`]+)['"`]""")
MSG = ("Blocked by hub harness: no focused task. Product code (apps/, packages/) changes only inside "
       "the ONE focused task (tasks/.focus), which must be IN_PROGRESS with a build spec. "
       "Orchestrator: python3 tools/task.py start <id> --spec docs/agentic/build-specs/<file>.md "
       "(spec comes from hub-planner; this focuses the task). "
       "Human-only escape: HUB_SKIP_TASK_GATE=1 (logged to RUNLOG).")


def focused_task(root):
    """True iff tasks/.focus names an IN_PROGRESS task with an existing build spec."""
    try:
        n = int(open(os.path.join(root, "tasks", ".focus")).read().strip())
        files = glob.glob(os.path.join(root, "tasks", "%03d-*.md" % n))
        if len(files) != 1:
            return False
        fm = {}
        lines = open(files[0]).read().split("\n")
        if lines[0] != "---":
            return False
        for line in lines[1:]:
            if line == "---":
                break
            k, v = line.split(": ", 1)
            fm[k] = json.loads(v)
        spec = fm.get("build_spec")
        return (fm.get("status") == "IN_PROGRESS" and isinstance(spec, str) and spec != ""
                and os.path.isfile(os.path.join(root, spec)))
    except Exception:  # missing/garbage/corrupt anything = no focus
        return False


def in_product(path, root):
    rel = os.path.relpath(os.path.realpath(path), root).split(os.sep)
    return rel[0] in PROD and len(rel) > 1 and not (set(rel) & ARTIFACT)


def strip_heredocs(cmd):
    """Drop heredoc bodies (apostrophes in them break shlex); keep the delimiter line."""
    out, delim = [], None
    for line in cmd.split("\n"):
        if delim:
            if line.strip() == delim:
                delim = None
                out.append(line)
            continue
        out.append(line)
        m = HEREDOC.search(line)
        if m:
            delim = m.group(2)
    return "\n".join(out)


def tokens(cmd):
    lex = shlex.shlex(cmd, posix=True, punctuation_chars=";&|()<>\n")
    lex.whitespace_split = True
    lex.whitespace = " \t\r"
    return list(lex)


def segments(words):
    seg = []
    for w in words:
        if w in SEP:
            if seg:
                yield seg
            seg = []
        else:
            seg.append(w)
    if seg:
        yield seg


def bash_writes_product(cmd, cwd, root):
    """Conservative heuristic: True only for clear writes under apps/ or packages/."""
    def prod(arg, at):
        if arg.startswith("-"):
            return False
        rel = os.path.relpath(os.path.normpath(os.path.join(at, os.path.expanduser(arg))), root)
        parts = rel.split(os.sep)
        return parts[0] in PROD and len(parts) > 1 and not (set(parts) & ARTIFACT)

    try:
        words = tokens(strip_heredocs(cmd))
    except ValueError:  # malformed shell cannot run
        return False
    for seg in segments(words):
        i = 0
        while i < len(seg) and re.match(r"^[A-Za-z_]\w*=", seg[i]):
            i += 1
        w = seg[i:]
        if not w:
            continue
        if w[0] == "cd" and len(w) > 1:
            cwd = os.path.normpath(os.path.join(cwd, os.path.expanduser(w[1])))
            continue
        for k, t in enumerate(w):
            if t in (">", ">>", ">|") and k + 1 < len(w) and prod(w[k + 1], cwd):
                return True
        head = os.path.basename(w[0])
        args = [a for a in w[1:] if a not in ("<", ">", ">>", ">|")]
        if head in ("sed", "perl") and any(re.match(r"^-[A-Za-z]*i|^--in-place", a) for a in args) \
                and any(prod(a, cwd) for a in args):
            return True
        if head in PATHWRITERS and any(prod(a, cwd) for a in args):
            return True
        if head == "cp" and args and prod(args[-1], cwd):
            return True
        if head in ("python", "python3", "node") \
                and any(prod(m.group(1) or m.group(2) or m.group(3), cwd) for m in PYTARGET.finditer(cmd)):
            return True
    return False


def bypass(tool, what, root):
    """Announce + log a HUB_SKIP_TASK_GATE bypass (dedupe consecutive RUNLOG lines)."""
    print("BYPASS HUB_SKIP_TASK_GATE=1", file=sys.stderr)
    log = os.path.join(root, "docs", "agentic", "RUNLOG.md")
    try:
        last = ""
        if os.path.isfile(log):
            last = (open(log).read().rstrip("\n").split("\n") or [""])[-1]
        if "require-task | BYPASS" in last:
            return
        ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        what = re.sub(r"\s+", " ", what)[:80]
        with open(log, "a") as f:
            f.write("%s | require-task | BYPASS HUB_SKIP_TASK_GATE=1 %s %s\n" % (ts, tool, what))
    except OSError:
        pass


def main():
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0
    if not isinstance(payload, dict):
        return 0
    tool = payload.get("tool_name")
    ti = payload.get("tool_input")
    if not isinstance(ti, dict):
        return 0
    root = os.path.realpath(os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd") or os.getcwd())
    cwd = os.path.realpath(payload.get("cwd") or root)
    if tool in ("Edit", "Write", "MultiEdit", "NotebookEdit"):
        path = ti.get("file_path") or ti.get("notebook_path")
        if not isinstance(path, str) or not path:
            return 0
        what = path
        touches = in_product(os.path.join(cwd, path), root)
    elif tool == "Bash":
        cmd = ti.get("command")
        if not isinstance(cmd, str) or not cmd:
            return 0
        what = cmd
        touches = bash_writes_product(cmd, cwd, root)
    else:
        return 0
    if not touches or focused_task(root):
        return 0
    if os.environ.get("HUB_SKIP_TASK_GATE") == "1":
        bypass(tool, what, root)
        return 0
    print(MSG, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
