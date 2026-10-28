# Build spec: #51 users.email DB-level case-safety net (2026-10-26)

Task: tasks/051-users-email-db-level-case-safety-net-low.md (trace E-07/F-28). Origin: DEC-110 addenda 3-4, #46 Stage D.
Sources read: apps/api/prisma/schema.prisma, 3 existing migrations (plain Prisma-generated SQL, `-- CreateIndex` style), apps/api/src/modules/users/users.service.ts (`mapUniqueEmail`), users.controller.ts Swagger, apps/api/test/users.e2e-spec.ts, infra/scripts/deploy.sh (`migrate deploy` in the runtime image), `.claude/agents/hub-tester.md` (IMAGE-BUILD), skill postgres-ledger. CLAUDE.md: migrations forward-only; no new deps; Prisma 6 locked. Not finance-touching (no ledger/money path) so accountant-expert not applicable.

## Objective
Add a DB-level guarantee that `users.email` is unique case-insensitively, so a direct-SQL or future non-normalizing writer cannot create `Ada@x.com` beside `ada@x.com`. App behavior is unchanged: normalization (lowercase) in the API remains the primary defence; the DB index is the safety net.

## Design decision: Option A (raw-SQL unique functional index). B and C rejected.

Empirical evidence (scratch DB `hub_scratch_51` in hub-dev-postgres-1, Prisma 6.19.3, run from a COPY of schema+migrations in the scratchpad because the task gate blocks writes under apps/; DB dropped afterwards):
1. `prisma migrate deploy` on an empty DB with the new migration: applies cleanly (4 migrations).
2. `prisma migrate status`: "Database schema is up to date!".
3. `prisma migrate diff --from-schema-datasource --to-schema-datamodel --script`: `-- This is an empty migration.` => NO drift detected; Prisma ignores the expression index and does NOT propose dropping it.
4. `prisma migrate dev --create-only --name probe` (shadow DB flow works): generated an empty migration (`-- This is an empty migration.`) => no drop proposed, shadow DB replay fine.
5. Case-variant insert via raw SQL: `ERROR: duplicate key value violates unique constraint "users_email_lower_key"  DETAIL: Key (lower(email))=(ada@x.com) already exists.` (SQLSTATE 23505).
6. Prisma error shapes: ORM `user.create({email:'ADA@x.com'})` against existing `Ada@x.com` => `PrismaClientKnownRequestError` code `P2002`, `meta.target = ["lower(email)"]` => `mapUniqueEmail` still maps to 409 unchanged (it keys on code only). `$executeRaw` insert => `PrismaClientKnownRequestError` code `P2010`, `meta.code = "23505"`, message contains `Key (lower(email))`.
7. Pre-check: with a pre-existing case-variant pair, applying the migration SQL aborts with `users.email case-variant duplicates exist; resolve before applying` (psql ON_ERROR_STOP). Rollback: `DROP INDEX "users_email_lower_key"` works and the variant insert then succeeds.
8. `citext` exists in `pg_available_extensions` (postgres:16-alpine), but Option B needs `@db.Citext` + `postgresqlExtensions` preview feature (schema/feature-flag change, column type change, generated client change, runtime-image regen) for no benefit over A. Rejected: bigger blast radius. Option C (do nothing) rejected: A is ~8 lines, zero drift, zero app change.

The existing `email String @unique` (case-sensitive `users_email_key`) STAYS: Prisma `findUnique({where:{email}})`, seed upserts and the `@unique` typing depend on it. A is purely additive.

App-level effects: none to service/controller/DTO/Swagger. No endpoint added or changed => Swagger and per-route API-journey gate families do not apply beyond the existing 409 test (kept green). Rollback plan (forward-only): a NEW migration `DROP INDEX "users_email_lower_key";` (never edit/delete the applied migration).

Assumptions (defaults, none change design): production DB does not exist yet and dev DB holds only seeded/test users, so no data cleanup step is needed; the pre-check is the loud-failure guard. Migration dir name `20261026000000_users_email_lower_unique` (sorts after 20260913133813).

## Batch 1 (3 files; single implementer delegation)

1. NEW `apps/api/prisma/migrations/20261026000000_users_email_lower_unique/migration.sql` with exactly:
```sql
-- Safety net (#51 / DEC-110): case-insensitive uniqueness for users.email.
-- Expression index: not expressible in schema.prisma; Prisma ignores it (verified: no drift, migrate dev proposes nothing).
-- Pre-check: fail loudly if existing rows would collide.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "users" GROUP BY lower("email") HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'users.email case-variant duplicates exist; resolve before applying';
  END IF;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "users_email_lower_key" ON "users" (lower("email"));
```
   Rollback comment line allowed: `-- Rollback: forward migration with DROP INDEX "users_email_lower_key";`. Do NOT touch any existing migration file (protect-paths hook).
2. EDIT `apps/api/prisma/schema.prisma`: comment-only change above `email String @unique` in `model User`: `// Also protected by raw-SQL unique index users_email_lower_key ON users (lower(email)) (migration 20261026000000_users_email_lower_unique; invisible to Prisma, do not drop). App still lowercases (normalizeEmail).` No field/attribute change. Why: stops a future dev "cleaning up" the unknown index; keeps schema honest.
3. EDIT `apps/api/test/users.e2e-spec.ts` (extend, never replace) - inside `describe('POST /users [F-28]')` after the case-variant 409 test add:
   - `it('DB safety net: raw-SQL case-variant duplicate email is rejected by users_email_lower_key [F-28]')`: create a user via `prisma.user.create` (track id in `createdUserIds`, email unique per run e.g. `` `ci-${Date.now()}@x.test` ``) then `await expect(prisma.$executeRaw\`INSERT INTO users (id, email, password_hash, name, updated_at) VALUES (${randomUUID()}, ${upper}, 'h', 'n', now())\`).rejects` with message matching `/lower\(email\)|users_email_lower_key|23505/`; then assert `prisma.user.count({where:{email:{equals: local, mode:'insensitive'}}})` is 1 (no row leaked). Also assert the ORM path: `prisma.user.create` with the upper-case email rejects with `code === 'P2002'`.
   - keep the existing API 409 test unchanged (still green = mapUniqueEmail works on the functional index).
   Use existing imports/helpers in the file (check for `randomUUID`; import from `node:crypto` only if absent). No mocks.
4. Apply locally BEFORE running e2e (implementer, not orchestrator): `cd apps/api && pnpm exec prisma migrate deploy` (dev DB; deploy not dev, matching prod flow). Verify `pnpm exec prisma migrate status` = up to date and `pnpm exec prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` prints only `-- This is an empty migration.`.

Trust boundary: DB uniqueness for auth identity (login lookup by email); no money path. Regression surface: auth login/lockout (email lookup), users create/update (P2002 -> 409), seed.ts upserts (`where:{email}`), seed.e2e-spec, any test creating users with mixed-case emails (all must go through normalizing writers), apps/api Docker image `migrate deploy` (migrations dir copied at Dockerfile line ~53).

## DoD gates

### Static (hub-reviewer)
S1. `git status --short apps/api/prisma/migrations` shows exactly one new dir `?? .../20261026000000_users_email_lower_unique/` and no modified/deleted existing migration: `git diff --name-only HEAD -- apps/api/prisma/migrations` empty.
S2. `grep -c 'CREATE UNIQUE INDEX "users_email_lower_key" ON "users" (lower("email"))' <new migration.sql>` = 1 and `grep -c 'RAISE EXCEPTION' ...` = 1 (pre-check precedes index).
S3. `git diff HEAD -- apps/api/prisma/schema.prisma | grep '^[+-]' | grep -v '^+++\|^---'` shows only `+ //` comment lines (no field/attribute change; `email String @unique` unchanged).
S4. No edits to `apps/api/src/**` and no `package.json`/lockfile change: `git diff --name-only HEAD` (task-attributable files) contains only the 3 batch files (beyond pre-existing dirty files from other tasks).
S5. Test uses no mocks: `grep -nE 'jest\.(mock|fn|spyOn)' apps/api/test/users.e2e-spec.ts` count unchanged vs HEAD; new test contains `$executeRaw` and `P2002`.
S6. No `DROP INDEX`/`ALTER`/`DROP` in the migration other than comment text.

### Empirical (hub-tester)
E1. Empty-DB apply: create scratch DB `hub_scratch_51` (`docker exec hub-dev-postgres-1 psql -U hub -d hub_dev -c "CREATE DATABASE hub_scratch_51"`), `DATABASE_URL=...hub_scratch_51 pnpm --filter api exec prisma migrate deploy` => "All migrations have been successfully applied"; `psql ... -c "\di users_email_lower_key"` lists the index.
E2. Dev-DB apply: `prisma migrate status` on dev DB => "Database schema is up to date!".
E3. No drift: `prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` against both DBs => `-- This is an empty migration.`; `prisma migrate dev --create-only --name probe` on the scratch DB creates an empty migration (then delete that probe dir; it is a tester-created artifact, confirm `git status` clean of it).
E4. Raw SQL rejection: in scratch DB insert `Ada@x.com` then `ada@x.com` => second fails with `duplicate key value violates unique constraint "users_email_lower_key"`.
E5. Pre-check: on a fresh scratch DB migrated to 3 migrations only (copy the migrations dir minus the new one), insert `Ada@x.com`+`ada@x.com`, then apply new SQL via `psql -v ON_ERROR_STOP=1 -f` => fails with `case-variant duplicates exist`; table unchanged.
E6. Rollback path: `DROP INDEX "users_email_lower_key"` succeeds and variant insert then succeeds (documents the compensating forward migration).
E7. API behaviour: `pnpm --filter api test:e2e` (full) => all green (baseline 108 + new test(s)); users spec 'duplicate email, including a case variant, is 409' passes; `pnpm --filter api test` unit = 60 green.
E8. IMAGE-BUILD (REQUIRED; trigger `^apps/api/prisma/(schema\.prisma|migrations/|seed\.ts$)` matches): follow `.claude/agents/hub-tester.md` Image-build gate verbatim: unmodified `docker build -f apps/api/Dockerfile .` (no `--target`), boot checks per that file, cleanup of image/containers. PLUS inside the built runtime image run against a scratch DB `docker run --rm --network <compose net> -e DATABASE_URL=...hub_scratch_51 <image> npx --no-install prisma migrate deploy` (mirrors infra/scripts/deploy.sh line 31) => applies all 4 migrations incl. the new one; then drop scratch DB. Report `IMAGE-BUILD: ...` line in hub-tester format.
E9. Cleanup: `DROP DATABASE hub_scratch_51`; confirm `\l` lacks it.

### Gatekeeper criteria
G1. CLAUDE.md: migrations forward-only, existing migration files untouched, no new deps, Prisma 6 locked.
G2. SRS/DEC-110 addenda 3-4 + #46 Stage D: case-insensitive email identity enforced beyond app layer; login email case-insensitivity (#46) unaffected.
G3. requirements E-07/F-28 (users admin): duplicate email still 409 `Email already in use`; no response-envelope change.
G4. postgres-ledger: migration forward-only, pre-check guards data loss; hub-deploy: `migrate deploy` in runtime image works (deploy.sh).
G5. Evidence in completion notes: Prisma 6.19.3 drift behaviour (empty diff, empty `migrate dev`), P2002 `meta.target=["lower(email)"]` (ORM) vs P2010/23505 (raw), citext rejection reason; DECISIONS.md entry by orchestrator (add DEC for Option A + rollback migration plan).
G6. Test quality: real DB behaviour, no mocks (testing-anti-patterns); suite count rises, none removed.

Counts: batches 1 · static 6 · empirical 9 · gatekeeper 6.
