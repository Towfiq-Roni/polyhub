# Build spec: #54 drop legacy users lockout columns

Date 2026-10-28 · Planner: hub-planner · Task: tasks/054-drop-legacy-users-lockout-columns-failed.md
Command prefix: pnpm is not on PATH, use `corepack pnpm` everywhere.

## Sources that shaped this spec
- CLAUDE.md: migrations forward-only (rule: `migrate deploy`), no destructive drops without a DEC entry (postgres-ledger skill checklist), Surgical Changes, Do-not-touch-infra.
- DEC-077 (columns added, task #1), DEC-113/115/116 + `docs/adr/0004-jwt-argon2-auth.md` line 45 ("legacy users lockout columns are unused and will be dropped in a later migration"), `planning/adr/ADR-0004-auth-approach.md`, `planning/SRS.md` auth/lockout detail (~line 210), `.claude/agents/hub-tester.md` IMAGE-BUILD gate.
- Not finance-touching (no ledger/money path): accountant-expert not needed. postgres-ledger loaded for migration safety.

## 1. Objective
Remove `users.failed_login_attempts`, `users.first_failed_attempt_at`, `users.lockout_until` (dead since #52; lockout lives in `login_attempts` per (user, ip)) via one new forward-only Prisma migration, and delete the three fields plus the `@deprecated` comment from `schema.prisma`. After: schema, DB (fresh and existing), generated client and all tests agree; nothing reads or writes the columns; `login_attempts.lockout_until` is untouched.

## 2. Findings (planner grep, repo-wide, excl. node_modules/.git)
Grep for `failed_login_attempts|failedLoginAttempts|first_failed_attempt|firstFailedAttempt|lockout_until|lockoutUntil` over apps/ packages/ docs/ tools/ infra/:
- Product readers/writers of the legacy USER columns: NONE. `apps/api/src/modules/auth/auth.service.ts` and `auth.service.spec.ts` `lockout_until/lockoutUntil` hits are all `login_attempts` (raw INSERT at ~L243, `attempt.lockoutUntil`, L289 `loginAttempt` where). `seed.ts`, `seed.e2e-spec.ts`, `users.service.ts`, DTOs (`user-requests.dto.ts`), `packages/shared` : no hits. No raw SQL against `users` touching them.
- Tests: every `lockoutUntil` hit in `apps/api/test/*.e2e-spec.ts` is on `prisma.loginAttempt` (verified users.e2e L462/493/659, auth.e2e L222). Only legacy-name occurrence: `users.e2e-spec.ts` L22 `SECRET_KEYS = [..., 'lockoutUntil', 'failedLoginAttempts', 'firstFailedAttemptAt']` = a no-leak deny-list for response bodies. DECISION: leave unchanged (still valid, guards against a future reintroduction leaking fields; changing it is out of scope).
- Historical docs (old build specs, DECISIONS.md DEC-077/115 text, RUNLOG): append-only history, do NOT edit.
- Live docs mentioning the columns: `docs/adr/0004-jwt-argon2-auth.md` line 45 ("will be dropped in a later migration") -> becomes stale; Batch 2 updates it.
- Migrations that create them: `20260913091033_init_auth` (immutable, never edit).
- IMPLEMENTER MUST RE-RUN the grep (S1) before editing; any new hit outside the list above = stop and report.

## 3. Data-loss stance (decision, to be logged as a DEC by orchestrator)
Columns hold only stale per-account counters/timestamps from the pre-#52 per-account lockout (always 0/NULL after #52 on any DB; on dev DB users = admin only). Per ADR-0004 (lockout is a throttle, not an audit record), SRS lockout detail, and CLAUDE.md rule 8 (AuditLog carries sensitive-write forensics; login failures were never written to AuditLog, see auth-module spec) there is no audit/forensic requirement on them. Verdict: drop, no archive/backup copy needed. Pre-drop sanity query is recorded in the gate E2 (informational, not blocking).
Rollback (documented in migration comment + task file Completion notes): forward migration re-adding
`ALTER TABLE "users" ADD COLUMN "failed_login_attempts" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "first_failed_attempt_at" TIMESTAMP(3), ADD COLUMN "lockout_until" TIMESTAMP(3);` (data not recoverable except from nightly backup; acceptable, values were stale).

## 4. Batches

### Batch 1 (2 files) - hub-implementer #1
1. NEW `apps/api/prisma/migrations/20261028000000_drop_legacy_user_lockout_columns/migration.sql` (timestamp must sort after `20261026104357_login_attempts`; no other migration dir touched). Content exactly:
```sql
-- Drop legacy per-account lockout columns (unused since #52 / DEC-115; lockout now in login_attempts per (user, ip)).
-- Destructive but intentional: columns held only stale counters (no audit/forensic need, ADR-0004). Task #54.
-- Rollback (forward-only; ship as a NEW migration):
--   ALTER TABLE "users" ADD COLUMN "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
--     ADD COLUMN "first_failed_attempt_at" TIMESTAMP(3),
--     ADD COLUMN "lockout_until" TIMESTAMP(3);
ALTER TABLE "users"
  DROP COLUMN "failed_login_attempts",
  DROP COLUMN "first_failed_attempt_at",
  DROP COLUMN "lockout_until";
```
   Why: forward-only drop; single statement = atomic within Prisma's migration transaction. Do not use IF EXISTS (fresh DB always has them via init_auth; a miss should fail loudly). Do not touch `login_attempts`.
2. EDIT `apps/api/prisma/schema.prisma` model `User`: delete the 2 comment lines (`// @deprecated, unused since #52 ...` and `// Columns kept; drop in ...`) and the 3 field lines `failedLoginAttempts`, `firstFailedAttemptAt`, `lockoutUntil` (L~22-27) plus the blank line they leave doubled; keep `lastLoginAt` etc, `loginAttempts LoginAttempt[]`, and `LoginAttempt.lockoutUntil` untouched. No other schema change (no reformat of unrelated lines).
3. Then (commands, not files): `corepack pnpm --filter api exec prisma generate`; `corepack pnpm --filter api exec prisma migrate deploy` against dev DB (or `db:migrate` equals `migrate dev`: if used, it must report NO drift and create NO extra migration, and the migrations dir must contain exactly the one new dir). Confirm `prisma migrate diff --from-migrations apps/api/prisma/migrations --to-schema-datamodel apps/api/prisma/schema.prisma --shadow-database-url <scratch>` is empty if shadow DB available (else rely on E3).
Touches: schema + migration (prisma path => IMAGE-BUILD triggered). No trust boundary, money path or a11y surface. Drops only columns on `users`.
Regression surface: `users`/`auth` services and all e2e (generated client type change; TS compile will catch any stray reader), `seed.ts` (`prisma.user.upsert/create` data objects), db-indexes e2e (index inventory on users must be unchanged: `users_email_key`, `users_email_lower_key`), Dockerfile `prisma generate` step.

### Batch 2 (1 file) - hub-implementer #2 (docs only, after Batch 1 verified)
4. EDIT `docs/adr/0004-jwt-argon2-auth.md` line 45: replace the sentence "The legacy `users` lockout columns are unused and will be dropped in a later migration." with "The legacy `users` lockout columns were dropped in migration `20261028000000_drop_legacy_user_lockout_columns` (task #54)." Nothing else. (`planning/adr/ADR-0004-auth-approach.md` has no such sentence; do not touch.)

Orchestrator (not implementer) afterwards: task.py start with this spec; fill task file `## Description / AC` (see section 6); append DEC for data-loss stance; log; tick PROGRESS.

## 5. DoD gates

### Static (hub-reviewer)
- S1 `grep -rnE "failed_login_attempts|failedLoginAttempts|first_failed_attempt|firstFailedAttempt" apps packages infra tools --include='*' --exclude-dir=node_modules --exclude-dir=dist` returns ONLY: `apps/api/prisma/migrations/20260913091033_init_auth/migration.sql` (3 lines region), the new migration file (comment + DROP lines), and `apps/api/test/users.e2e-spec.ts:22` deny-list. Zero hits in `schema.prisma`, `src/`, `seed*.ts`, `packages/shared`.
- S2 `grep -n "lockoutUntil\|lockout_until" apps/api/prisma/schema.prisma` returns exactly 1 hit (LoginAttempt, `@map("lockout_until")`); `grep -n "@deprecated" apps/api/prisma/schema.prisma` returns 0.
- S3 `git status --short apps/api/prisma/migrations` shows exactly ONE new dir `20261028000000_drop_legacy_user_lockout_columns`; `git diff --stat -- apps/api/prisma/migrations` shows no modification to existing migration files.
- S4 New migration.sql contains `DROP COLUMN` x3 on `"users"`, contains no `IF EXISTS`, no `login_attempts`, and no DROP TABLE/other statement; header carries the Rollback comment.
- S5 `git diff --stat` product-code scope = only `schema.prisma` + new migration (+ ADR doc in Batch 2); `apps/api/src`, `packages/`, `infra/`, `Dockerfile` untouched.
- S6 `corepack pnpm lint -- --max-warnings=0` exit 0 (run as the repo's lint with `--max-warnings=0`); `corepack pnpm format:check` exit 0; `corepack pnpm typecheck` exit 0.
- S7 No stored-balance/ledger invariant impact: `grep -n "balance" apps/api/prisma/schema.prisma` unchanged from HEAD (diff has no `balance` line).

### Empirical (hub-tester)
- E1 Unit: `corepack pnpm --filter api test` -> 74 tests pass (unchanged count).
- E2 Pre-drop sanity (informational; run BEFORE applying migration to dev DB): `SELECT count(*) AS users, count(*) FILTER (WHERE failed_login_attempts<>0 OR first_failed_attempt_at IS NOT NULL OR lockout_until IS NOT NULL) AS dirty FROM users;` via `docker exec <dev-postgres-container> psql -U hub -d hub_dev -c "..."` (find container: `docker ps --format '{{.Names}}'`). Expected users=1 (admin), dirty=0. If dirty>0 report value; still proceed (stale data, per section 3).
- E3 migrate deploy on EXISTING dev DB: `corepack pnpm --filter api exec prisma migrate deploy` -> applies exactly `20261028000000_drop_legacy_user_lockout_columns`, exit 0. Then `\d users` (psql) shows none of the 3 columns and still shows `users_email_key` and `users_email_lower_key`; `SELECT count(*) FROM users` unchanged (1) and the admin row intact (`SELECT email,status FROM users`); `\d login_attempts` unchanged (has `lockout_until`). Re-run `migrate deploy` -> "No pending migrations", `prisma migrate status` -> "Database schema is up to date".
- E4 migrate deploy on FRESH DB: in the same dev postgres container `psql -U hub -d postgres -c "CREATE DATABASE hub_fresh_54;"`; run `DATABASE_URL=postgresql://hub:hub_dev_local_only@localhost:5432/hub_fresh_54 corepack pnpm --filter api exec prisma migrate deploy` (host/port from infra/.env.dev.example; do not create/edit any .env file) -> all 6 migrations apply, exit 0; `\d users` lacks the 3 columns; `\d login_attempts` exists. Cleanup unconditional: `psql -d postgres -c "DROP DATABASE hub_fresh_54;"` (pass or fail; state it ran). Optionally `prisma migrate diff --from-url <fresh url> --to-schema-datamodel apps/api/prisma/schema.prisma --exit-code` returns 0 (no drift).
- E5 Full e2e, never `-- users` filter: `corepack pnpm --filter api test:e2e` -> 10 suites / 125 tests pass (includes auth, auth-lockout, auth-lockout-race, auth-throttle, users, swagger, health, db-indexes).
- E6 db-indexes e2e specifically passes (`apps/api/test/db-indexes.e2e-spec.ts`, inside E5; report its own result line): users indexes unchanged, no index referenced the dropped columns.
- E7 Behavior smoke (against running API on dev DB, one throttled login only): admin login 201; `GET /api/v1/users` 200 and body contains none of `failedLoginAttempts|firstFailedAttemptAt|lockoutUntil|failed_login_attempts|lockout_until|passwordHash`.
- E8 seed re-run safe: `corepack pnpm --filter api exec prisma db seed` (or repo seed script) exits 0 on migrated dev DB and keeps users count/admin unchanged (seed.e2e-spec.ts passes inside E5).
- IMAGE-BUILD (REQUIRED; triggered by `apps/api/prisma/schema.prisma` and `migrations/`): follow `.claude/agents/hub-tester.md` IMAGE-BUILD steps (a)-(e) verbatim with task-id `54`: `python3 tools/check-dockerfile-stages.py` exit 0; pre-clean `docker rm -f hub-api-gate-54`; unmodified `docker build -f apps/api/Dockerfile -t hub-api-gate:54 .` (NO `--target`) exit 0; dist check prints `ok`; boot on port 4010 with the inline `-e` env list (against the ALREADY-migrated dev DB, so the boot proves the new client + schema work), health 200, one login 201, `GET /users` 200 with no `passwordHash`/`password` key; EXIT-trap cleanup (`docker rm -f` + `docker rmi`) must run and be stated; report side effect (sessions/lastLogin row). Docker/Postgres unavailable => UNVERIFIABLE, not PASS.

### Gatekeeper criteria (standalone audit, zero context)
- G1 Task #54 AC: three columns absent from schema.prisma, from the migrated DB (fresh + existing), and from generated client; one forward-only migration present; `@deprecated` comment gone. Source: tasks/054 + DEC-115 addendum 1 + ADR-0004 line 45.
- G2 CLAUDE.md migrations forward-only: existing migration files byte-identical to HEAD; new migration documents rollback in header; no `migrate reset`/`db push` use evidenced.
- G3 Nothing still reads/writes the columns (S1) and the replacement mechanism (`login_attempts`, DEC-115) is untouched and its e2e (auth-lockout, auth-lockout-race, auth-throttle) green: lockout behavior preserved.
- G4 Data-loss stance logged as a DEC (destructive drop requires DEC entry per postgres-ledger checklist) and task file Completion notes record rollback.
- G5 Gate numbers: lint `--max-warnings=0`, format:check, typecheck all exit 0; unit 74; full e2e 10 suites/125 (not a filtered run); IMAGE-BUILD all legs green + cleaned.
- G6 Rule 7 of Minimal Code Discipline: diff contains only schema, migration, one ADR sentence; no adjacent cleanup.

## 6. Task file pointer (orchestrator fills `tasks/054-*.md` `## Description / AC`)
Suggested AC text: "AC1 schema.prisma has no failedLoginAttempts/firstFailedAttemptAt/lockoutUntil on User and no @deprecated note. AC2 new forward-only migration 20261028000000_drop_legacy_user_lockout_columns drops the 3 columns, header documents rollback; applies via `migrate deploy` on fresh DB and existing dev DB. AC3 repo grep shows no reader/writer (except init_auth migration, new migration, users.e2e deny-list). AC4 lint/format/typecheck/unit 74/e2e 10x125/db-indexes/IMAGE-BUILD green. AC5 DEC logged: columns held stale counters only, no audit need (ADR-0004), rollback = re-add columns." Build spec line: `docs/agentic/build-specs/2026-10-28-drop-legacy-lockout-columns.md`.

## 7. Risks
- Applying the migration to the shared dev DB while other e2e runs execute: run E3 before E5, never concurrently.
- `migrate dev` would try to create a differently named migration if schema and SQL drift: use `migrate deploy` (forward-only) and the diff check.
- Dropped columns are unrecoverable except via backup; acceptable (stale data).
- Running containers/dev API started before the migration hold an old Prisma client selecting `failed_login_attempts` (user queries `SELECT *` style) -> would 500 until restarted: tester must restart any long-running dev API after migrate+generate.
