#!/usr/bin/env bash
# Tests for tools/task.py against a throwaway fixture tree. Prints PASS|FAIL <name>; exit 1 on any FAIL.
R=$(cd "$(dirname "$0")/../.." && pwd)
NP=0; NF=0
pass() { echo "PASS $1"; NP=$((NP + 1)); }
fail() { echo "FAIL $1 :: $2"; NF=$((NF + 1)); }
mk() {
  T=$(mktemp -d)
  mkdir -p "$T/tools" "$T/docs/agentic/build-specs"
  cp "$R/tools/task.py" "$T/tools/" 2>/dev/null
  echo spec > "$T/docs/agentic/build-specs/s.md"
  SPEC=docs/agentic/build-specs/s.md
}
run() { OUT=$(cd "$T" && python3 tools/task.py "$@" 2>"$T/err"); RC=$?; ERR=$(cat "$T/err"); }
rc() { [ "$RC" = "$2" ] && pass "$1" || fail "$1" "rc=$RC want $2 err=$ERR"; }
has() { case "$2" in *"$3"*) pass "$1" ;; *) fail "$1" "missing [$3] in [$2]" ;; esac; }
hasnt() { case "$2" in *"$3"*) fail "$1" "unexpected [$3] in [$2]" ;; *) pass "$1" ;; esac; }
eq() { [ "$2" = "$3" ] && pass "$1" || fail "$1" "got [$2] want [$3]"; }
hasline() { printf '%s\n' "$2" | grep -qxF -- "$3" && pass "$1" || fail "$1" "no line [$3] in [$2]"; }
mk2() { mk; run new "A" --prio 1 --goal G; run new "B" --prio 1 --goal G; run start 1 --spec $SPEC; }
idx() { cat "$T/tasks/INDEX.md"; }
foc() { cat "$T/tasks/.focus" 2>/dev/null; }
f1() { ls "$T"/tasks/001-*.md 2>/dev/null | head -1; }
TODAY=$(date +%F)

# ---- new
mk
run new "Alpha task" --prio 2 --goal G
rc new-ok 0
[ -f "$T/tasks/001-alpha-task.md" ] && pass new-file-slug || fail new-file-slug "no 001-alpha-task.md"
has new-index-row "$(cat "$T/tasks/INDEX.md")" "1|todo|2||Alpha task|"
has new-status-todo "$(cat "$T/tasks/001-alpha-task.md")" 'status: "TODO"'
has new-changelog "$(cat "$T/tasks/001-alpha-task.md")" "- $TODAY [new] created"
for s in "## Description / AC" "## Build spec" "## Changelog" "## Completion notes"; do
  has "new-section $s" "$(cat "$T/tasks/001-alpha-task.md")" "$s"
done
run new "No goal" --prio 1
rc new-no-goal-exit1 1
run new "No prio" --goal G
rc new-no-prio-exit1 1
run new "Bad prio" --goal G --prio 9
rc new-bad-prio-exit1 1
run new "Two
line" --goal G --prio 1
rc new-newline-title-exit1 1
run new "Beta" --goal G --prio 1 --trace E-01/F-02 --deps 1
rc new-second-ok 0
has new-second-id "$(cat "$T/tasks/INDEX.md")" "2|todo|1|E-01/F-02|Beta|1"
rm -rf "$T"

# ---- lifecycle
mk
run new "Alpha task" --prio 2 --goal G
F=$(f1)
run start 1
rc start-no-spec-exit1 1
has start-no-spec-status-unchanged "$(cat "$F")" 'status: "TODO"'
run start 1 --spec docs/agentic/build-specs/nope.md
rc start-missing-spec-exit1 1
has start-missing-spec-status-unchanged "$(cat "$F")" 'status: "TODO"'
run start 1 --spec $SPEC
rc start-ok 0
has start-status "$(cat "$F")" 'status: "IN_PROGRESS"'
has start-started "$(cat "$F")" "started: \"$TODAY\""
has start-spec "$(cat "$F")" "build_spec: \"$SPEC\""
has start-index-wip "$(cat "$T/tasks/INDEX.md")" "1|wip|2||Alpha task|"
has start-changelog "$(cat "$F")" "[start] focus -> #1, status IN_PROGRESS (spec $SPEC)"
run start 1
rc start-again-exit0 0
has start-again-msg "$OUT" "already focused"
run brief
has brief-active "$OUT" "Focus: #1 [P2] Alpha task -- spec $SPEC"

cp "$F" "$T/before.md"
run log 1 "stage note"
rc log-ok 0
has log-entry "$(cat "$F")" "- $TODAY stage note"
python3 - "$T/before.md" "$F" <<'PY' && pass log-append-only-prefix || fail log-append-only-prefix "prefix changed"
import sys
b = open(sys.argv[1]).read(); a = open(sys.argv[2]).read()
cut = b.index("## Completion notes")
head = b[:cut].rstrip("\n")
assert a.startswith(head), "prefix"
assert a.index("stage note") < a.index("## Completion notes"), "order"
assert a.endswith(b[cut:]), "tail"
PY
run log 1 ""
rc log-empty-exit1 1

run done 1
rc done-no-flag-exit1 1
run done 1 --gate-pass ""
rc done-empty-note-exit1 1
run done 1 --gate-pass "ok"
rc done-ok 0
has done-status "$(cat "$F")" 'status: "DONE"'
has done-completed "$(cat "$F")" "completed: \"$TODAY\""
has done-notes "$(cat "$F")" "ok"
has done-changelog "$(cat "$F")" "[done] gatekeeper PASS"
has done-index-row "$(cat "$T/tasks/INDEX.md")" "1||Alpha task"
hasnt done-index-not-open "$(sed -n '/^## Open/,/^## Done/p' "$T/tasks/INDEX.md")" "Alpha task"
run start 1
rc start-on-done-exit1 1
run show 99
rc unknown-id-exit1 1
has unknown-id-msg "$ERR" "unknown task 99"
rm -rf "$T"

# ---- status
mk
run new "A" --prio 1 --goal G
run new "B" --prio 1 --goal G
run status 2 BLOCKED "why"
rc status-ok 0
has status-blk-row "$(cat "$T/tasks/INDEX.md")" "2|blk|1||B|"
has status-logged "$(cat "$T"/tasks/002-*.md)" "why"
run status 2 BLOCKED
rc status-no-reason-exit1 1
run status 2 NONSENSE "x"
rc status-bad-enum-exit1 1
run status 2 FAILED "boom"
has status-fail-row "$(cat "$T/tasks/INDEX.md")" "2|fail|1||B|"
rm -rf "$T"

# ---- index --check
mk
run new "A" --prio 1 --goal G
run index --check
rc check-fresh-exit0 0
echo "junk" >> "$T/tasks/INDEX.md"
run index --check
rc check-stale-exit1 1
has check-stale-msg "$ERR" "INDEX.md stale: run python3 tools/task.py index"
run index
run index --check
rc check-after-index-exit0 0
rm -rf "$T"

# ---- title round-trip + truncation
mk
TITLE='a|b: "q" — x → `t`'
run new "$TITLE" --prio 1 --goal 'G: "x"'
rc rt-new 0
RAW=$(grep '^title: ' "$T"/tasks/001-*.md | sed 's/^title: //')
GOT=$(printf '%s' "$RAW" | python3 -c 'import json,sys;print(json.loads(sys.stdin.read()),end="")')
eq rt-title-identical "$GOT" "$TITLE"
has rt-index-slash "$(cat "$T/tasks/INDEX.md")" 'a/b: "q" — x → `t`'
LONG=$(python3 -c 'print("x"*120,end="")')
run new "$LONG" --prio 1 --goal G
IDX=$(grep '^2|' "$T/tasks/INDEX.md")
eq trunc-index "$IDX" "2|todo|1||$(python3 -c 'print("x"*72+"…",end="")')|"
has trunc-full-in-file "$(cat "$T"/tasks/002-*.md)" "$LONG"
rm -rf "$T"

# ---- brief ordering + corrupt tolerance
mk
run brief
has brief-none "$OUT" "Focus: none -- python3 tools/task.py start <id> --spec <build-spec> before product edits"
has brief-next-none "$OUT" "Next: none"
run new "T3" --prio 3 --goal G
run new "T1a" --prio 1 --goal G
run new "T2" --prio 2 --goal G
run new "T1b" --prio 1 --goal G
run brief
has brief-next-order "$OUT" "Next: #2 T1a; #4 T1b; #3 T2"
hasnt brief-next-max3 "$OUT" "T3"
echo "garbage, no frontmatter" > "$T/tasks/999-bad.md"
run index
rc corrupt-index-exit0 0
has corrupt-index-warns "$ERR" "999-bad.md"
run brief
rc corrupt-brief-exit0 0
has corrupt-brief-warn-ok "$OUT" "Next:"
run start 2 --spec $SPEC
run brief
has brief-active-after-start "$OUT" "Focus: #2 [P1] T1a"
rm -rf "$T"

# ---- focus
mk
run new "Alpha task" --prio 2 --goal G
hasnt focus-index-none-fresh "$(idx)" "Focus:"
[ ! -e "$T/tasks/.focus" ] && pass focus-file-absent-fresh || fail focus-file-absent-fresh "exists"
run start 1 --spec $SPEC
eq focus-file-after-start "$(foc)" "1"
run index --check; rc index-check-with-focus-exit0 0
mv "$T/tasks/.focus" "$T/focus.bak"
run index --check; rc index-check-without-focus-exit0 0
mv "$T/focus.bak" "$T/tasks/.focus"
hasnt focus-index-line "$(idx)" "Focus:"
rm -rf "$T"

mk2
cp "$T"/tasks/001-*.md "$T/b1.md"
run start 2 --spec $SPEC
rc focus-moves-exit0 0
eq focus-moves-file "$(foc)" "2"
has focus-moves-prev-status-kept "$(cat "$T"/tasks/001-*.md)" 'status: "IN_PROGRESS"'
has focus-moves-prev-log "$(cat "$T"/tasks/001-*.md)" "[focus] focus moved to #2"
has focus-moves-new-log "$(cat "$T"/tasks/002-*.md)" "[start] focus -> #2"
hasnt focus-moves-index "$(idx)" "Focus:"
has focus-moves-rows-wip1 "$(idx)" "1|wip|1||A|"
has focus-moves-rows-wip2 "$(idx)" "2|wip|1||B|"
python3 - "$T/b1.md" "$(ls "$T"/tasks/001-*.md)" "$TODAY" <<'PY' && pass focus-moves-prev-append-only || fail focus-moves-prev-append-only "bytes differ"
import sys
b = open(sys.argv[1]).read(); a = open(sys.argv[2]).read()
line = "- %s [focus] focus moved to #2\n" % sys.argv[3]
assert a.count(line) == 1, "line"
assert a.replace(line, "", 1) == b, "other bytes changed"
PY
# refocus parked
run start 1
rc refocus-parked-exit0 0
eq refocus-parked-file "$(foc)" "1"
hasnt refocus-parked-index "$(idx)" "Focus:"
has refocus-parked-other-wip "$(cat "$T"/tasks/002-*.md)" 'status: "IN_PROGRESS"'
cp "$T"/tasks/001-*.md "$T/b1.md"
run start 1
rc refocus-again-exit0 0
has refocus-again-msg "$OUT" "already focused"
cmp -s "$T/b1.md" "$(ls "$T"/tasks/001-*.md)" && pass refocus-again-identical || fail refocus-again-identical "file changed"
rm -rf "$T"

# start refusals keep focus and write nothing
mk2
run start 2 --spec $SPEC
run start 1
cp "$T"/tasks/001-*.md "$T/b1.md"; cp "$T"/tasks/002-*.md "$T/b2.md"
run new "C" --prio 1 --goal G
run start 3 --spec nope.md
rc start-missing-spec-keeps-focus-exit1 1
eq start-missing-spec-keeps-focus-file "$(foc)" "1"
run start 3 --spec docs/agentic/build-specs/nope.md
rc start-missing-spec2-exit1 1
cmp -s "$T/b1.md" "$(ls "$T"/tasks/001-*.md)" && cmp -s "$T/b2.md" "$(ls "$T"/tasks/002-*.md)" && pass start-refusal-no-changelog-change || fail start-refusal-no-changelog-change "changed"
has start-refusal-todo-unchanged "$(cat "$T"/tasks/003-*.md)" 'status: "TODO"'
rm "$T/docs/agentic/build-specs/s.md"
run start 2
rc start-deleted-spec-exit1 1
eq start-deleted-spec-keeps-focus "$(foc)" "1"
echo spec > "$T/docs/agentic/build-specs/s.md"
run start 3 --spec $SPEC
run done 3 --gate-pass ok
run start 1
run start 3
rc start-done-exit1 1
eq start-done-keeps-focus "$(foc)" "1"
rm -rf "$T"

# done
mk2
run start 2 --spec $SPEC
run done 1 --gate-pass ok
eq done-unfocused-keeps-focus "$(foc)" "2"
run done 2 --gate-pass ok
[ ! -e "$T/tasks/.focus" ] && pass done-clears-focus || fail done-clears-focus "still there"
hasnt done-clears-focus-index "$(idx)" "Focus:"
rm -rf "$T"

# status
for S in BLOCKED FAILED TODO; do
  mk2
  run status 1 $S "why"
  [ ! -e "$T/tasks/.focus" ] && pass "status-clears-focus-$S" || fail "status-clears-focus-$S" "still there"
  hasnt "status-clears-focus-index-$S" "$(idx)" "Focus:"
  rm -rf "$T"
done
mk2
run start 2 --spec $SPEC
run status 1 BLOCKED "why"
eq status-unfocused-keeps-focus "$(foc)" "2"
rm -rf "$T"

# brief focus line
mk2
run brief
has brief-focus-line "$OUT" "Focus: #1 [P1] A -- spec $SPEC"
hasnt brief-no-active "$OUT" "Activ""e:"
run start 2 --spec $SPEC
run brief
eq brief-one-focus-line "$(printf '%s\n' "$OUT" | grep -c '^Focus:')" "1"
hasnt brief-two-wip-no-active "$OUT" "Activ""e:"
run done 2 --gate-pass ok
run brief
has brief-focus-none-after-done "$OUT" "Focus: none -- "
rm -rf "$T"

# stale / garbage focus
mk
run new A --prio 1 --goal G
run new B --prio 1 --goal G
run new C --prio 1 --goal G
run start 2 --spec $SPEC
run done 2 --gate-pass ok
ROWS=$(idx | grep -cE '^[0-9]+\|')
for V in 1 2 99 abc ""; do
  printf '%s' "$V" > "$T/tasks/.focus"
  run brief
  rc "brief-stale-[$V]-exit0" 0
  has "brief-stale-[$V]-none" "$OUT" "Focus: none"
  run index
  rc "stale-index-[$V]-exit0" 0
  run index --check
  rc "stale-index-check-[$V]" 0
  eq "stale-rows-unchanged-[$V]" "$(idx | grep -cE '^[0-9]+\|')" "$ROWS"
  case "$V" in abc|"") hasnt "stale-index-none-[$V]" "$(idx)" "Focus:" ;; esac
done
rm -rf "$T"

# prev focus corrupt
mk2
echo "garbage" > "$(ls "$T"/tasks/001-*.md)"
run start 2 --spec $SPEC
rc focus-prev-corrupt-exit0 0
eq focus-prev-corrupt-file "$(foc)" "2"
rm -rf "$T"

# new never focuses
mk2
run new "C" --prio 1 --goal G
eq new-keeps-focus "$(foc)" "1"
rm -rf "$T"

# ---- stage D fixes
# gitignore: .focus + tmp not committed
(cd "$R" && git check-ignore -q tasks/.focus) && pass gitignore-focus || fail gitignore-focus "tasks/.focus not ignored"
(cd "$R" && git check-ignore -q tasks/001-x.md.tmp) && pass gitignore-tmp || fail gitignore-tmp "tasks/*.tmp not ignored"
(cd "$R" && git check-ignore -q tasks/001-x.md) && fail gitignore-task-files-tracked "task md ignored" || pass gitignore-task-files-tracked
mk2
cp "$R/.gitignore" "$T/.gitignore"
(cd "$T" && git init -q . && git add -A >/dev/null 2>&1 && git -c user.email=a@b -c user.name=n commit -qm i >/dev/null 2>&1)
echo 9 > "$T/tasks/.focus"; : > "$T/tasks/002-x.md.tmp"
ST=$(cd "$T" && git status --short)
hasnt focus-not-in-git-status "$ST" ".focus"
hasnt tmp-not-in-git-status "$ST" ".tmp"
rm -rf "$T"

# newline rejection leaves file unchanged
mk2
F=$(f1); cp "$F" "$T/b.md"
run log 1 "x
## Completion notes"
rc log-newline-exit1 1
cmp -s "$F" "$T/b.md" && pass log-newline-unchanged || fail log-newline-unchanged "file changed"
has log-newline-msg "$ERR" "single line"
run log 1 "x
y"
rc log-cr-exit1 1
run log 1 "$(printf 'x\ry')"
rc log-cr-only-exit1 1
cmp -s "$F" "$T/b.md" && pass log-cr-unchanged || fail log-cr-unchanged "file changed"
run status 1 BLOCKED "why
## Completion notes"
rc status-newline-exit1 1
cmp -s "$F" "$T/b.md" && pass status-newline-unchanged || fail status-newline-unchanged "file changed"
run done 1 --gate-pass "ok
## Completion notes"
rc done-newline-exit1 1
cmp -s "$F" "$T/b.md" && pass done-newline-unchanged || fail done-newline-unchanged "file changed"
rm -rf "$T"

# start writes spec path into Build spec section
mk2
F=$(f1)
SEC=$(sed -n '/^## Build spec/,/^## Changelog/p' "$F")
has start-spec-in-body "$SEC" "- $SPEC"
hasnt start-spec-placeholder-gone "$SEC" "none yet"
run start 2 --spec $SPEC
run start 1 --spec $SPEC
eq start-spec-no-dup "$(grep -c -- "^- $SPEC\$" "$F")" "1"
rm -rf "$T"

# show with no INDEX
mk
run show
rc show-no-index-exit1 1
hasnt show-no-index-no-traceback "$ERR" "Traceback"
has show-no-index-msg "$ERR" "INDEX.md"
rm -rf "$T"

# ---- usage
mk
run
rc usage-exit1 1
run bogus
rc bad-cmd-exit1 1
rm -rf "$T"

echo "$NP passed, $NF failed"
[ "$NF" = 0 ]
