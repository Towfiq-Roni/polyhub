# Build spec — harness adoption (items 1-7) + per-task-file backlog redesign

Date: 2026-10-25 · Author: hub-planner · Task: new backlog task #45 "Harness adoption" (created in Batch 2) · Source: stakeholder directive "go build items 1-7" + backlog redesign.
Not finance-touching (no ledger/money path) — `accountant-expert` not needed. No `apps/api` endpoints change, so the Swagger/e2e gate families do not apply.

REV 2 (2026-10-25, stakeholder answer to Q1 = "option 3: add a focus field"): exactly ONE focused task at a time, stored in `tasks/.focus`; require-task keys on the focused task, not on "any IN_PROGRESS". See D5, D15, Batch 1 REWORK delta, Batch 11, §8.4, §12 Q1. Batch 1 is already built (70/70) and is reworked by delta.

Reference harness (Ryobi, read-only, untrusted): `.../scratchpad/ryobi/repo/hooks/{block-git-writes,protect-paths,require-task,session-start}`, `tools/task.py`, `memory/pitfalls/*`, `CHANGELOG.md`. Shape borrowed, code NOT copied: hub uses its own tokenizer (below), file-per-task, no state JSON.

Sources that shaped this spec: CLAUDE.md (Guardrails push rule, Delegation Rules, Session Protocol, Authoritative Docs table); Workflow.md §2 pipeline; `.claude/settings.json` (existing PostToolUse/Stop hooks — untouched); DECISIONS DEC-038/058/059/065/075/084/088/090/092; `.claude/hooks/obsidian-memory-sync.sh`; `docs/memory/.claude-obsidian.json`; agentic-harness plugin cache 0.4.0 `commands/{architect,manager,epics,clickup-log}.md` (all hard-code `TASKS.md`); `.prettierignore` (already ignores `*.md`, `docs`, `.claude`, `planning`, so no prettier impact from new .md files).

---

## 1. Objective

Add five mechanical harness guards (git-push, protected paths, session-start briefing, task-gate, UI screenshot rule), typed pitfall memory and a versioned harness changelog; and replace the monolithic `TASKS.md` with one file per task (`tasks/NNN-slug.md`) behind one generated token-cheap `tasks/INDEX.md` and a stdlib CLI `tools/task.py`, migrating all 44 rows losslessly. Afterwards: agents read INDEX + one task file; `start` is the only way to focus a task (exactly one focused task at a time); product-code edits without a focused, IN_PROGRESS, spec-backed task are blocked; `git push` needs an explicit marker; `TASKS.md` cannot silently regrow.

## 2. Design decisions (all explicit; implementer follows, does not re-decide)

D1. **Hook language**: Python 3 stdlib only (`python3` 3.13 present), exit 0 allow / 2 block, stderr = message to model. Any unexpected exception = exit 1 (non-blocking by Claude Code semantics) — fail-open on hook bugs, fail-closed only by explicit rule. Invalid/empty JSON on stdin = exit 0. `session-start.sh` is bash (stdout becomes context), always exit 0.
D2. **Hook path in settings**: `python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/<name>.py"`. Project root inside hooks = `os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd") or os.getcwd()`, realpath'd.
D3. **Tokenizer** (shared by hooks 1 and 5; duplicated inline — hooks stay standalone, no shared module): `shlex.shlex(cmd, posix=True, punctuation_chars=";&|()<>\n")` with `lex.whitespace_split=True; lex.whitespace=" \t\r"`. Verified in planner scratch: quoted `;`/`&&`/newlines stay inside one token, operators and newline come out as separator tokens. Heredoc bodies are stripped first (`strip_heredocs`) because apostrophes in a heredoc body break shlex and commit messages are routinely heredocs. `ValueError` from shlex => treat as "not a match" (allow) — malformed shell cannot run anyway. Ceiling (`ponytail:` comment in hook): `$(git push)`/backtick bodies, aliases, `xargs git push`, `gh` pushes are not caught; the hook is a mistake-guard, not a security boundary.
D4. **Push confirmation marker**: the literal word `HUB_PUSH_CONFIRMED=1` as an env-assignment prefix of the SAME command segment as `git push` (`HUB_PUSH_CONFIRMED=1 git push origin main`, or `env HUB_PUSH_CONFIRMED=1 git push`). Not read from process env (user's shell could leak it; an inline marker is visible in the transcript). Orchestrator rule (written into CLAUDE.md Guardrails): add the marker only in the turn right after the user wrote push/confirm-push, and append a RUNLOG line `HUB_PUSH_CONFIRMED used | user said: "<quote>"`. This is honor-system on the orchestrator by design (an agent can type the marker); the hook converts an accidental push into a deliberate, logged act.
D5. **Focused task** (REV 2, replaces "any IN_PROGRESS"). Representation: one-line file `tasks/.focus` holding the task id (`41\n`). Chosen over a `focus: true` frontmatter key because: (a) "exactly one" holds by construction (one file, one id) whereas a per-file flag needs a two-file clear-then-set that can drift into 0 or 2 flags on a crash or hand edit; (b) no new frontmatter key, so KEYS, the migration script, S6 and 45 task files stay unchanged; (c) the hook reads one tiny file, not N task files, for the focus lookup. `.focus` is not matched by `tasks/[0-9][0-9][0-9]-*.md` globs, so it never appears as a task. It is tracked in git (shared working state, same as the task files). Gate predicate (require-task): `tasks/.focus` parses as an int N AND `tasks/N3-*.md` exists AND its `status` is `IN_PROGRESS` AND `build_spec` non-empty AND `os.path.isfile(root/build_spec)`; any failure (missing/garbage `.focus`, DONE/TODO/BLOCKED focus target, missing spec) = no focus = block for product paths. Other IN_PROGRESS tasks are legal but inert ("parked"). `task.py start <id>` is the only writer of `.focus` (besides the clears below) and refuses unless the spec file exists, so Plan-before-Build is still enforced by construction. Focus clears when the focused task gets `done` or any `status` change (TODO/BLOCKED/FAILED); the previously focused task's STATUS is never altered by a focus move. No state JSON beyond the one-line file. Ceiling (`ponytail:` in task.py): focus is per working tree, so parallel agents share one focus; an agent that hand-writes `tasks/.focus` still cannot pass the gate without an IN_PROGRESS task + real spec (tasks/ edits are allowed by design) -> only the changelog trail is skipped.
D6. **require-task escape hatch**: env `HUB_SKIP_TASK_GATE=1` in the hook's own process env, i.e. only the human can set it (`HUB_SKIP_TASK_GATE=1 claude`); an agent cannot set Claude's env. When bypass is active AND the hook would have blocked, it (a) prints `BYPASS HUB_SKIP_TASK_GATE=1` to stderr, (b) appends `<ISO-UTC> | require-task | BYPASS HUB_SKIP_TASK_GATE=1 <tool> <path-or-cmd[:80]>` to `docs/agentic/RUNLOG.md` unless the last RUNLOG line already contains `require-task | BYPASS` (dedupe consecutive). The orchestrator additionally records the user's reason in RUNLOG when told of the bypass. Documented in the hook docstring and CLAUDE.md.
D7. **Gate scope**: Edit|Write|MultiEdit|NotebookEdit whose realpath is under `<root>/apps/` or `<root>/packages/`, excluding paths containing a `node_modules|dist|.next|coverage|test-results` segment; plus Bash commands that write there (heuristic D8). Everything else (docs/, .claude/, tasks/, infra/, root configs, planning/, analysis/) always allowed.
D8. **Bash write heuristic (conservative; false positives are the enemy, DEC-059)**: per segment (after dropping leading env-assignments, tracking `cd X` to update cwd): block only if (a) a `>`/`>>`/`>|` token is followed by a target resolving under apps/ or packages/ (non-artifact), or (b) head in {`sed`,`perl`} with an in-place flag (`-i…`/`--in-place`) and any arg under product dirs, or (c) head in {`tee`,`truncate`,`patch`,`rm`,`mv`,`touch`,`mkdir`,`rmdir`,`install`,`ln`} with any arg under product dirs, or (d) head `cp` and the LAST arg under product dirs, or (e) head in {`python`,`python3`,`node`} and the raw command matches `(apps|packages)/` AND `write_text|\.write\(|writeFileSync|open\([^)]*['"][wa]`. Not covered (ceiling, comment in hook): `git checkout/apply/restore`, `pnpm`/`prisma` generators, `dd`, `curl -o`, editors.
D9. **protect-paths rules**: (R1) basename `.env` or startswith `.env.` and NOT endswith `.example` (so `.env.example`, `.env.dev.example`, `.env.prod.example` pass; `infra/.env.dev`, `apps/api/.env`, `.env.local` blocked; `.envrc` passes); (R2) any realpath segment exactly `.git` (`.gitignore`, `.github`, `.gitattributes`, `foo.git/` pass); (R3) realpath contains consecutive segments `prisma/migrations/`, `os.path.isfile(real)` (existing file, incl. `migration_lock.toml`) — a not-yet-existing path passes; (R4, **planner addition for the backlog redesign — flag to orchestrator**) realpath == `<root>/TASKS.md` blocked with "monolith retired; use `python3 tools/task.py new|log|start|done`". Relative `file_path` resolved against payload `cwd`. Bash writes to these paths are out of scope (ceiling).
D10. **Version/changelog location**: `.claude/VERSION` + `.claude/CHANGELOG.md`. Justification: `.claude/` is the harness being versioned (hooks, agents, commands, settings); keeps repo root clean; `docs/memory` is a vault (don't pollute); version is read by session-start from a known path. Bump rule (first line of CHANGELOG): patch = wording only; minor = new hook/skill/memory category/CLI command; major = `.claude/settings.json` hook wiring changes (everyone must re-review hooks). Initial `0.1.0` (wiring is part of initial adoption, so no major bump).
D11. **Backlog format**: see §4. Frontmatter is flat `key: <JSON value>` lines (strings JSON-quoted so colons/emoji/`→` are valid YAML and `json.loads`-parseable; ints bare; lists JSON arrays). Parser = for each line between the `---` fences: `k, v = line.split(": ", 1); json.loads(v)`. No YAML dependency.
D12. **Migration script fate**: DELETE after use (ponytail: one-off, deterministic, run once; the verbatim archive `docs/agentic/archive/TASKS-2026-10-25.md` + the lossless check below are the audit trail; a retained script is dead code that could re-run and clobber hand-edited task files). The implementer writes it to the session scratchpad dir, NOT into the repo, so there is nothing to delete.
D13. **TASKS.md fate**: 3-line deprecated pointer (exact text §4.6) + protect-paths R4 + `planning/project.config.yaml: task_log: TASKS.md` left as-is (it then names the pointer, which redirects). Plugin commands (`architect/manager/epics/clickup-log`) live in the plugin cache (not editable); the pointer text + CLAUDE.md rule + R4 are the mitigation.
D14. **Cap deviation, pre-logged**: Batch 2 emits 45 generated task files + INDEX from one deterministic script run. This exceeds the ≤3-file cap in count but not in spirit (mechanical output, zero hand-authored logic; same shape as DEC-092). DEC-093 text (§9) already records it so the "reasoned but not logged" pitfall does not recur.
D15. **Q1 resolution (stakeholder, 2026-10-25): option 3, add a focus field.** Rejected: (a) accept vacuous gate; (b) park #41 BLOCKED (would rewrite DEC-086's recorded status). Result: #41 stays truthfully `IN_PROGRESS` but is unfocused, so the gate bites from day one; Batch 2 `start 45` focuses #45 (the harness task) during the build; `done 45` clears focus, after which product edits are blocked until the next `start`. No separate `task.py focus` command (YAGNI): `start <id>` on an already-IN_PROGRESS task re-focuses it, which covers switching back to #41.

## 3. Batches (each = one hub-implementer delegation, ≤3 hand-authored files; orchestrator audits between batches; require-task + settings.json wiring LAST)

Pre-flight (orchestrator, before Batch 1; record in RUNLOG):
- `shasum -a 256 TASKS.md` → expect `498bdbbda8213d8d8cd4ab85b8c09561514699b68fa46c03e8b47edd6e85f472` (working copy, uncommitted).
- `bash docs/agentic/trace-check.sh > <scratch>/trace-before.txt`.
- `git status --short | wc -l` and stash count (baseline for session-start gate).

### Batch 1 — task CLI (2 files) — TDD: write the test first, watch RED. STATUS: BUILT 2026-10-25 (70/70 PASS); REV 2 = REWORK delta at the end of this batch (still the same 2 files)
1. `tools/tests/test-task.sh` (new). Self-contained bash: builds a temp tree (`T=$(mktemp -d); mkdir -p $T/tools $T/docs/agentic/build-specs; cp tools/task.py $T/tools/`), runs the CLI there (root = parent of `tools/`, so no env override needed), prints `PASS|FAIL <name>`, exits 1 on any FAIL. Cases listed in gate E1.
2. `tools/task.py` (new, stdlib only: `sys, os, re, json, glob, datetime`). Root = `dirname(dirname(realpath(__file__)))`; tasks dir = `root/tasks`.
   - `parse(path) -> (fm: dict, body: str)`; `write(path, fm, body)` writes `tmp` + `os.replace`. Frontmatter key order fixed: `id,title,goal,source,priority,status,trace,sprint,deps,build_spec,started,completed,agents`. Focus helpers (REV 2): `FOCUS = tasks/.focus`; `get_focus() -> int|None` (read, `int(strip())`, `OSError`/`ValueError` -> None); `set_focus(id)` (tmp + `os.replace`, content `"%d\n"`); `clear_focus_if(id)` (remove file only if it holds that id, ignore `OSError`).
   - `find(id)`: glob `tasks/%03d-*.md`; none → stderr `unknown task <id>`, exit 1.
   - Commands (argv, no argparse needed; usage text on bad args, exit 1):
     - `show [id]`: no id → print `tasks/INDEX.md`; id → print the task file.
     - `start <id> [--spec PATH]` (REV 2: this is the ONLY command that focuses): refuse (exit 1, stderr reason, NOTHING written) if status DONE; resolve spec = `--spec` or existing `build_spec`; refuse if empty or file missing ("no build spec: run hub-planner first") - this check now applies even when the task is already IN_PROGRESS; if the task is already focused AND IN_PROGRESS AND spec unchanged: print "already focused", exit 0, no writes. Otherwise: set `build_spec`; if status != IN_PROGRESS set IN_PROGRESS and `started` = today if empty; append own changelog `- <date> [start] focus -> #<id>, status IN_PROGRESS (spec <path>)`; if a DIFFERENT task id was previously focused, append to THAT task's changelog `- <date> [focus] focus moved to #<id>` (its status/other fields untouched; previous file missing/corrupt = skipped silently); `set_focus(id)`; reindex.
     - `log <id> "msg"`: append `- <YYYY-MM-DD> <msg>` as the last line of the `## Changelog` section (insert before the `## Completion notes` heading). Refuse empty msg.
     - `done <id> --gate-pass "note"`: requires flag `--gate-pass` and non-empty note (else exit 1 "pass --gate-pass only after hub-gatekeeper PASS"); set DONE, `completed` = today; append note under `## Completion notes` (replace the `—` placeholder if present, else append a dated line); append changelog `- <date> [done] gatekeeper PASS`; reindex. REV 2: after the write, `clear_focus_if(id)` (clears focus iff this task was focused), then reindex.
     - `status <id> TODO|BLOCKED|FAILED "reason"`: set status, changelog line with reason, reindex (reason required). REV 2: after the write, `clear_focus_if(id)` (leaving IN_PROGRESS on the focused task clears focus; a non-focused task never touches focus).
     - `new "<title>" --goal G --prio 1|2|3 [--source S] [--trace E-NN/F-NN] [--deps 1,2]`: goal and prio required (every task cites a goal); id = max existing + 1; slug rule §4.4; status TODO; source default `Auto <date>`; body from the §4.2 template with changelog `- <date> [new] created`; reindex; print path.
     - `index [--check]`: regenerate `tasks/INDEX.md` per §4.3 (deterministic: sorted by id). `--check`: compare to disk, exit 1 + `INDEX.md stale: run python3 tools/task.py index` on mismatch, write nothing. REV 2: INDEX carries one `Focus: #<id>` / `Focus: none` line (raw `get_focus()`, unvalidated) between the header block and `## Open` (§4.3), so `--check` also detects focus drift.
     - `brief` (REV 2): ≤3 lines for session-start: `Focus: #<id> [P<prio>] <title[:60]> -- spec <path>` when `get_focus()` names a task whose status is IN_PROGRESS, else `Focus: none -- python3 tools/task.py start <id> --spec <build-spec> before product edits` (stale/garbage `.focus` = none); then `Next: #a title[:40]; #b …; #c …` = first 3 TODO by (priority asc, id asc) (`Next: none` if empty). The old per-IN_PROGRESS `Active:` lines and `+N more` line are REMOVED (exactly one focus). Must never raise: unreadable file -> skip it; any exception -> prints `Focus: unknown` + `Next: unknown`.
   - Every mutating command ends with a reindex. Title/goal containing `|` → index replaces with `/`; newlines in titles rejected.
- Verify: `bash tools/tests/test-task.sh` → all PASS; `python3 -c "import ast,sys;ast.parse(open('tools/task.py').read())"`; `grep -nE '^(import|from) ' tools/task.py` ⊆ stdlib set.

#### Batch 1 REWORK delta (REV 2; hub-implementer; files: `tools/tests/test-task.sh`, `tools/task.py`; TDD: edit the tests FIRST, run, confirm the new/changed cases are RED, then change task.py)
**A. `tools/tests/test-task.sh` — changed existing cases (exact):**
- line ~66 `start-again-msg`: expected text `already active` -> `already focused`.
- line ~68 `brief-active` and line ~172 `brief-active-after-start`: `Active: #...` -> `Focus: #...` (same remainder).
- line ~154 `brief-none`: expect `Focus: none -- python3 tools/task.py start <id> --spec <build-spec> before product edits`.
- Any case asserting the exact INDEX text of the whole file must account for the new `Focus:` line; row-level `has ... "1|wip|2||Alpha task|"` cases are unchanged.
**B. new cases (each prints PASS|FAIL <name>; fixtures only, temp tree as today):**
1. `focus-file-after-start`: after `start 1 --spec S`, `cat tasks/.focus` == `1`; `focus-index-line`: INDEX contains line `Focus: #1`; fresh tree before any start: INDEX contains `Focus: none` and `tasks/.focus` absent.
2. `focus-moves`: with 1 focused+IN_PROGRESS, `start 2 --spec S` exit 0 -> `.focus` == `2`; task 1 file still `status: "IN_PROGRESS"` (status NOT changed); task 1 changelog contains `[focus] focus moved to #2`; task 2 changelog contains `[start] focus -> #2`; INDEX `Focus: #2`; both rows still `wip`; task 1 file bytes otherwise = before + the one appended changelog line (append-only).
3. `refocus-parked`: `start 1` (no `--spec`, build_spec already set, status IN_PROGRESS but unfocused) exit 0 -> `.focus` == `1`, `Focus: #1`, task 2 still IN_PROGRESS; immediately again -> `already focused`, exit 0, byte-identical task file (no new changelog line).
4. `start-refuses-missing-spec-keeps-focus`: focus on 1; set task 2 `build_spec` to a deleted path (or `start 2 --spec nope.md`) -> exit 1, `.focus` still `1`, no changelog change on either task. Also `start` on a DONE task exit 1 and `.focus` unchanged.
5. `done-clears-focus`: `done <focused> --gate-pass ok` -> `tasks/.focus` absent, INDEX `Focus: none`; `done-unfocused-keeps-focus`: `done <other IN_PROGRESS non-focused>` -> `.focus` unchanged.
6. `status-clears-focus`: `status <focused> BLOCKED "why"` -> `.focus` absent, `Focus: none`; repeat for `FAILED` and `TODO`; `status-unfocused-keeps-focus`: `status <non-focused> BLOCKED "why"` -> `.focus` unchanged.
7. `brief-focus-line`: focused -> `Focus: #<id> [P<prio>] <title> -- spec <path>` and NO `Active:` anywhere; two IN_PROGRESS (one focused) -> exactly ONE `Focus:` line in `brief`; after `done` -> `Focus: none ...`.
8. `brief-stale-focus`: hand-write `.focus` = id of a TODO task, then of a DONE task, then of a nonexistent id, then `abc`, then empty file -> each: `brief` exit 0 and `Focus: none`; INDEX regenerated shows the raw value or `Focus: none` for garbage; `index --check` exit 0 after `index`; `.focus` never shows up as a row in INDEX (row count unchanged).
9. `focus-prev-corrupt-ok`: `.focus` = 1, corrupt task 1 file -> `start 2 --spec S` exit 0 (warning on stderr allowed), `.focus` == `2`.
10. `new-does-not-focus`: `new` never creates/changes `.focus`.
**C. `tools/task.py` changes:** exactly the REV 2 bullets in the command list above (FOCUS const + 3 helpers; `build_index` inserts the Focus line; `cmd_start` rewrite with validate-before-write ordering; `clear_focus_if` call in `cmd_done` and `cmd_status`; `cmd_brief` focus logic; module docstring: `start` "sets the single focus"). No new subcommand, no new import, USAGE/HEADER `CLI:` line unchanged. Mark `ponytail:` ceiling comment at `set_focus` (per-working-tree focus).
**D. Verify:** `bash tools/tests/test-task.sh` all PASS (70 old cases minus 3 edited-and-passing + the new ones; report the total); S1/S4 greps unchanged and green; `grep -c "^def cmd_" tools/task.py` still 8.

### Batch 2 — backlog migration (generated; hand-authored files: 1 pointer; script lives in scratchpad)
Steps (implementer, in order):
1. `mkdir -p docs/agentic/archive && cp TASKS.md docs/agentic/archive/TASKS-2026-10-25.md` (verbatim; `shasum` must equal the pre-flight sha). This is the lossless safety net (TASKS.md is uncommitted).
2. Write scratchpad script `migrate_tasks.py` (NOT in repo) implementing §5 rules; run it once → creates `tasks/001-….md` … `tasks/044-….md`.
3. Create #45 via CLI: `python3 tools/task.py new "Harness adoption: hooks, pitfalls, task-file backlog, changelog (items 1-7)" --goal "Reduced tool sprawl" --prio 2 --source "User 2026-10-25"` then `python3 tools/task.py start 45 --spec docs/agentic/build-specs/2026-10-25-harness-adoption.md` (this writes `tasks/.focus` = `45`; #41 stays `IN_PROGRESS` but UNFOCUSED, by design - D15; the migration script must NOT create `.focus`). (Goal wording: hub's existing goals in the archive are "Financial traceability / Operational visibility / Reduced tool sprawl"; harness work fits the last.)
4. `python3 tools/task.py index` → `tasks/INDEX.md`.
5. Run the lossless check §5.4 (scratchpad script) → must print `LOSSLESS OK 44/44`.
6. Replace `TASKS.md` with the exact 3-line pointer (§4.6) via Write.
7. Delete nothing else; scratchpad script stays outside the repo.
- Verify: gates S5-S8, E2.

### Batch 3 — block-git-push (2 files)
1. `tools/tests/test-block-git-push.sh` (new; cases §8.1; write first, RED).
2. `.claude/hooks/block-git-push.py` (new). Structure (reference implementation verified by the planner against every case in §8.1 — implementer may restyle, must keep behavior):
```python
#!/usr/bin/env python3
"""PreToolUse(Bash): block `git push` unless the same segment carries HUB_PUSH_CONFIRMED=1.
Exit 0 allow / 2 block. ponytail: $(...)/backticks, aliases, xargs, gh pushes not caught -> mistake-guard, not security."""
import json, re, shlex, sys
MARK = "HUB_PUSH_CONFIRMED=1"
SEP = {";", "&&", "||", "|", "&", "|&", "(", ")", "\n"}
SKIP = {"sudo","time","command","env","nohup","exec","builtin","!","{","}","then","do","else","elif","if","while","until"}
OPT_VAL = {"-C","-c","--git-dir","--work-tree","--namespace","--exec-path"}
SHELLS = {"bash","sh","zsh","dash"}
HEREDOC = re.compile(r"(?<!<)<<-?\s*(['\"]?)([A-Za-z_]\w*)\1")
def strip_heredocs(cmd): ...   # drop lines between a <<DELIM line and the DELIM line; keep the DELIM line
def tokens(cmd): ...           # shlex config from D3
def segments(words): ...       # split on SEP tokens
def pushes(cmd, depth=0):
    # for each segment: strip leading VAR=val and SKIP words, remembering whether MARK was seen;
    # head = basename(seg[0]); if head in SHELLS and "-c" present, or head == "eval": recurse into the body (depth<3);
    # if head == "git": skip options (OPT_VAL consume one extra token; --opt=val is one token), subcommand == "push" and not confirmed -> True
def main(): load JSON (except -> 0); only tool_name == "Bash"; if pushes(cmd): stderr message; return 2
```
   Block message (stderr): `Blocked by hub harness: git push needs the user's explicit go-ahead (CLAUDE.md Guardrails). After the user says "push", re-run as: HUB_PUSH_CONFIRMED=1 git push ... and log it in docs/agentic/RUNLOG.md. Local commits stay allowed.`
- Verify: `bash tools/tests/test-block-git-push.sh`; corpus sweep E4.

### Batch 4 — protect-paths (2 files)
1. `tools/tests/test-protect-paths.sh` (new; cases §8.2; RED first).
2. `.claude/hooks/protect-paths.py` (new): `reason_for(path, root) -> str|None` implementing D9 R1-R4; `main` reads `tool_input.file_path` or `notebook_path`, resolves relative paths against `payload.cwd`, exit 2 + `Blocked by hub harness: <path>: <reason>. Ask the user if this is really needed.`; docstring lists the four rules and the Bash-write ceiling.
- Verify: `bash tools/tests/test-protect-paths.sh`.

### Batch 5 — session-start + VERSION (3 files)
1. `.claude/VERSION` (new): `0.1.0\n`.
2. `tools/tests/test-session-start.sh` (new; §8.3).
3. `.claude/hooks/session-start.sh` (new, `chmod +x`, bash, `set -u`, ALWAYS `exit 0`, every git call `2>/dev/null`): `ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"; cd "$ROOT" || exit 0`; `git rev-parse --git-dir` fails → print only line 1 with `no git repo` and exit 0. Output (compact; ≤12 lines, the gate is ≤15):
```
[hub-harness <VERSION or ?>] branch=<name|detached> | HEAD=<short sha> <subject[:60]>
dirty=<n> | stashes=<n> | <A ahead / B behind <upstream>  OR  no upstream>
<line(s) from: python3 tools/task.py brief 2>/dev/null   (omit if tools/task.py absent)>
Rules: push needs user say-so (HUB_PUSH_CONFIRMED=1) · read tasks/INDEX.md + ONE task file · <=3 files/delegation · money=integer poisha · ledger immutable
First: read docs/memory/PROGRESS.md; skim docs/memory/pitfalls/INDEX.md
```
   Ahead/behind from `git rev-list --left-right --count @{u}...HEAD` (behind first, ahead second — confirm ordering in the test with a real clone).
- Verify: `bash tools/tests/test-session-start.sh`; manual run `CLAUDE_PROJECT_DIR=$PWD bash .claude/hooks/session-start.sh | wc -l` ≤ 15.

### Batch 6 — pitfalls A (3 files). Batch 7 — pitfalls B (3 files)
Explicit spec exception: `hub-implementer` normally must not edit `docs/memory/*`; this spec authorizes it to CREATE files ONLY under `docs/memory/pitfalls/` (stakeholder item 4). It must not touch PROGRESS.md, DECISIONS.md, `wiki/`, `.raw/`, `.obsidian/`, `inbox/`.
Vault handling (verified): `docs/memory/.claude-obsidian.json` sets vault root `.`; `wiki/index.md` indexes captured copies under `.raw/` only via the reviewed `/claude-obsidian:save|wiki-ingest` transaction; `.claude/hooks/obsidian-memory-sync.sh` only matches `PROGRESS.md`/`DECISIONS.md`, so new raw .md files neither trigger it nor mutate the vault. Pitfalls are plain raw `.md`: frontmatter `name/description/type`, NO `[[wikilinks]]`, plain relative links only. Index at `docs/memory/pitfalls/INDEX.md` (not README.md, not under `wiki/`). Known side effect (accepted, not a mutation): `claude-obsidian:wiki-lint` may report these as un-indexed notes until the user chooses to ingest them — mention in the report.
File format (every pitfall):
```
---
name: <kebab-case, equals filename without .md>
description: <one line: the trap, imperative>
type: pitfall
---
<2-5 lines: what happened, with date + DEC/RUNLOG citation>

**Why:** <root cause>

**How to apply:** <the concrete check/command to run, when>
```
Batch 6: `docs/memory/pitfalls/INDEX.md` (one line per pitfall `- [name](name.md) — description`, plus 3-line header: purpose, "add via new file + index line", "raw md, not vault-ingested"), `deviation-reasoned-but-not-logged.md`, `pnpm-not-on-path-in-agent-shells.md`.
Batch 7: `make-dev-up-needs-infra-env-dev.md`, `e2e-needs-shared-build-first.md`, `async-agent-calls-break-sync-hooks.md`.
Evidence to cite (all verified present; do not invent more):
- deviation-reasoned-but-not-logged: 5 recurrences DEC-076 era through DEC-088 (DEC-082, DEC-083, DEC-084 gatekeeper catch, DEC-087, DEC-088); DEC-090/092 pre-logged immediately as the fix. How: any deviation from a build spec (version pin, base image, dependency move, file-cap breach, TTL value) gets a DECISIONS.md entry BEFORE the reviewer stage, citing the spec line; planner pre-logs known cap/threshold deviations in the spec itself (as D14 does).
- pnpm-not-on-path: DEC-090 "Environment note: `pnpm` not on PATH in agent shells; use `corepack pnpm` or a PATH shim."
- make-dev-up-needs-infra-env-dev: TASKS #41 note (#39 Stage D): `make dev-up` needs `cp infra/.env.dev.example infra/.env.dev` first (RUNLOG hub-tester 2026-10-25T06:29:35Z: "no infra/.env.dev").
- e2e-needs-shared-build-first: TASKS #43 note + same RUNLOG line ("shared dist unbuilt"): `pnpm --filter @hub/shared build` before `pnpm --filter @hub/api test:e2e`.
- async-agent-calls-break-sync-hooks: DEC-059 (Agent calls async; PostToolUse fires before the subagent works; RUNLOG hook reverted for false positives; SubagentStop deferred). How: never write a hook that assumes Agent-tool completion; pipe-test every hook against real payload shapes incl. allow cases.
Not seeded: argon2/node20 (DEC-084) is covered by a Dockerfile comment; ledger pitfalls have no DECISIONS evidence yet.
- Verify: gate S9.

### Batch 8 — UI screenshot rule + trace-check (3 files)
1. `.claude/agents/hub-tester.md`: in §2 "UI tasks" bullet replace the phrase `execute the screen's happy path at 390px mobile viewport, screenshot to \`test-results/\`, assert rendered money/status strings.` with: `execute the screen's happy path, then for EVERY changed or new screen/route capture full-page screenshots at 1440x900 and 430x932 (Playwright via the \`webapp-testing\` skill, \`page.screenshot({path: 'test-results/<task-id>-<screen>-<width>.png', fullPage: true})\` — no new tooling) and READ every PNG with the Read tool before reporting. Report one line per image on what you actually saw (layout, overflow/truncation, empty/error states, console errors, rendered money/status strings). Screenshots not read = UNVERIFIABLE for that screen, never PASS.` Add to the output block after `EMPIRICAL:` a line `SCREENSHOTS: <png path → what Read showed> (UI tasks)`. Remove every "390" mention.
2. `.claude/agents/hub-implementer.md`: under `## Verification loop`, append: `UI tasks: after the gates pass, screenshot each changed screen at 1440x900 and 430x932 (webapp-testing skill, test-results/), Read the images, fix visible defects before reporting; list the PNG paths in the report under Gates.` (No tool change; implementer has all tools.)
3. `docs/agentic/trace-check.sh`: rewrite to read task files, same two sections and same output format. Features-without-task: `grep -lE '^trace: ".*\bF-N\b' tasks/[0-9]*.md` per feature (`F-N` from FEATURES.md). DONE-features-without-test: for each `tasks/*.md` with a `status: "DONE"` line, extract `F-\d+` from its `trace:` line, same spec-file grep as today. Header comment: `FEATURES.md <-> tasks/*.md <-> tests`. No `TASKS.md` reference remains.
- Verify: gates S10, S12, E8.

### Batch 9 — workflow docs (3 files)
1. `.claude/commands/do.md`: step 1 "Resolve task": replace PROGRESS/`analysis/task-breakdown.md` matching with: empty `$ARGUMENTS` → next `todo` line in `tasks/INDEX.md` by priority; otherwise match id/slug in INDEX; open ONLY that task file. Step 3 "Mark `[~]`" → `python3 tools/task.py start <id> --spec <spec>` is run right after Stage 0 produces the spec (move wording: after Stage 0, before Stage A). Add per-stage: orchestrator runs `python3 tools/task.py log <id> "<stage> <verdict>"` after each stage. Stage F/memory: `python3 tools/task.py done <id> --gate-pass "<one-line note>"` only after gatekeeper PASS. Note: require-task blocks apps/packages edits unless the FOCUSED task (`tasks/.focus`, set only by `start`) is IN_PROGRESS with an existing build spec; `start` on a new task moves focus (the old task keeps its status); `done`/`status` on the focused task clears focus, so the next task needs its own `start`.
2. `.claude/commands/start.md`: step 1/3/4 read `tasks/INDEX.md` (not `analysis/task-breakdown.md`); next tasks = first `todo`/`wip` lines; mention the session-start hook already printed Focus/Next.
3. `Workflow.md`: pipeline box 0: `read PROGRESS.md + tasks/INDEX.md → pick task → open that one task file`; Stage 1 box: add `orchestrator then runs task.py start <id> --spec <spec>`; add a short "Backlog" subsection (5 lines max): file-per-task, INDEX generated, agents read INDEX + one file, append changelog via `task.py log`.
- Verify: gate S13b; `grep -n "task-breakdown" .claude/commands/{do,start}.md` has no "next task" usage left (historical phase-ACs mention may remain for ACs only).

### Batch 10 — remaining docs + changelog (3 files)
1. `docs/agentic/PROCEDURES.md`: §3 component map: add rows for `block-git-push`, `protect-paths`, `require-task`, `session-start` (hooks), `tools/task.py` (CLI), `docs/memory/pitfalls/` (memory); one line under the hooks section about `HUB_PUSH_CONFIRMED=1` and `HUB_SKIP_TASK_GATE=1`.
2. `planning/ENGINEERING_STANDARDS.md` line ~46: `TASKS.md` → `tasks/*.md`: "lists DONE task files' features with no tagged test, and Features with no task".
3. `.claude/CHANGELOG.md` (new): first line = bump rule (D10), then
```
## 0.1.0 — 2026-10-25
- New hooks (PreToolUse/SessionStart): block-git-push (marker HUB_PUSH_CONFIRMED=1), protect-paths (.env*, .git/, existing prisma migrations, root TASKS.md), require-task (apps/**+packages/** need the single FOCUSED task - tasks/.focus, set only by task.py start - to be IN_PROGRESS with an existing build spec; escape HUB_SKIP_TASK_GATE=1, user-set, logged), session-start briefing.
- New CLI tools/task.py (show/start/log/done/status/new/index/brief; start sets the one focus, done/status clear it); backlog is now tasks/NNN-slug.md + generated tasks/INDEX.md; TASKS.md is a deprecated pointer.
- New typed memory docs/memory/pitfalls/ (5 seeded pitfalls + INDEX.md).
- hub-tester/hub-implementer: screenshot 1440x900 + 430x932 and READ them for UI tasks.
- Why: 5 recurrences of "reasoned but not logged", accidental-push risk, token cost of the 12 KB monolith, no mechanical task gate.
```
- Verify: gate S11.

### Batch 11 — require-task hook (2 files; LAST code batch, still unwired)
1. `tools/tests/test-require-task.sh` (new; fixtures + cases §8.4; RED first).
2. `.claude/hooks/require-task.py` (new). Functions: `focused_task(root) -> bool` (D5 REV 2: read `tasks/.focus`, int, glob `tasks/%03d-*.md`, parse that ONE file, require status IN_PROGRESS + existing spec; every failure incl. missing/garbage `.focus` or a corrupt target file -> False; other task files are never read), `in_product(path, root)`, `bash_writes_product(cmd, cwd, root)` (D8; reference implementation verified by planner against the §8.4 Bash allow/block table: tokenizer as D3 over `strip_heredocs(cmd)`, `segments`, `prod(arg, cwd)` = normpath join cwd, first rel segment in {apps,packages}, len>1, no artifact segment; the python/node rule uses the raw command), `bypass(tool, what, root)` (D6), `main`. Block message (stderr): `Blocked by hub harness: no focused task. Product code (apps/, packages/) changes only inside the ONE focused task (tasks/.focus), which must be IN_PROGRESS with a build spec. Orchestrator: python3 tools/task.py start <id> --spec docs/agentic/build-specs/<file>.md (spec comes from hub-planner; this focuses the task). Human-only escape: HUB_SKIP_TASK_GATE=1 (logged to RUNLOG).` Docstring documents exit codes, the focus predicate (D5), escape hatch, logging, and the D8 ceiling.
- Verify: `bash tools/tests/test-require-task.sh`; corpus sweep E4.

### Batch 12 — settings.json wiring (1 file; orchestrator applies or implementer with user approval; planner does not edit it)
Edit `.claude/settings.json`: keep existing `PostToolUse` and `Stop` blocks byte-identical; add under `hooks`:
```json
"SessionStart": [
  { "hooks": [ { "type": "command",
      "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh\"",
      "statusMessage": "Loading hub session state" } ] }
],
"PreToolUse": [
  { "matcher": "Bash",
    "hooks": [
      { "type": "command", "command": "python3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/block-git-push.py\"", "statusMessage": "Checking git push guard" },
      { "type": "command", "command": "python3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/require-task.py\"", "statusMessage": "Checking active task" } ] },
  { "matcher": "Edit|Write|MultiEdit|NotebookEdit",
    "hooks": [
      { "type": "command", "command": "python3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/protect-paths.py\"", "statusMessage": "Checking protected paths" },
      { "type": "command", "command": "python3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/require-task.py\"", "statusMessage": "Checking active task" } ] }
]
```
and extend `permissions.allow` with `"Bash(python3 tools/task.py:*)"` and `"Bash(bash tools/tests/:*)"`. Notes: (a) hook edits to settings may need `/hooks` review or a NEW session to take effect, so the live smoke E7 must run in a fresh session; (b) this is a "major"-class wiring change but is part of the 0.1.0 initial adoption. Pre-condition: batches 1-11 all PASS; `python3 -c "import json;json.load(open('.claude/settings.json'))"` exits 0 after edit.
- Verify: S8, E7.

### Batch 13 — orchestrator-applied memory/doc edits (CLAUDE.md, DECISIONS.md, PROGRESS.md — implementer is forbidden these; stakeholder authorized CLAUDE.md edits here)
Exact text §6 (CLAUDE.md), §9 (DECISIONS, PROGRESS). Order: after Batch 12 live smoke passes. Then `python3 tools/task.py done 45 --gate-pass "..."` only after gatekeeper PASS.

Regression surface (REV 2 adds: `tools/task.py` + `tools/tests/test-task.sh` reworked after being built - re-run all of test-task.sh; `tasks/INDEX.md` gains a `Focus:` line, so any consumer parsing INDEX must ignore non-row lines (trace-check reads task files, not INDEX); `session-start.sh` output text `Active:` -> `Focus:`): `.claude/settings.json` (all tool calls now pass through hooks — every future subagent edit/Bash); `docs/agentic/trace-check.sh` (CI/ENGINEERING_STANDARDS reference); CLAUDE.md/Workflow/do/start prose that told agents to read TASKS.md; the existing Stop hook and obsidian PostToolUse hook (must still fire); `lint-staged`/`format:check` (tasks/, tools/ contain no ts/js/json/yml; `*.md` ignored by prettier; `.py`/`.sh` untouched) — re-run `pnpm lint && pnpm format:check`.

## 4. Backlog format (authoritative)

### 4.1 Layout
`tasks/NNN-slug.md` (NNN = zero-padded 3-digit id), `tasks/INDEX.md` (generated), `docs/agentic/archive/TASKS-2026-10-25.md` (verbatim old monolith, read-only history), `TASKS.md` (pointer).

### 4.2 Task file template (frontmatter order fixed; every key always present)
```
---
id: 41
title: "Dev infra: `infra/docker-compose.dev.yml` full containerized parity ..."
goal: "Reduced tool sprawl"
source: "User 2026-09-14"
priority: 1
status: "IN_PROGRESS"
trace: ""
sprint: "—"
deps: []
build_spec: "docs/agentic/build-specs/2026-09-14-dev-infra-full-parity.md"
started: "2026-09-14"
completed: ""
agents: "hub-planner→hub-implementer"
---
# #41 <title>

## Description / AC
<verbatim original Task cell from TASKS.md; for new tasks: description + acceptance criteria. Migrated rows record no ACs in TASKS.md — do not invent; AC source is planning/EPICS.md or analysis/task-breakdown.md for the trace/phase named above.>

## Build spec
- <path> (or `none yet`)

## Changelog
- <YYYY-MM-DD> <entry>      (append-only; newest last)

## Completion notes
—
```
Enums: `status` ∈ TODO|IN_PROGRESS|DONE|BLOCKED|FAILED; `priority` 1=🔴 urgent, 2=🟡 soon, 3=🟢 nice; `trace` = `E-NN/F-NN` or `""`; `deps` = JSON int array.

### 4.3 INDEX.md exact format (generated; header text fixed)
```
<!-- GENERATED by `python3 tools/task.py index` - do not edit by hand -->
# Task index
Open rows: id|status|prio|trace|title|deps   status: todo wip blk fail   prio: 1 urgent 2 soon 3 nice   deps: ids joined by +
Done rows: id|trace|title
Read ONLY the one task file you need: tasks/<id3>-<slug>.md. CLI: python3 tools/task.py show|start|log|done|status|new|index|brief
Focus: #45
## Open
2|todo|1|E-07/F-28|User CRUD + activate/deactivate + admin-mediated reset|
41|wip|1||Dev infra: `infra/docker-compose.dev.yml` full containerized parity|
## Done
1|E-07/F-27|Auth module: login, JWT access(1d)/refresh(7d), argon2id, lockout
```
Focus line (REV 2): `Focus: #<id>` when `tasks/.focus` holds an int, else `Focus: none`; it sits between the header block and `## Open`, is the only focus marker in INDEX (rows are unmarked), and counts toward the 7000-byte budget (negligible). Title in INDEX = `title` with `|`→`/`, truncated to 72 chars + `…`. Open sorted by id; Done sorted by id. Budget: INDEX.md ≤ 7000 bytes (old monolith 12359 bytes, ~70% of which was the Completed Tasks prose).

### 4.4 Slug rule
`re.sub(r"[^a-z0-9]+","-", title.lower().replace("`","")).strip("-")[:40].rstrip("-")`; file = `%03d-%s.md`.

### 4.5 Changelog entry rules
Append-only; every entry `- YYYY-MM-DD ...`; stage entries by orchestrator: `- 2026-10-25 [plan] spec written`, `[build] batch N PASS`, `[review] ...`, `[test] ...`, `[code-review] ...`, `[gate] PASS`.

### 4.6 TASKS.md pointer (exact content, replaces the file)
```
# TASKS.md — RETIRED (2026-10-25). DO NOT ADD ROWS HERE.
Backlog = one file per task: tasks/NNN-slug.md, indexed by tasks/INDEX.md. Create: `python3 tools/task.py new "<title>" --goal G --prio N`; update: `task.py log|start|done`.
Plugin skills (architect/manager/epics/clickup-log) that say "write TASKS.md" must write tasks/ files instead. Old monolith: docs/agentic/archive/TASKS-2026-10-25.md (read-only).
```

## 5. Migration rules (deterministic; for the scratchpad script)

5.1 Parse the archive file. Open table = lines matching `^\| \d+ \|` before the `## Completed Tasks` heading: strip leading `| ` / trailing ` |`, split on `" | "`; MUST yield exactly 10 cells `(#, Task, Goal, Source, Priority, Sprint, Status, Agent, Started, Completed)` else abort. Completed table = `^\| (\d+(\+\d+)?) \|` after the heading: exactly 4 cells `(#, Task, Completed, Notes)` else abort. Expect 44 open rows (ids 1..44) and 3 completed rows (`1`, `41+42`, `39`).
5.2 Field mapping: `id`=int(#); `title` = Task cell with a ` [E-NN/F-NN]` tag removed, then text before the first `" — "` if any; `trace` = tag contents or `""`; `goal`,`source`,`sprint` verbatim; `priority` 🔴→1 🟡→2 🟢→3; `status` = first token after the leading emoji in the Status cell (TODO/IN_PROGRESS/DONE); `agents` = Agent cell with `—`→`""`; `started`/`completed` with `—`→`""`; `deps` = `[]` for all (the old table had no deps column — do not invent; see Assumption A3); `build_spec` from this fixed map, each path asserted to exist: 1→`docs/agentic/build-specs/2026-09-13-auth-module.md`; 39→`.../2026-10-25-repo-tooling.md`; 41→`.../2026-09-14-dev-infra-full-parity.md`; 42→`.../2026-09-13-infra-dev-prod.md`; all others `""`.
5.3 Body: `## Description / AC` = the verbatim Task cell (backticks etc. untouched). `## Build spec` = path or `none yet`; #41 additionally lists `docs/agentic/build-specs/2026-09-13-infra-dev-prod.md` (original #41+#42 spec). `## Changelog` entries in order: (a) `- <started> started (migrated from TASKS.md)` if started; (b) `- <completed> DONE (migrated from TASKS.md)` if completed; (c) if the Status cell has text beyond the bare label (only #41), `- 2026-10-25 [migration] status cell verbatim: <cell>`; (d) for #41 also `- 2026-10-25 [migration] original #41+#42 completion note lives in #42 Completion notes; #41 reopened per DEC-086`; (e) last: `- 2026-10-25 [migration] migrated from TASKS.md row #<id> (archive: docs/agentic/archive/TASKS-2026-10-25.md)`. `## Completion notes` = the Notes cell verbatim for completed ids 1, 39 and (the `41+42` row) **42**; others `—`. Assert each completed row's Completed date equals the open row's Completed (for 41+42: the date equals #42's).
5.4 Lossless check (scratchpad, run before TASKS.md is replaced): re-parse the archive; for each of 44 rows assert in the generated file: Task cell verbatim in Description; goal/source/sprint/agent strings in frontmatter; priority mapping; status; started/completed; #41 status cell text verbatim in changelog; each Notes cell verbatim in the right Completion notes; `len(glob('tasks/[0-9][0-9][0-9]-*.md')) == 45` (44 + #45) ; print `LOSSLESS OK 44/44`.

## 6. CLAUDE.md edits (stakeholder-directed; orchestrator applies in Batch 13, exact)

E-1 Authoritative Documents table: line for `analysis/task-breakdown.md` — replace `superseded as the active backlog by \`TASKS.md\`` with `superseded as the active backlog by \`tasks/INDEX.md\``. Replace the whole `| \`TASKS.md\` | Active backlog — 38 epic-derived tasks ... |` row with:
`| \`tasks/INDEX.md\` + \`tasks/NNN-slug.md\` | Active backlog, one file per task (frontmatter + Description/AC + Build spec + append-only Changelog + Completion notes). INDEX = one line per task, generated by \`python3 tools/task.py index\`. Read INDEX + only the task file you need. \`TASKS.md\` is a retired pointer (2026-10-25, DEC-093) — never add rows there. |`
Add rows: `| \`docs/memory/pitfalls/INDEX.md\` | Typed pitfall memory (one raw .md per pitfall; skim at session start; not vault-ingested) |` and `| \`.claude/VERSION\` + \`.claude/CHANGELOG.md\` | Harness version + bump rule (patch wording / minor new hook-skill-memory-CLI / major settings.json hook wiring) |`.
E-2 Session Protocol: item 0: append ` The SessionStart hook prints branch/dirty/stash/ahead-behind + the Focus task and Next tasks.` Item 1 → `Read \`docs/memory/PROGRESS.md\` for live status, then \`tasks/INDEX.md\` (not \`analysis/task-breakdown.md\`) for the next \`todo\` task, priority + dependency order; open ONLY that task's file. Skim \`docs/memory/pitfalls/INDEX.md\`.` Item 4 → `After finishing work: append stage entries to the task file (\`python3 tools/task.py log <id> "..."\`), close it with \`task.py done <id> --gate-pass "..."\` only after the gatekeeper PASS, tick \`PROGRESS.md\`, append notable decisions to \`DECISIONS.md\` (never rewrite history there).` Item 2 skill list: unchanged.
E-3 Delegation Rules: add rule 6: `6. **Task file = unit of record; exactly one task is focused.** After the planner's spec exists, the orchestrator runs \`python3 tools/task.py start <id> --spec <build-spec>\` BEFORE delegating Build; \`start\` sets the single focus (\`tasks/.focus\`) and moves it off any previously focused task without changing that task's status. \`require-task\` blocks Edit/Write/Bash writes under \`apps/\` and \`packages/\` unless the focused task is IN_PROGRESS with an existing build spec; \`done\`/\`status\` on the focused task clears focus, so the next task needs its own \`start\`. Every stage appends via \`task.py log\`. Escape hatch \`HUB_SKIP_TASK_GATE=1\` is set only by the human in the launching shell; the hook logs each bypass to RUNLOG and the orchestrator records the user's reason. Plugin commands that say "write TASKS.md" write \`tasks/\` files instead (use \`task.py new\`).`
E-4 Guardrails, last bullet (NEVER push): append ` Enforced by \`.claude/hooks/block-git-push.py\`: only after the user's explicit push instruction, the orchestrator prefixes the command with \`HUB_PUSH_CONFIRMED=1\` and appends a RUNLOG line quoting the user's words.`
E-5 Non-Negotiables and every other line: unchanged.

## 7. Repo references to TASKS.md (grep 2026-10-25) — action per file

UPDATE: `CLAUDE.md` (3 refs, §6); `docs/agentic/trace-check.sh` (4 refs, Batch 8); `planning/ENGINEERING_STANDARDS.md` (1, Batch 10); `.claude/commands/do.md` + `start.md` (no literal `TASKS.md` but read `analysis/task-breakdown.md` as the backlog; Batch 9); `Workflow.md` (Batch 9); `docs/agentic/PROCEDURES.md` (Batch 10); `docs/memory/PROGRESS.md` (Current Focus "Backlog:" and "Next task:" lines + session row, §9); `docs/memory/DECISIONS.md` (new entries, §9).
LEAVE (historical or inert): all existing `DECISIONS.md` entries (append-only); `docs/adr/0013-*.md`; build specs `2026-09-13-auth-module.md`, `2026-09-13-infra-dev-prod.md`, `2026-09-14-dev-infra-full-parity.md`, `2026-10-25-repo-tooling.md`; `infra/scripts/{smoke,deploy}.sh`, `infra/docker-compose.prod.yml`, `infra/.env.prod.example`, `infra/nginx/default.conf.template` (comments `TASKS.md #40/#43` stay resolvable: ids are stable, `tasks/040-*`, `tasks/043-*`); `planning/project.config.yaml` (3 refs; `task_log: TASKS.md` now names the pointer — D13); `docs/memory/wiki/index.md` line 61 (vault: mutation needs a reviewed `/claude-obsidian:save`; stale entry harmless — list in the report for the user). Plugin cache files: not ours, untouched.

## 8. Pipe-test case tables (real PreToolUse payload shape)

Payload builder used by all four hook tests (python, so quoting/newlines are exact):
`{"session_id":"s","transcript_path":"/tmp/t.jsonl","cwd":"<PWD>","hook_event_name":"PreToolUse","tool_name":"<Bash|Edit|Write|MultiEdit|NotebookEdit|Read>","tool_input":{"command":"..."|"file_path":"..."|"notebook_path":"..."}}`. Each case: name, expected exit, payload; the script asserts the exit code AND, for blocks, that stderr is non-empty and starts with `Blocked by hub harness`; for allows, that stdout and stderr are empty (exception: bypass case). Test scripts print a summary `N passed, M failed` and `exit 1` if M>0.

### 8.1 block-git-push (exit 2 = BLOCK, 0 = ALLOW)
BLOCK: `git push` · `git push origin main` · `git -C /tmp/x push` · `git -c user.name=a push --force` · `git --git-dir=.git push` · `cd apps && git push` · `git add -A && git commit -m x && git push` · `git status; git push` · `echo ok | git push` · `(git push)` · `bash -c 'git push origin main'` · `sudo git push` · `env FOO=1 git push` · `/usr/bin/git push` · `HUB_PUSH_CONFIRMED=0 git push` · `$'git commit -m ok\ngit push'` · `if true; then git push; fi` · `HUB_PUSH_CONFIRMED=1 git status && git push` (marker on a different segment) · `eval "git push"` · `git push --dry-run` · `x=1 git push`.
ALLOW: `HUB_PUSH_CONFIRMED=1 git push origin main` · `env HUB_PUSH_CONFIRMED=1 git push` · `HUB_PUSH_CONFIRMED=1 git -C x push` · `git commit -m "document git push policy"` · `git commit -m "a; git push"` · `$'git commit -m "$(cat <<\'EOF\'\nfix: never git push\nwon\'t\nEOF\n)"'` (heredoc with apostrophe) · `echo "git push"` · `grep -rn "git push" CLAUDE.md` · `git status` · `git log --oneline -5` · `git pull --rebase` · `git stash` · `git remote -v` · `git diff HEAD~1` · `pnpm --filter api test` · `$'cat <<\'EOF\' > f\ndon\'t git push\nEOF'` · `git branch --set-upstream-to=origin/main` · `gh pr view` · `git config alias.p push` · `git commit --amend -m push` · `git log --grep='git push'` · empty command `""` · unterminated quote `echo 'unterminated` · tool_name `Edit` with a `file_path` · stdin `not json` · stdin `{}`.

### 8.2 protect-paths (paths absolute under the repo; cases through a throwaway fixture where a file must "exist")
BLOCK: `<repo>/.env` · `infra/.env.dev` · `apps/api/.env` · `infra/.env.prod` · `.env.local` · `apps/web/.env.production` · `.git/config` · `.git/hooks/pre-commit` · `apps/api/prisma/migrations/20260913091033_init_auth/migration.sql` (exists) · `apps/api/prisma/migrations/migration_lock.toml` (exists) · NotebookEdit `notebook_path` `.env` · relative `file_path` `.env` with payload cwd=repo · `TASKS.md` at repo root (R4) · MultiEdit on `.env`.
ALLOW: `infra/.env.dev.example` · `infra/.env.prod.example` · `.env.example` · `.envrc` · `.gitignore` · `.github/workflows/ci.yml` · `.gitattributes` · `.husky/pre-commit` · `foo.git/bar` (tmp) · `apps/api/prisma/migrations/20991231000000_new_thing/migration.sql` (does not exist) · `apps/api/prisma/schema.prisma` · `docs/memory/PROGRESS.md` · `tasks/INDEX.md` · `packages/shared/src/x.ts` · `docs/envs.md` · `environment.md` · `docs/agentic/archive/TASKS-2026-10-25.md` · payload without file_path · stdin `not json` · tool_name `Read`.

### 8.3 session-start
Run in repo: exit 0; `wc -l` ≤ 15; line 1 matches `^\[hub-harness 0\.1\.0\] branch=`; contains `dirty=` and `stashes=`; contains `Focus:` and `Next:` (and no `Active:`); contains `tasks/INDEX.md`. Run with `CLAUDE_PROJECT_DIR` = empty temp dir (no git): exit 0, ≤ 3 lines, no traceback. Run in a temp git repo without `tools/task.py`: exit 0, no traceback. Run in a temp clone with an upstream 1 ahead / 0 behind: output contains `1 ahead / 0 behind`.

### 8.4 require-task (hook env `CLAUDE_PROJECT_DIR=$FIX`; fixtures built in a temp dir; tasks written with `python3 tools/task.py`-compatible frontmatter by hand in the test)
Fixtures (REV 2; `.focus` = `tasks/.focus`): F-A no `tasks/` dir · F-B tasks with only TODO and DONE (DONE has a real spec), no `.focus` · F-C `.focus`=N -> IN_PROGRESS task whose `build_spec` points to a missing file · F-D `.focus`=N -> IN_PROGRESS task with an existing spec (plus a corrupt file `tasks/999-bad.md` with no frontmatter) · F-E two valid IN_PROGRESS tasks (spec exists), `.focus` -> one of them · **F-F valid IN_PROGRESS task with an existing spec but NO `.focus` file (the #41-unfocused case) · F-G `.focus` -> a DONE task (spec exists) · F-H `.focus` = `abc`, and variant `.focus` -> id with no task file, and variant empty `.focus` · F-I `.focus` -> IN_PROGRESS task with `build_spec: ""`** · F-J two IN_PROGRESS valid tasks, `.focus` -> a TODO task (focus on the wrong status).
BLOCK under F-A, F-B, F-C, F-F, F-G, F-H (all 3 variants), F-I, F-J (each; F-F, F-G, F-J are the REV 2 "IN_PROGRESS-but-unfocused" / "focus on a non-IN_PROGRESS task" blockers): Edit `apps/api/src/x.ts` · Write `packages/shared/src/y.ts` · MultiEdit `apps/web/app/page.tsx` · NotebookEdit `apps/a.ipynb` · Bash `sed -i 's/a/b/' apps/api/src/main.ts` · `sed -i '' 's/a/b/' apps/api/x` · `echo x > packages/shared/foo.ts` · `tee apps/api/x.ts` · `cp /tmp/a apps/api/src/a.ts` · `mv apps/a apps/b` · `rm apps/api/src/a.ts` · `perl -pi -e 's/a/b/' apps/web/x.ts` · `cat x | tee -a packages/shared/y.ts` · `python3 -c "open('apps/api/x','w').write('1')"` · payload cwd=`$FIX/apps/api` with `echo x > src/a.ts` · `cd apps/api && echo x >> src/a.ts` · `$'cat > apps/api/x.ts <<\'EOF\'\ndon\'t\nEOF'`.
ALLOW under every fixture F-A..F-J (each): Edit `docs/memory/PROGRESS.md` · Edit `CLAUDE.md` · Write `.claude/hooks/x.py` · Write `tasks/001-x.md` · Edit `infra/docker-compose.yml` · Write `docs/agentic/build-specs/x.md` · Edit root `package.json` · Edit `eslint.config.mjs` · Edit `planning/EPICS.md` · Bash `pnpm --filter api test` · `git status` · `cat apps/api/src/main.ts` · `grep -rn foo apps/` · `ls apps/ packages/` · `cp apps/api/src/a.ts /tmp/a.ts` · `echo hi > /tmp/x` · `rm -rf apps/api/dist` · `rm -rf apps/web/.next` · `rm -rf apps/api/node_modules` · `sed -n 1,5p apps/api/src/main.ts` · `pnpm --filter @hub/shared build` · `git commit -m "fix apps/api bug"` · `echo x > docs/a.md` · `pnpm test 2>&1 | tail -5 > /dev/null` with cwd `$FIX/apps/api` · `echo hi > out.txt` with cwd `$FIX/docs` · `node -e "console.log(1)"` · `python3 tools/task.py show` · `mkdir -p tasks` · `echo "a > apps/b"` · tool_name `Read` on an apps file · stdin `not json`.
FOCUSED-OK: under F-D and F-E (and BLOCK under F-A/B/C/F/G/H/I/J) the full BLOCK list above → exit 0. Focus-switch sequence test (uses the real `tools/task.py` copied into the fixture): with F-E focused on task X, run `start Y --spec S` -> BLOCK-list command still exit 0 (Y focused); then `status Y BLOCKED "t"` -> same command exit 2 (focus cleared although X is still IN_PROGRESS); then `start X` -> exit 0 again; then `done X --gate-pass ok` -> exit 2.
BYPASS: F-A with env `HUB_SKIP_TASK_GATE=1`: Edit `apps/api/src/x.ts` twice → exit 0 both times, stderr contains `BYPASS`, fixture `docs/agentic/RUNLOG.md` gains exactly ONE `require-task | BYPASS` line (dedupe); without the env var the same call → exit 2.

## 9. Memory text for the orchestrator (Batch 13)

DECISIONS.md (append, next ids DEC-093..094):
`DEC-093 · 2026-10-25 · Backlog redesigned: monolithic TASKS.md replaced by one file per task (tasks/NNN-slug.md) + generated tasks/INDEX.md + stdlib CLI tools/task.py; supersedes DEC-075's "TASKS.md is the active backlog" (stakeholder directive) · Why: the 12 KB monolith was re-read in full by every agent for one row, status/changelog/notes had no home besides ever-growing table cells, and nothing mechanically tied "task in progress" to "build spec exists". Design: frontmatter (id,title,goal,source,priority,status,trace,sprint,deps,build_spec,started,completed,agents) + Description/AC, Build spec, append-only Changelog, Completion notes; INDEX = id|status|prio|trace|title|deps (done rows collapsed to id|trace|title); \`task.py start\` requires an existing build spec, is the only command that sets the single focus (\`tasks/.focus\`, one line holding the task id), and the focused task is what the require-task hook consults. Q1 resolved by the stakeholder with option 3 ("add a focus field"): exactly ONE focused task at a time; \`start <id>\` focuses it (status -> IN_PROGRESS if not already) and moves focus off the previously focused task WITHOUT changing that task's status (both changelogs record the move); \`done\` and any \`status\` change on the focused task clear focus; chosen over a frontmatter flag because one file = exactly-one by construction and no schema/migration change; rejected parking #41 BLOCKED because that would rewrite DEC-086's recorded status. 44 rows + completed-notes migrated losslessly via a one-off scratchpad script (deleted after use per ponytail; verbatim archive at docs/agentic/archive/TASKS-2026-10-25.md; #41 stays IN_PROGRESS per DEC-086; deps left empty — the old table had none). TASKS.md is now a 3-line retired pointer and protect-paths blocks edits to it so agentic-harness plugin commands (architect/manager/epics/clickup-log, which hard-code TASKS.md) cannot recreate a monolith; planning/project.config.yaml task_log left pointing at the pointer. Pre-logged deviation (avoids the "reasoned but not logged" recurrence): Batch 2 generates 45 task files + INDEX from one script run, exceeding the 3-file delegation cap in count only (mechanical output, same shape as DEC-092). Spec: docs/agentic/build-specs/2026-10-25-harness-adoption.md. CLAUDE.md Authoritative Documents/Session Protocol/Delegation Rules edited accordingly (stakeholder-directed).`
`DEC-094 · 2026-10-25 · Harness 0.1.0 adopted from a read-only comparison with the Ryobi harness (shape only, no code copied): PreToolUse hooks block-git-push (marker HUB_PUSH_CONFIRMED=1 in the same command segment; honor-system on the orchestrator, logged in RUNLOG), protect-paths (.env* except *.example, .git/, existing prisma migrations, root TASKS.md), require-task (apps/**+packages/** edits and conservative Bash-write heuristic need an IN_PROGRESS task whose build spec exists; human-only escape HUB_SKIP_TASK_GATE=1, each bypass auto-logged to RUNLOG); SessionStart briefing; typed pitfall memory docs/memory/pitfalls/ (raw .md, outside the vault's ingest path, DEC-065 untouched); hub-tester/hub-implementer must screenshot UI at 1440x900 and 430x932 and Read the images; .claude/VERSION 0.1.0 + CHANGELOG with bump rule (patch wording / minor new hook-skill-memory-CLI / major settings.json wiring). Every hook pipe-tested against real payload shapes including allow cases, and swept against historical Bash commands for false positives (DEC-059 lesson). Known ceilings (ponytail-marked in hooks): $(...)/alias/gh pushes and non-Edit writes to protected paths are not caught; the push marker can be typed by an agent. Open: SubagentStop-based RUNLOG enforcement (DEC-059 follow-up) still deferred. Task gate keys on the focused task (D5): #41 stays truthfully IN_PROGRESS (DEC-086) but is unfocused, so the gate bites from day one; while #45 is being built it is the focused task, and `done 45` clears focus so product edits are blocked until the next `start`.`
PROGRESS.md: (1) Current Focus "Backlog:" line → `**Backlog:** \`tasks/INDEX.md\` + \`tasks/NNN-slug.md\` (DEC-093, 2026-10-25; was TASKS.md) — one file per task, 45 tasks (44 migrated + #45 harness adoption). Read INDEX + the one task file; use \`python3 tools/task.py\`.` (2) "Next task:" line → prefix with `See tasks/INDEX.md (\`todo\`/\`wip\` rows).` and keep the #41 reopened wording. (3) Append session row: `| 2026-10-25 | — | HARNESS ADOPTION 0.1.0 (#45, DEC-093/094): backlog split into tasks/NNN-slug.md + generated INDEX + tools/task.py (44 rows migrated losslessly, archive docs/agentic/archive/TASKS-2026-10-25.md); hooks block-git-push, protect-paths, require-task, session-start wired in .claude/settings.json; docs/memory/pitfalls/ seeded (5); UI screenshot rule in hub-tester/hub-implementer; .claude/VERSION+CHANGELOG. Hooks pipe-tested + corpus-swept. require-task keyed on single focus (tasks/.focus): #45 focused during build, #41 IN_PROGRESS but unfocused (Q1 option 3). |`

RUNLOG (orchestrator, per delegation, plus): `<ISO> | orchestrator | #45 batch N audit → <result>`; at Batch 12: `HUB_SKIP_TASK_GATE not used`.

## 10. Definition-of-Done gates

### 10.1 Static gates (hub-reviewer; each a command or grep)
- S1 stdlib only: `grep -hE '^(import|from) ' .claude/hooks/*.py tools/task.py | sort -u` must be a subset of the allowed set `json os re shlex sys glob datetime` (plus `from __future__`); any other module = FAIL. `grep -nE 'shell=True|os\.system|subprocess|urllib|requests|socket' .claude/hooks/*.py tools/task.py` → empty.
- S2 exit-code convention: each of the 3 blocking hooks contains a `return 2`/`sys.exit(2)` path and writes the block text with `file=sys.stderr`; no block path exits 1; every hook's `main()` returns 0 on `json.JSONDecodeError`.
- S3 docstrings: `grep -c 'Exit' .claude/hooks/{block-git-push,protect-paths,require-task}.py` each ≥1; `grep -n 'HUB_SKIP_TASK_GATE' .claude/hooks/require-task.py` ≥2 (doc + code); `grep -n 'HUB_PUSH_CONFIRMED' .claude/hooks/block-git-push.py` ≥2; `grep -n 'ponytail:' .claude/hooks/{block-git-push,require-task,protect-paths}.py` ≥1 each (ceilings marked).
- S4 CLI surface: `grep -nE "^def (cmd_)?(show|start|log|done|status|new|index|brief)" tools/task.py` → 8 matches; `done` path contains `--gate-pass`; `start` path contains an `isfile` check on the spec. REV 2: `grep -n '\.focus' tools/task.py` hits in `start`, `done`, `status`, `brief`/`build_index` paths; `grep -c '^def cmd_' tools/task.py` = 8 (no `focus` subcommand); `grep -n 'ponytail:' tools/task.py` ≥1.
- S5 migration counts: `ls tasks/[0-9][0-9][0-9]-*.md | wc -l` = 45; `grep -cE '^[0-9]+\|' tasks/INDEX.md` = 45; `python3 tools/task.py index --check` exit 0; `grep -n '^Focus: #45$' tasks/INDEX.md` hit (after Batch 2) and `cat tasks/.focus` = `45`; `wc -c tasks/INDEX.md` ≤ 7000; `shasum -a 256 docs/agentic/archive/TASKS-2026-10-25.md` = pre-flight sha `498bdbbd…f472`.
- S6 frontmatter completeness: for each key in `id title goal source priority status trace sprint deps build_spec started completed agents`: `grep -lc "^<key>: " tasks/[0-9]*.md | wc -l` = 45; each file has exactly one each of `## Description / AC`, `## Build spec`, `## Changelog`, `## Completion notes`.
- S7 specific migrated facts: `grep -n '^status: "IN_PROGRESS"' tasks/041-*.md` hit; `grep -c 'DEC-086' tasks/041-*.md` ≥1; `grep -n 'reopened' tasks/041-*.md` hit; `tasks/001-*.md`, `tasks/039-*.md`, `tasks/042-*.md` each have non-`—` Completion notes; `tasks/042-*.md` contains `node:22-alpine`; `tasks/001-*.md` contains `DEC-078`; `tasks/039-*.md` contains `DEC-090..092`; status counts: `grep -l '^status: "DONE"' tasks/*.md | wc -l` = 3 (ids 1, 39, 42); IN_PROGRESS = 2 (ids 41, 45); TODO = 40.
- S8 pointer + settings: `wc -l TASKS.md` ≤ 5 and contains `RETIRED` and `tasks/INDEX.md`; after Batch 12 `python3 - <<'X'` asserts: `.claude/settings.json` parses; `hooks.PreToolUse` has exactly 2 entries with matchers `Bash` and `Edit|Write|MultiEdit|NotebookEdit`; the Bash entry commands reference `block-git-push.py` then `require-task.py`; the edit entry references `protect-paths.py` then `require-task.py`; `hooks.SessionStart[0].hooks[0].command` references `session-start.sh`; `hooks.PostToolUse` and `hooks.Stop` byte-identical to `git show HEAD:.claude/settings.json` (compare JSON subtrees); no `"async": true` on any PreToolUse hook.
- S9 pitfalls/vault: `ls docs/memory/pitfalls/*.md | wc -l` = 6 (INDEX + 5); each of the 5 has frontmatter `name:` (== filename stem), `description:`, `type: pitfall`, and `**Why:**` and `**How to apply:**`; INDEX lists all 5 (`grep -c '](.*\.md)' docs/memory/pitfalls/INDEX.md` = 5); `grep -rn '\[\[' docs/memory/pitfalls` → empty; `git status --porcelain docs/memory/wiki docs/memory/.raw docs/memory/.obsidian docs/memory/inbox docs/memory/.claude-obsidian.json` → empty (vault untouched); deviation pitfall cites `DEC-088` and `DEC-084`; pnpm pitfall contains `corepack pnpm`; make-dev-up pitfall contains `infra/.env.dev.example`; e2e pitfall contains `@hub/shared build`.
- S10 screenshot rule: `grep -nE '1440' .claude/agents/hub-tester.md` and `grep -nE '430' .claude/agents/hub-tester.md` hit; `grep -n '390' .claude/agents/hub-tester.md` → empty; `grep -n 'READ' .claude/agents/hub-tester.md` hit; `grep -n 'SCREENSHOTS:' .claude/agents/hub-tester.md` hit; `grep -nE '1440.*430|430.*1440' .claude/agents/hub-implementer.md` hit; frontmatter `tools:` line of hub-tester unchanged (still includes Read, Bash, Skill; no new tools).
- S11 version: `cat .claude/VERSION` = `0.1.0`; `.claude/CHANGELOG.md` first non-title line states patch/minor/major rule containing `settings.json`; contains `## 0.1.0 — 2026-10-25` listing all of: block-git-push, protect-paths, require-task, session-start, task.py, pitfalls, screenshot.
- S12 trace-check: `grep -n 'TASKS.md' docs/agentic/trace-check.sh` → empty; `bash docs/agentic/trace-check.sh` exit 0.
- S13 CLAUDE.md (after Batch 13): `grep -n 'tasks/INDEX.md' CLAUDE.md` ≥3; `grep -n 'HUB_PUSH_CONFIRMED' CLAUDE.md` ≥1; `grep -n 'HUB_SKIP_TASK_GATE' CLAUDE.md` ≥1; `grep -n 'task.py start' CLAUDE.md` ≥1; every remaining `TASKS.md` line in CLAUDE.md is in a retirement/pointer context (reviewer reads them); Non-Negotiable Rules 1-9 byte-identical to HEAD (`git diff -U0 CLAUDE.md` shows no change inside that section). S13b: `grep -n 'tasks/INDEX.md' .claude/commands/do.md .claude/commands/start.md Workflow.md` hits each; `grep -n 'task.py' .claude/commands/do.md` ≥3.
- S14 batch hygiene: per batch `git diff --name-only`/`git status --short` shows ≤3 hand-authored files (Batch 2 exempt per D14/DEC-093); no stray `package.json`, no `.py` outside `.claude/hooks/` and `tools/`; no scratch files (`migrate_tasks.py`, `proto`) in the repo (`git status --short | grep -E 'migrate|proto|scratch'` empty); executable bit on `session-start.sh`; no edits to `apps/**`/`packages/**`/`infra/**`.
- S16 focus gate wiring (REV 2): `grep -nE 'IN_PROGRESS' .claude/hooks/require-task.py` hits only inside the single-task focus check (no loop over all task files for status: `grep -nE 'glob.*\[0-9\]' .claude/hooks/require-task.py` empty or only the one `%03d-*` lookup); `grep -n '\.focus' .claude/hooks/require-task.py` ≥2; block text contains `no focused task`; CLAUDE.md rule 6 text contains `focus`; no remaining `Active:` in `tools/task.py`, `.claude/hooks/session-start.sh`, `tools/tests/*.sh` (`grep -rn 'Active:' tools .claude/hooks` empty).
- S15 untouched protected surfaces: `git diff --stat -- .claude/hooks/obsidian-memory-sync.sh apps packages infra` empty.

### 10.2 Empirical gates (hub-tester; run commands, observe output; no internal assertions)
- E1 task CLI lifecycle (`bash tools/tests/test-task.sh`, all PASS; the script must cover): `new` creates `001-<slug>.md` and INDEX row `1|todo|<p>||<title>|`; `new` without `--goal` exit 1; `start 1` with no spec exit 1 and status unchanged; `start 1 --spec <nonexistent>` exit 1; `start 1 --spec <real file>` exit 0, file shows `status: "IN_PROGRESS"`, `started` = today, INDEX row `wip`; second `start 1` "already focused" exit 0; `log 1 "msg"` appends `- <today> msg` inside `## Changelog` before `## Completion notes`, earlier entries intact (append-only: the byte prefix of the file before the insertion point unchanged); `done 1` without flag exit 1; `done 1 --gate-pass ""` exit 1; `done 1 --gate-pass "ok"` exit 0, DONE, `completed` today, INDEX row moved to `## Done` as `1||<title>` (3-field form), Completion notes contains `ok`; `start 1` on DONE exit 1; `status 2 BLOCKED "why"` sets blk row and logs; unknown id exit 1; `index --check` exit 0 on fresh, exit 1 after hand-editing INDEX.md, exit 0 after `index`; title with `|`, `:`, `"`, `—`, `→`, backtick round-trips (frontmatter parses back identical; INDEX shows `/` for `|`); 120-char title truncated to 72+`…` in INDEX, full in file; `brief` prints `Focus: none` then after a `start` prints `Focus: #<id>` (and never `Active:`); `Next:` lists TODOs ordered priority-then-id, max 3; corrupt task file does not crash `index`/`brief` (skipped with stderr warning).
- E1b focus semantics (REV 2; the new Batch 1 REWORK cases B1-B10 must all PASS and cover): one `.focus` after `start`; `start` second task moves focus and leaves the first IN_PROGRESS with a `[focus] focus moved to #N` changelog line; `start` on an unfocused IN_PROGRESS task refocuses; `start` refusals (DONE, missing spec) write nothing and keep focus; `done`/`status` on the focused task clear `.focus`, on a non-focused task keep it; stale/garbage `.focus` -> `Focus: none` with no crash; INDEX `Focus:` line follows `.focus` and `index --check` detects drift.
- E2 real-repo migration invariants: `python3 tools/task.py brief` prints exactly one `Focus: #45 ...` line (and NOT #41; no `Active:`), `cat tasks/.focus` = `45`, `python3 tools/task.py show 41` still shows `IN_PROGRESS`, and `Next:` `#2`,`#3`,`#4`; `python3 tools/task.py show 41` contains `IN_PROGRESS` and `DEC-086`; `python3 tools/task.py show 1` has Completion notes with `DEC-078`; token budget: `wc -c tasks/INDEX.md` < 7000 and `wc -c tasks/INDEX.md tasks/002-*.md` sum < 40% of 12359 (corrected 2026-10-25, DEC-093: the original 25% was an arithmetic slip against the 7000-byte INDEX budget; measured 35%); INDEX line for a done row has exactly 2 `|` and an open row exactly 5 `|`.
- E3 hook pipe tests (all must pass; run each, report counts): `bash tools/tests/test-block-git-push.sh` (cases §8.1: 21 BLOCK, ≥27 ALLOW), `bash tools/tests/test-protect-paths.sh` (§8.2), `bash tools/tests/test-session-start.sh` (§8.3), `bash tools/tests/test-require-task.sh` (§8.4 incl. bypass + dedupe). Each prints `0 failed`.
- E4 false-positive corpus sweep (the DEC-059 lesson; scratch script, not committed): extract every Bash `tool_use` `input.command` and every Edit/Write/MultiEdit `file_path` from the real transcripts under `~/.claude/projects/-Users-mdshakilurrahman-Documents-projects-Personal-polyhub/*.jsonl` (python: for each line, json, walk `message.content[]` where `type=="tool_use"`); feed each as a PreToolUse payload to `block-git-push.py`, `protect-paths.py` and `require-task.py` under fixture F-D (focused task present) and report every exit-2. Expected: block-git-push exits 2 ONLY on commands that genuinely contain an unconfirmed `git push` (tester reads each hit and classifies; any hit that is merely text inside a quoted/heredoc string = FAIL → derived task); protect-paths hits only genuine `.env`/`.git`/migration/`TASKS.md` writes (classify each); require-task under F-D = 0 blocks. Also run require-task under F-A and classify every block: any block on a command/path outside apps/packages = FAIL. Report corpus size (N commands/paths).
- E5 session-start live: `CLAUDE_PROJECT_DIR=$PWD bash .claude/hooks/session-start.sh` — ≤15 lines; `dirty=` equals `git status --short | wc -l`; `stashes=` equals `git stash list | wc -l`; `HEAD=` equals `git log -1 --format='%h'`; ahead/behind equals `git rev-list --left-right --count @{u}...HEAD` (or `no upstream`); Focus/Next lines match E2; runtime < 1.5 s (`time`); with `tools/task.py` temporarily renamed in a COPY of the tree, still exit 0.
- E6 trace-check parity: `bash docs/agentic/trace-check.sh > <scratch>/trace-after.txt; diff <scratch>/trace-before.txt <scratch>/trace-after.txt` → empty (same two sections, same lines; before-file captured in pre-flight).
- E7 live smoke in a FRESH session after Batch 12 (settings take effect only after `/hooks` review or restart; if the tester cannot start a fresh session report UNVERIFIABLE with the exact manual steps for the user, never PASS): (a) the SessionStart briefing appears at session start; (b) `git push` attempted via the Bash tool → blocked with the `Blocked by hub harness` message, and `git status` still allowed; `HUB_PUSH_CONFIRMED=1 git push --dry-run` is NOT executed by the tester (tester never pushes — use `git push` blocked-only check and the pipe test for the allow side); (c) Edit tool on `.env.example` allowed (then reverted/no change) and on a scratch `.env.probe` blocked — use Write to a nonexistent `<repo>/.env.probe` expecting block, nothing created; (d) do NOT mutate real tasks: verify live only that an Edit to a scratch `apps/api/<scratch>.txt` is ALLOWED while #45 is the focused task (create, then delete the scratch), and that `/hooks` lists the pre-existing Stop and PostToolUse hooks alongside the new ones. The no-task block path is covered by E3/E4 on fixtures.
- E8 regression: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` (use `corepack pnpm` if `pnpm` is not on PATH — see pitfall) all exit 0; `git diff --stat -- apps packages infra` empty.
- E10 gate bites from day one (REV 2; scratch copy, never mutate real tasks): `T=$(mktemp -d); cp -R tasks $T/tasks; mkdir -p $T/docs/agentic; cp -R docs/agentic/build-specs $T/docs/agentic/` then pipe an `Edit` of `$T/apps/api/src/x.ts` to `.claude/hooks/require-task.py` with `CLAUDE_PROJECT_DIR=$T`: (1) with `$T/tasks/.focus`=`45` -> exit 0; (2) `rm $T/tasks/.focus` (#41 and #45 still IN_PROGRESS) -> exit 2 with `no focused task`; (3) `.focus`=`41` -> exit 0 only if #41's `build_spec` file exists in the copy (it does: 2026-09-14 spec), proving a refocus on #41 is legal; (4) `.focus`=`2` (TODO) -> exit 2.
- E9 pitfalls usability: open each pitfall file via Read and confirm the How-to-apply command is runnable verbatim where applicable: `corepack pnpm --version` exit 0; `test -f infra/.env.dev.example`; `grep -n 'dev-up' Makefile` exists.

### 10.3 Gatekeeper criteria (hub-gatekeeper, zero context; authoritative sources)
- G1 CLAUDE.md Guardrails: "NEVER push without explicit user confirmation" → block-git-push enforces; "Orchestrator never writes product code inline", "≤3 files per delegation", RUNLOG-per-delegation rules still hold; Delegation Rule 6 + Session Protocol edits are consistent with the implemented CLI (every command named in CLAUDE.md exists in `tools/task.py`).
- G2 Stakeholder requirement (verbatim intent): one file per task in `tasks/NNN-slug.md`; any task update = open that file and append a changelog entry; one INDEX referencing all tasks in a token-minimal form; completed tasks collapsed; frontmatter + the four sections; all 44 TASKS.md rows incl. Completed-Tasks notes and #41's reopened state migrated losslessly (compare archive vs files, spot-check ≥6 rows incl. 1, 39, 41, 42, 43, 44); tiny stdlib CLI with show/start/log/done/index; `start` is what require-task consults; TASKS.md can no longer silently regrow (pointer + R4); trace-check reads task files.
- G3 (plus G2 focus semantics: exactly one focused task, `start` is the only focuser, `done`/`status` clear it, previous task's status untouched, hook keys on focus) Items 1-7 each demonstrably present and matching §3 (hook exit codes 0/2, marker, protected-path rules incl. `.env.example` allowed and new-migration allowed, session-start <15 lines with Active/Next from the index, pitfalls typed with Why/How and untouched vault, require-task fail-closed only for apps/packages, keyed on the focused task, with documented + logged escape hatch, screenshot-and-READ rule at 1440 and 430, VERSION/CHANGELOG 0.1.0 with bump rule).
- G4 DEC-059 compliance: every hook has a pipe-test including allow cases and a historical-corpus false-positive sweep result recorded in RUNLOG; no hook assumes Agent-tool synchronous completion; no PreToolUse hook is `async`.
- G5 DECISIONS/PROGRESS: DEC-093/094 present and match what was built (incl. the pre-logged 45-file generated batch, the R4 addition, the #41 caveat); PROGRESS Current Focus no longer calls TASKS.md the backlog; no "reasoned but not logged" deviation (compare final diff against this spec: every deviation has a DEC).
- G6 Vault integrity (DEC-065): pitfalls are plain raw .md; `docs/memory/wiki`, `.raw`, `.obsidian`, `inbox` unchanged.
- G7 Minimal-code (CLAUDE.md Karpathy/ponytail): no new deps (`git diff package.json pnpm-lock.yaml` empty), stdlib-only Python, no abstractions beyond §3, migration script not in repo, ceilings marked `ponytail:`.
- G8 Gate not vacuous (REV 2): gatekeeper reports the focus state at gate time (`cat tasks/.focus`, which task, its status), confirms #41 is IN_PROGRESS yet unfocused (the stakeholder's option-3 intent: gate bites from day one), and confirms E10 results; informational unless E10 fails, which is a FAIL. After `task.py done 45`, `.focus` must be absent (product edits blocked until the next `start`).

## 11. Assumptions (flag if wrong)
- A1. `python3` (3.13) is on PATH for hook commands (confirmed: /opt/homebrew/bin/python3; the existing obsidian hook already uses it). Hooks use `python3` not `python3 -I`.
- A2. Claude Code passes `tool_input.file_path` (Edit/Write/MultiEdit) and `notebook_path` (NotebookEdit) as absolute paths, `tool_input.command` for Bash, and `cwd` in the payload; exit 2 + stderr feeds the model; other nonzero exits are non-blocking.
- A3. `deps` are not migrated because the old table never carried them; `brief` ranks Next by priority then id (ids were seeded in dependency order). `EPICS.md` has a "Depends on" column per task — optional follow-up to populate `deps`, out of scope here.
- A4. Subagent tool calls (hub-implementer edits) go through the same PreToolUse hooks as the orchestrator's (Claude Code applies project hooks to subagents).
- A5. `HUB_SKIP_TASK_GATE` set in the human's launching shell reaches hook processes (hooks inherit Claude Code's env).
- A6. A new priority scale (1/2/3) replaces emoji; the mapping is lossless and recorded in INDEX header and §4.2.
- A7. `.claude/` is tracked (confirmed by `git ls-files`), so VERSION/CHANGELOG are versioned with the harness.
- A8. R4 (protect-paths blocks root `TASKS.md`) is a planner addition beyond the stakeholder's 3 listed rules; it is needed for "cannot silently recreate a monolith". Drop only with the orchestrator's say-so.
- A9. `/hooks`-review/new-session requirement for settings changes (E7) — the planner could not verify hot-reload behavior.

- A10. (REV 2) `tasks/.focus` is a tracked one-line file; a stale committed focus is harmless (gate re-validates status + spec every call). Focus is per working tree, so concurrent agents share it (ponytail ceiling, single-operator repo). `protect-paths` deliberately does NOT guard `tasks/.focus` (YAGNI; the gate still needs an IN_PROGRESS task with a real spec).
- A11. (REV 2) `start`'s previous-focus changelog write is best-effort: if the previous task file is missing/corrupt it is skipped and focus still moves.

## 12. Open questions (only those that change design)
- Q1. **RESOLVED 2026-10-25 (stakeholder: "option 3: add a focus field").** Was: #41 IN_PROGRESS (DEC-086) made the gate vacuous. Now: exactly one focused task (`tasks/.focus`), gate = focused task IN_PROGRESS + spec exists; #41 stays IN_PROGRESS but unfocused; #45 is focused during build. See D5, D15, Batch 1 REWORK delta, §8.4, E10, DEC-093/094 text.

No open questions remain.
