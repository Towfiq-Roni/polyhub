---
description: Implement the next (or given) task through the full quality chain — build → review → test → code-review → DoD gate → memory.
argument-hint: "[task]"
---

Task target: $ARGUMENTS

Execute the hub implementation loop exactly:

1. **Resolve task** — empty `$ARGUMENTS`: first unchecked item under Current Focus in `docs/memory/PROGRESS.md`. Otherwise match to a task in `analysis/task-breakdown.md` and confirm with me before starting.
2. **Design precondition** — if the task traces to a design in `docs/designs/`, it must be VALIDATED with a DECISIONS entry; otherwise stop and run `/req` first.
3. **Mark `[~]`** on the checkbox in PROGRESS.md.

**Stage 0 — Plan:** delegate to `hub-planner` (task text + phase context + ACs verbatim). It reads the business/design requirements itself and returns a build spec (`docs/agentic/build-specs/<file>`) with ≤3-file batches and the DoD gates for this task. No build without this spec (Workflow.md hard rule 1.5).

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

**Stage F — Close:** run `pnpm lint && pnpm typecheck && pnpm test` yourself · tick `[x]` in PROGRESS.md · Session Log row · append `DEC-###` if a new decision surfaced · record any SUGGESTIONS from Stage D as new PROGRESS items if worth keeping · report files/tests/gate trace + conventional-commit suggestion. Do not commit unless I ask.

Rules: never edit `analysis/*` decided content during this loop; new requirements go through `/req`.
