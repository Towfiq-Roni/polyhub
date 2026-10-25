---
id: 2
title: "User CRUD + activate/deactivate + admin-mediated reset"
goal: "Financial traceability"
source: "Planning 2026-09-10"
priority: 1
status: "DONE"
trace: "E-07/F-28"
sprint: "—"
deps: []
build_spec: "docs/agentic/build-specs/2026-10-25-user-crud.md"
started: "2026-10-25"
completed: "2026-10-25"
agents: ""
---
# #2 User CRUD + activate/deactivate + admin-mediated reset

## Description / AC
User CRUD + activate/deactivate + admin-mediated reset [E-07/F-28]

## Build spec
- docs/agentic/build-specs/2026-10-25-user-crud.md

## Changelog
- 2026-10-25 [migration] migrated from TASKS.md row #2 (archive: docs/agentic/archive/TASKS-2026-10-25.md)
- 2026-10-25 [start] focus -> #2, status IN_PROGRESS (spec docs/agentic/build-specs/2026-10-25-user-crud.md)
- 2026-10-25 Batch 1 RED tests built (43 e2e + 4 guard, all [F-28]); deviations DEC-098
- 2026-10-25 Batch 2 DTOs + interim SuperAdminGuard built; guard spec 4/4 green
- 2026-10-25 Batch 3 service/controller/module built; 42/43 e2e via scratch wiring; DEC-099
- 2026-10-25 Batch 4 wire-up + D6 login fix built; e2e 75/75, unit 58; DEC-100; next: Stage B reviewer
- 2026-10-25 Stage B FAIL (null PATCH 500) -> fixed via re-BUILD (DEC-101), e2e 76/76; next: Stage C tester
- 2026-10-25 Stage C PASS: E1-E11, live API audit lines, e2e 76/76 x3, mutations bite (lock, swagger, D6)
- 2026-10-25 Stage D: 0 BLOCKER/0 MAJOR; suggestions applied (DEC-102/103): ORDER BY u.id, no-op PATCH skips audit, lockoutCleared marker, audit/lock/self-action e2e added; e2e 84/84
- 2026-10-25 [done] gatekeeper PASS

## Completion notes
Full chain PASS 2026-10-25: reviewer (MAJOR null-PATCH 500 fixed, DEC-101), tester (E1-E11 live API, mutations bite), code-reviewer (0 BLOCKER/0 MAJOR, DEC-102/103 applied), gatekeeper PASS. e2e 84/84, unit 58. Interim guard -> #4, audit stub -> #6.
