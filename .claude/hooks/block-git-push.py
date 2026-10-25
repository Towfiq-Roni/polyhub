#!/usr/bin/env python3
"""PreToolUse(Bash): block `git push` unless the same command segment carries HUB_PUSH_CONFIRMED=1.

Exit codes: 0 allow, 2 block (message on stderr, fed back to the model). Invalid/empty
JSON on stdin or a non-Bash tool = exit 0. Marker: `HUB_PUSH_CONFIRMED=1 git push ...` or
`env HUB_PUSH_CONFIRMED=1 git push ...`, read from the command text only (never process env).
ponytail: $(...)/backticks, aliases, xargs, gh pushes not caught -> mistake-guard, not security
-> upgrade path: wrap git via a pre-push hook.
"""
import json
import re
import shlex
import sys

MARK = "HUB_PUSH_CONFIRMED=1"
SEP = {";", "&&", "||", "|", "&", "|&", "(", ")", "\n"}
SKIP = {"sudo", "time", "command", "env", "nohup", "exec", "builtin", "!", "{", "}",
        "then", "do", "else", "elif", "if", "while", "until"}
OPT_VAL = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"}
SHELLS = {"bash", "sh", "zsh", "dash"}
HEREDOC = re.compile(r"(?<!<)<<-?\s*(['\"]?)([A-Za-z_]\w*)\1")
MSG = ("Blocked by hub harness: git push needs the user's explicit go-ahead (CLAUDE.md Guardrails). "
       'After the user says "push", re-run as: HUB_PUSH_CONFIRMED=1 git push ... and log it in '
       "docs/agentic/RUNLOG.md. Local commits stay allowed.")


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


def pushes(cmd, depth=0):
    """True if an unconfirmed `git push` is present."""
    try:
        words = tokens(strip_heredocs(cmd))
    except ValueError:  # malformed shell cannot run
        return False
    for seg in segments(words):
        confirmed = False
        while seg and (re.match(r"^[A-Za-z_]\w*=", seg[0]) or seg[0] in SKIP):
            confirmed = confirmed or seg[0] == MARK
            seg = seg[1:]
        if not seg:
            continue
        head = seg[0].rsplit("/", 1)[-1]
        if (head in SHELLS or head == "eval") and depth < 3:
            body = None
            if head == "eval":
                body = " ".join(seg[1:])
            elif "-c" in seg[:-1]:
                body = seg[seg.index("-c") + 1]
            if body and pushes(body, depth + 1) and not confirmed:
                return True
            continue
        if head != "git":
            continue
        i = 1
        while i < len(seg) and seg[i].startswith("-"):
            i += 2 if seg[i] in OPT_VAL else 1
        if i < len(seg) and seg[i] == "push" and not confirmed:
            return True
    return False


def main():
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0
    if not isinstance(payload, dict) or payload.get("tool_name") != "Bash":
        return 0
    ti = payload.get("tool_input")
    cmd = ti.get("command") if isinstance(ti, dict) else None
    if isinstance(cmd, str) and pushes(cmd):
        print(MSG, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
