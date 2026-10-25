---
id: 39
title: "Repo tooling: ESLint+Prettier+husky/lint-staged+commitlint (Phase 1, `analysis/task-breakdown.md`)"
goal: "Reduced tool sprawl"
source: "User 2026-09-13"
priority: 1
status: "DONE"
trace: ""
sprint: "—"
deps: []
build_spec: "docs/agentic/build-specs/2026-10-25-repo-tooling.md"
started: "2026-10-25"
completed: "2026-10-25"
agents: "hub-planner→hub-implementer→hub-reviewer→hub-tester→hub-code-reviewer→hub-gatekeeper"
---
# #39 Repo tooling: ESLint+Prettier+husky/lint-staged+commitlint (Phase 1, `analysis/task-breakdown.md`)

## Description / AC
Repo tooling: ESLint+Prettier+husky/lint-staged+commitlint (Phase 1, `analysis/task-breakdown.md`)

## Build spec
- docs/agentic/build-specs/2026-10-25-repo-tooling.md

## Changelog
- 2026-10-25 started (migrated from TASKS.md)
- 2026-10-25 DONE (migrated from TASKS.md)
- 2026-10-25 [migration] migrated from TASKS.md row #39 (archive: docs/agentic/archive/TASKS-2026-10-25.md)

## Completion notes
Full chain PASS. Root flat ESLint 9 (non-type-aware), Prettier (printWidth 120), CI-guarded husky hooks, commitlint, `[F-27]` test tags + `docs/agentic/trace-check.sh`. Closes DEC-079. Stage D MAJOR (lint-staged `--no-warn-ignored`) fixed via re-BUILD. Logged DEC-090..092. See `docs/agentic/build-specs/2026-10-25-repo-tooling.md`.
