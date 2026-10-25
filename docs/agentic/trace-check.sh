#!/usr/bin/env bash
# Report-only SDD traceability check: FEATURES.md <-> tasks/*.md <-> tests.
cd "$(dirname "$0")/../.." || exit 1
feats=$(grep -oE '^## F-[0-9]+' planning/FEATURES.md | grep -oE 'F-[0-9]+' | sort -u)
echo "== Features with no task file =="
for f in $feats; do grep -lqE "^trace: \".*\b$f\b" tasks/[0-9]*.md 2>/dev/null || echo "$f"; done
echo "== DONE features with no tagged test =="
grep -lE '^status: "DONE"' tasks/[0-9]*.md 2>/dev/null | xargs grep -hE '^trace:' 2>/dev/null | grep -oE 'F-[0-9]+' | sort -u | while read -r f; do
  grep -rqE "\[[^]]*\b$f\b[^]]*\]" apps packages --include='*.spec.ts' --include='*.e2e-spec.ts' --exclude-dir=node_modules || echo "$f"
done
