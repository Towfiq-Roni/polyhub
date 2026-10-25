---
description: Implement the next (or given) task through the full quality chain — build → review → test → code-review → DoD gate → memory.
argument-hint: "[task]"
---

Task target: $ARGUMENTS

Execute the hub implementation loop exactly:

1. **Resolve task** — empty `$ARGUMENTS`: take the top `Next` task from `python3 tools/task.py brief` (already priority-ordered; use `tasks/INDEX.md` to check deps). Otherwise match id/slug in `tasks/INDEX.md` and confirm with me before starting. Open ONLY that one task file (`tasks/NNN-slug.md`); never read a monolithic backlog (`TASKS.md` is a retired pointer). `analysis/task-breakdown.md` is for phase ACs only.
2. **Design precondition** — if the task traces to a design in `docs/designs/`, it must be VALIDATED with a DECISIONS entry; otherwise stop and run `/req` first.

**Stage 0 — Plan:** delegate to `hub-planner` (task text + phase context + ACs verbatim). It reads the business/design requirements itself and returns a build spec (`docs/agentic/build-specs/<file>`) with ≤3-file batches and the DoD gates for this task. No build without this spec (Workflow.md hard rule 1.5). The `start` step runs here, right after the spec exists and before Stage A: run `python3 tools/task.py start <id> --spec docs/agentic/build-specs/<file>` before any product edit. The require-task hook blocks `apps/`/`packages/` edits unless the FOCUSED task (`tasks/.focus`, set only by `start`) is IN_PROGRESS with an existing build spec. `start` on a new task moves focus (the old task keeps its status); `done`/`status` on the focused task clears focus, so the next task needs its own `start`.

**Changelog:** after each stage the orchestrator runs `python3 tools/task.py log <id> "<stage> <verdict>"`.

**Stage A — Build:** delegate to `hub-implementer`, one spec batch at a time (task text + phase context + ACs + the planner's spec for that batch, verbatim). For a multi-batch spec, run each batch's build → audit yourself the file-exists/link/canonical-shell checks (CLAUDE.md §Delegation Rules) before starting the next batch.

**Stage B — Rule audit:** send diff to `hub-reviewer`. FAIL → violations back to implementer, re-audit. Max 2 cycles, then escalate to me.

**Stage C — Empirical testing:** delegate to `hub-tester`. FAIL → its DERIVED TASKS FOR DEVELOPER go back to `hub-implementer`, then tester re-runs. Max 2 cycles, then escalate.

**Stage D — Code review:** delegate to `hub-code-reviewer`.
- REVIEW CLEAN → Stage E.
- FINDINGS → apply DERIVED TASKS: code fixes to `hub-implementer` (then Stage B re-run from rule audit), test additions written by implementer then verified by `hub-tester`. BLOCKERS must clear; SUGGESTIONS are recorded in the session report but do not block. Max 1 full re-loop of B→D, then escalate to me.

**Stage E — DoD gate (context-free):** spawn `hub-gatekeeper` passing ONLY task text + AC location + diff range — never summaries or prior-stage outputs.
- PASS → Stage F.
- REROUTE-dev → findings to implementer → Stages B–E again. Max 1 re-loop.
- REROUTE-design / both → halt; amend docs via `/req`; restart at Stage 0.

**Stage F — Close:** run `pnpm lint && pnpm typecheck && pnpm test` yourself · `python3 tools/task.py done <id> --gate-pass "<one-line note>"` (only after gatekeeper PASS) · update PROGRESS.md · Session Log row · append `DEC-###` if a new decision surfaced · record any SUGGESTIONS from Stage D as new PROGRESS items if worth keeping · report files/tests/gate trace + conventional-commit suggestion. Do not commit unless I ask.

Rules: never edit `analysis/*` decided content during this loop; new requirements go through `/req`.
