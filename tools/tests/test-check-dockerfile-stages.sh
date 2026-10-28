#!/usr/bin/env bash
# Tests for tools/check-dockerfile-stages.py. Fixtures are mutated COPIES of the real apps/api/Dockerfile.
# Prints PASS|FAIL <name>; exit 1 on any FAIL.
set -u
R=$(cd "$(dirname "$0")/../.." && pwd)
S="$R/tools/check-dockerfile-stages.py"
REAL="$R/apps/api/Dockerfile"
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
NP=0; NF=0
pass() { echo "PASS $1"; NP=$((NP + 1)); }
fail() { echo "FAIL $1 :: $2"; NF=$((NF + 1)); }

# mut <name> <python-body operating on list `L` of lines> -> $T/<name>
mut() {
  python3 - "$REAL" "$T/$1" "$2" <<'PY'
import sys
src, dst, body = sys.argv[1:4]
L = open(src).read().split("\n")
exec(body)
open(dst, "w").write("\n".join(L))
PY
}
# expect <name> <file> <rc> [substring]
expect() {
  OUT=$(python3 "$S" "$2" 2>&1); RC=$?
  [ "$RC" = "$3" ] || { fail "$1" "rc=$RC want $3 out=$OUT"; return; }
  if [ -n "${4:-}" ]; then
    case "$OUT" in *"$4"*) ;; *) fail "$1" "missing [$4] in [$OUT]"; return ;; esac
  fi
  pass "$1"
}

# T1 real file
expect real-ok "$REAL" 0 "PASS runtime-runs-dist"
[ "$(python3 "$S" "$REAL" | grep -c '^PASS ')" = 3 ] && pass real-three-pass || fail real-three-pass "not 3 PASS lines"

# T2 mutation A: extra stage appended
mut a 'L += ["FROM base AS extra", "CMD [\"true\"]"]'
expect mutA-appended-stage "$T/a" 1 "FAIL last-stage-is-runtime"

# T3 mutation B: swap generate/build RUN lines
mut b 'g=next(i for i,l in enumerate(L) if "prisma generate" in l and l.startswith("RUN")); b=next(i for i,l in enumerate(L) if l.startswith("RUN") and "run build" in l); L[g],L[b]=L[b],L[g]'
expect mutB-swap "$T/b" 1 "FAIL generate-before-build"

# T4 generate line deleted
mut c 'g=next(i for i,l in enumerate(L) if l.startswith("RUN") and "prisma generate" in l); del L[g]'
expect no-generate "$T/c" 1 "FAIL generate-before-build"

# T5 comment-only generate
mut d 'g=next(i for i,l in enumerate(L) if l.startswith("RUN") and "prisma generate" in l); L[g]="# prisma generate"'
expect comment-only-generate "$T/d" 1 "FAIL generate-before-build"

# T6 dev stage last (original #48 defect shape)
mut e '
d=next(i for i,l in enumerate(L) if l.startswith("FROM") and "AS dev" in l)
r=next(i for i,l in enumerate(L) if l.startswith("FROM") and "AS runtime" in l)
dev=L[d:r]; L[d:r]=[]; L += [""] + dev'
expect dev-last "$T/e" 1 "FAIL last-stage-is-runtime"

# T7 bad runtime CMD
mut f 'c=max(i for i,l in enumerate(L) if l.startswith("CMD")); L[c]="CMD [\"node\", \"server.js\"]"'
expect bad-cmd "$T/f" 1 "FAIL runtime-runs-dist"

# T8 missing file
expect missing-file "$T/nope" 2

# T9 `pnpm build` instead of `run build` => intended fail-closed (checker only recognises `run build`)
mut g 'b=next(i for i,l in enumerate(L) if l.startswith("RUN") and "run build" in l); L[b]="RUN pnpm build"'
expect pnpm-build-fail-closed "$T/g" 1 "FAIL generate-before-build"

# T10 trigger-sanity: patterns are EXTRACTED from hub-tester.md (single source), never duplicated here
TESTER="$R/.claude/agents/hub-tester.md"
trig() {
  python3 - "$1" <<'PY'
import re, sys
lines = open(sys.argv[1]).read().split("\n")
i = next(k for k, l in enumerate(lines) if "IMAGE-BUILD, mechanical trigger" in l)
j = next((k for k in range(i + 1, len(lines)) if lines[k].startswith("- ")), len(lines))
pats = [t for t in re.findall(r"`([^`]+)`", "\n".join(lines[i:j])) if t.startswith("^")]
if not pats:
    print("no patterns extracted"); sys.exit(1)
rx = [re.compile(p) for p in pats]
hit = lambda f: any(r.search(f) for r in rx)
yes = "packages/shared/src/index.ts apps/api/tsconfig.json apps/api/tsconfig.build.json tsconfig.base.json apps/api/prisma/schema.prisma apps/api/prisma/migrations/x/migration.sql apps/api/prisma/seed.ts apps/api/Dockerfile pnpm-lock.yaml".split()
no = "apps/web/src/x.tsx .claude/VERSION apps/api/prisma/seed.e2e-spec.ts infra/docker-compose.dev.yml tools/check-dockerfile-stages.py".split()
bad = [f"miss:{f}" for f in yes if not hit(f)] + [f"false-hit:{f}" for f in no if hit(f)]
print(" ".join(bad)); sys.exit(1 if bad else 0)
PY
}
OUT=$(trig "$TESTER") && pass trigger-sanity || fail trigger-sanity "$OUT"
# mutation proof: drop one pattern in a temp copy => must fail
sed 's/, `^tsconfig\\.base\\.json\$`//' "$TESTER" > "$T/tester-mut.md"
if cmp -s "$TESTER" "$T/tester-mut.md"; then fail trigger-mutation "sed did not remove pattern"
elif trig "$T/tester-mut.md" >/dev/null; then fail trigger-mutation "mutated copy still passed"
else pass trigger-mutation; fi

echo "passed=$NP failed=$NF"
[ "$NF" = 0 ]
