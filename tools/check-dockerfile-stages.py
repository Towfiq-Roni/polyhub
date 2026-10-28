#!/usr/bin/env python3
"""Static stage-layout check for apps/api/Dockerfile (guards the #2->#48 regression).

Usage: check-dockerfile-stages.py [path]   (default apps/api/Dockerfile, relative to repo root)
Prints `PASS|FAIL <check>` per check. Exit 0 ok, 1 a check failed, 2 usage/file missing.
Depends on line shapes (`AS runtime`, `AS build`, `prisma generate`, `run build`, `dist/main.js`):
a legit Dockerfile refactor MUST update this script in the same change. Stdlib only.
ponytail: fails closed, false FAIL if `prisma generate` and `run build` share one RUN line, `prisma \\`/newline/`generate` is split, or ENTRYPOINT replaces CMD -> join backslash continuations and compare positions within a line, only if the Dockerfile layout changes.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))


def stages(lines):
    """-> [(name, [lines])], comment/blank lines dropped, one entry per FROM."""
    out = []
    for raw in lines:
        s = raw.strip()
        if not s or s.startswith("#"):
            continue
        m = re.match(r"(?i)FROM\s.*?\bAS\s+(\S+)\s*$", s)
        if re.match(r"(?i)FROM\s", s):
            out.append((m.group(1).lower() if m else "", [s]))
        elif out:
            out[-1][1].append(s)
    return out


def main(argv):
    if len(argv) > 2:
        print("usage: check-dockerfile-stages.py [path]", file=sys.stderr)
        return 2
    path = argv[1] if len(argv) == 2 else os.path.join(ROOT, "apps/api/Dockerfile")
    try:
        with open(path) as f:
            st = stages(f.read().splitlines())
    except OSError as e:
        print(f"cannot read {path}: {e}", file=sys.stderr)
        return 2
    runtime = next((b for n, b in st if n == "runtime"), [])
    build = next((b for n, b in st if n == "build"), [])
    gen = next((i for i, l in enumerate(build) if "prisma generate" in l), None)
    bld = next((i for i, l in enumerate(build) if re.search(r"run build", l)), None)
    results = {
        "last-stage-is-runtime": bool(st) and st[-1][0] == "runtime",
        "generate-before-build": gen is not None and bld is not None and gen < bld,
        "runtime-runs-dist": any(l.upper().startswith("CMD") and "dist/main.js" in l for l in runtime),
    }
    for name, ok in results.items():
        print(("PASS " if ok else "FAIL ") + name)
    return 0 if all(results.values()) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
