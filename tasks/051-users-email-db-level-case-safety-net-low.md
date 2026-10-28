---
id: 51
title: "users.email DB-level case safety net: lower(email) unique functional index or citext column via a forward migration (trigger: first additional writer of users.email; check Prisma migrate drift first) — from #46 Stage D"
goal: "Financial traceability"
source: "Auto 2026-10-25"
priority: 3
status: "DONE"
trace: "E-07/F-28"
sprint: "—"
deps: []
build_spec: "docs/agentic/build-specs/2026-10-26-users-email-db-case-safety.md"
started: "2026-10-26"
completed: "2026-10-26"
agents: ""
---
# #51 users.email DB-level case safety net: lower(email) unique functional index or citext column via a forward migration (trigger: first additional writer of users.email; check Prisma migrate drift first) — from #46 Stage D

## Description / AC
Goal: Financial traceability. AC: (1) ONE new forward migration adds a unique functional index `users_email_lower_key` on lower(email) behind a collision pre-check; no model change; existing email @unique retained; (2) raw case-variant insert is rejected (23505), ORM → P2002, API still 409; (3) no drift (`migrate diff` empty), migrate deploy works on empty DB and inside the built image; (4) rollback = a new forward migration dropping the index; (5) accepted limits logged (no CONCURRENTLY, non-ASCII lower() vs toLowerCase) — DEC-112.

## Build spec
- docs/agentic/build-specs/2026-10-26-users-email-db-case-safety.md

## Changelog
- 2026-10-25 [new] created
- 2026-10-26 [start] focus -> #51, status IN_PROGRESS (spec docs/agentic/build-specs/2026-10-26-users-email-db-case-safety.md)
- 2026-10-26 Build done: migration + schema comment + e2e; migrate status up to date, no drift, e2e 109, rollback rehearsed; DEC-112 addendum; next Stage B
- 2026-10-26 Stage B PASS (1 MINOR: checksum claim corrected, DEC-112 addendum 2); next Stage C incl. IMAGE-BUILD + migrate deploy in image
- 2026-10-26 Stage C PASS (E1-E9, mutation bites, IMAGE-BUILD + migrate deploy in image); DEC-112 addendum 3; next Stage D
- 2026-10-26 Stage D: 0 BLOCKER/0 MAJOR/4 SUGGESTION; test brittleness fixed via small re-BUILD, docs recorded (DEC-112 addendum 4); next re-verify then Stage E
- 2026-10-26 Stage D test hardening applied + mutation-verified (DEC-112 addendum 5); next Stage E
- 2026-10-26 [done] gatekeeper PASS

## Completion notes
Full chain PASS 2026-10-26: reviewer PASS (1 MINOR: checksum claim corrected), tester E1-E9 + mutation + IMAGE-BUILD incl. migrate deploy in image, code-reviewer 0 BLOCKER/0 MAJOR (test hardened, limits recorded; DEC-112 add. 4/5), gatekeeper PASS. Migration 20261026000000_users_email_lower_unique; e2e 7 suites/109, unit 60. Rollback = forward migration DROP INDEX users_email_lower_key. Accepted: plain CREATE UNIQUE INDEX (Prisma runs migrations in a txn; SHARE lock OK at <=5 users); lower() vs toLowerCase non-ASCII divergence (confusable collisions -> 409).
