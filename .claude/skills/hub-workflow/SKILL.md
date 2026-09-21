---
name: hub-workflow
description: Use at the START of every coding session or task in this repo, and when finishing work — governs the memory protocol (PROGRESS.md/DECISIONS.md), phase ordering from task-breakdown.md, Definition of Done, and commit conventions. Ensures project state is never lost between sessions.
---

# Hub Session Workflow

## Starting a session
1. Read `docs/memory/PROGRESS.md` → note **Current Focus** (phase + next task).
2. Skim the matching phase section in `analysis/task-breakdown.md` for sub-tasks + acceptance criteria.
3. Load domain skills as flagged in CLAUDE.md §Session Protocol.
4. If a needed decision isn't in `DECISIONS.md` or `requirement-gaps.md` defaults: ask the user, then record it (see below) BEFORE building on it.

## While working
- One logical task per change; keep PRs reviewable.
- Tick PROGRESS.md checkboxes as each completes (use `[~]` while mid-task).
- Acceptance criteria in task-breakdown are the definition of "done" — not "code written".

## Finishing work
1. `pnpm lint && pnpm typecheck && pnpm test` green.
2. Update `docs/memory/PROGRESS.md`: tick boxes, move Current Focus forward.
3. Append any new decision to `docs/memory/DECISIONS.md` (`DEC-###` next number, append-only).
4. Add a Session Log row summarizing what changed.
5. Commit: Conventional Commits (`feat(payments): ...`). Never commit `.env`, secrets, or node_modules. Squash-merge via PR once repo has CI.

## Decision records
Format: `DEC-### · YYYY-MM-DD · <title> · <decision> · <why/source>`. Reference gap IDs (F-x/P-x/S-x/D-x/E-x) where applicable.

## Hard stops
- **Implementation gate:** doc/planning/design updates never authorize building — write code, mockups, or files ONLY on explicit user instruction ("go", "implement", equivalent). Uncertain? Ask first.
- Do not skip phases without explicit user instruction.
- Do not modify analysis docs' *decided* content unilaterally — propose via DECISIONS entry first.
- Spec deviations must land in DECISIONS.md or they didn't happen.
