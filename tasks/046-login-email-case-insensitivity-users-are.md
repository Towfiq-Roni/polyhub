---
id: 46
title: "Login email case-insensitivity: users are lowercased on write but login looks up the exact email (found in #2 planning)"
goal: "Financial traceability"
source: "Auto 2026-10-25"
priority: 3
status: "DONE"
trace: "E-07/F-27"
sprint: "—"
deps: []
build_spec: "docs/agentic/build-specs/2026-10-25-login-email-case.md"
started: "2026-10-25"
completed: "2026-10-25"
agents: ""
---
# #46 Login email case-insensitivity: users are lowercased on write but login looks up the exact email (found in #2 planning)

## Description / AC
Goal: Financial traceability. AC: (1) login accepts mixed-case/padded email against a lowercase account; (2) wrong/unknown/inactive stay the identical generic 401; (3) lockout counter shared across case/padding variants; (4) case-only duplicate on create/PATCH → 409; (5) seed normalizes SUPER_ADMIN_EMAIL, whitespace-only still throws 'required'; (6) ONE normalization rule (`normalizeEmail` in packages/shared); (7) no schema change; image build gate green (DEC-110).

## Build spec
- docs/agentic/build-specs/2026-10-25-login-email-case.md

## Changelog
- 2026-10-25 [new] created
- 2026-10-25 [start] focus -> #46, status IN_PROGRESS (spec docs/agentic/build-specs/2026-10-25-login-email-case.md)
- 2026-10-25 DEC-110 logged; start focus=46; Batch 1 (RED tests) next
- 2026-10-25 Batch 1 RED tests built (7 new fail for right reasons; 4 regression guards pass); next Batch 2 shared normalizeEmail
- 2026-10-25 Batch 2 shared normalizeEmail built (dist rebuilt, typecheck/lint green); S1 gate amended (DEC-110 addendum); next Batch 3 login path
- 2026-10-25 Batch 3 login path built: auth e2e 21/21, unit 60; next Batch 4 write path + seed
- 2026-10-25 Batch 4 write path + seed built: e2e 97/97, unit 60, E8 data check clean; DEC-110 addendum 2; next Stage B
- 2026-10-25 Stage B PASS (0 violations); Stage C PASS (E1-E9 incl. IMAGE-BUILD, 4 mutation checks, live probes); findings logged DEC-110 addendum 3; next Stage D
- 2026-10-25 Stage D: 0 BLOCKER/0 MAJOR/5 SUGGESTION; S-1 (strengthen unit test) + S-3 (track all 201 ids) applied via re-BUILD; DEC-110 addendum 4; lower(email) index filed as backlog
- 2026-10-25 [done] gatekeeper PASS

## Completion notes
Full chain PASS 2026-10-25: reviewer 0 violations, tester E1-E9 incl. IMAGE-BUILD + 4 mutation checks + live probes, code-reviewer 0 BLOCKER/0 MAJOR (2 test-quality suggestions applied, DEC-110 add. 4), gatekeeper PASS. e2e 97/97, unit 60. NO data migration (dev DB: 0 mixed-case rows, 0 collisions). If a deployed DB ever has mixed-case rows: backfill = UPDATE users SET email = lower(btrim(email)) after the duplicate pre-check SELECT lower(btrim(email)), count(*) FROM users GROUP BY 1 HAVING count(*)>1 returns zero rows (resolve collisions manually first). ponytail: raw unique index only -> add lower(email) unique functional index or citext via a forward migration (task #51; check Prisma migrate drift). shared loginSchema has no consumers (kept for parity).
