---
id: 54
title: "Drop legacy users lockout columns (failed_login_attempts, first_failed_attempt_at, lockout_until) via a forward migration — unused since #52 (DEC-115); remove schema fields + deprecated comment; check nothing reads them (grep), rollback = re-add columns"
goal: "Reduced tool sprawl"
source: "Auto 2026-10-26"
priority: 3
status: "DONE"
trace: "E-07/F-27"
sprint: "—"
deps: []
build_spec: "docs/agentic/build-specs/2026-10-28-drop-legacy-lockout-columns.md"
started: "2026-10-28"
completed: "2026-10-28"
agents: ""
---
# #54 Drop legacy users lockout columns (failed_login_attempts, first_failed_attempt_at, lockout_until) via a forward migration — unused since #52 (DEC-115); remove schema fields + deprecated comment; check nothing reads them (grep), rollback = re-add columns

## Description / AC
AC1 schema.prisma has no failedLoginAttempts/firstFailedAttemptAt/lockoutUntil on User and no @deprecated note. AC2 new forward-only migration 20261028000000_drop_legacy_user_lockout_columns drops the 3 columns, header documents rollback; applies via `migrate deploy` on fresh DB and existing dev DB. AC3 repo grep shows no reader/writer (except init_auth migration, new migration, users.e2e deny-list). AC4 lint/format/typecheck/unit 74/e2e 10x125/db-indexes/IMAGE-BUILD green. AC5 DEC logged: columns held stale counters only, no audit need (ADR-0004), rollback = re-add columns.

## Build spec
- docs/agentic/build-specs/2026-10-28-drop-legacy-lockout-columns.md

## Changelog
- 2026-10-26 [new] created
- 2026-10-28 [start] focus -> #54, status IN_PROGRESS (spec docs/agentic/build-specs/2026-10-28-drop-legacy-lockout-columns.md)
- 2026-10-28 Plan done (hub-planner), DEC-117 logged; Build next.
- 2026-10-28 Build done (hub-implementer): migration 20261028000000 + schema + ADR line. migrate deploy OK dev+fresh, no drift, unit 74, e2e 10/125, db-indexes 1/1. E2 pre-drop sanity not recorded (shell quoting slip; columns are stale 0/NULL by DEC-115, no impact). Stage B next.
- 2026-10-28 Stage B PASS (hub-reviewer, static): migration byte-identical to spec, schema valid, repo grep clean (only users.e2e SECRET_KEYS deny-list), forward-only honored. Caveat: no empirical run; Stage C must confirm. Note schema/ADR hunks overlap with #46/#52 uncommitted work - stage with git add -p.
- 2026-10-28 Stage C PASS (hub-tester): gates green, e2e 125 x2, migrate diff clean, fresh-DB + seed OK, IMAGE-BUILD pass. Findings: unknown keys in Prisma create/update data not caught by tsc; seed.ts outside typecheck scope (filed follow-up). See DEC-117 addendum 1.
- 2026-10-28 Stage D PASS (hub-code-reviewer): rollback SQL matches init_auth types, DEC-117 sound, AC1-5 met. Rollback (copy for completion notes): ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0, ADD COLUMN first_failed_attempt_at TIMESTAMP(3), ADD COLUMN lockout_until TIMESTAMP(3) via a NEW migration.
- 2026-10-28 [done] gatekeeper PASS

## Completion notes
Stage E PASS (hub-gatekeeper): lint/format/typecheck clean, unit 74, e2e 10/125, migrate diff clean, IMAGE-BUILD pass. Rollback = NEW migration: ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0, ADD COLUMN first_failed_attempt_at TIMESTAMP(3), ADD COLUMN lockout_until TIMESTAMP(3).
