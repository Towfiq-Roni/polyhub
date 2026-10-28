# Build spec: #46 Login email case-insensitivity (2026-10-25)

Task: `tasks/046-*.md` (trace E-07/F-27, also touches F-28 write path). Backend only, no UI, no schema change, no migration.
Orchestrator step before build: `python3 tools/task.py start 46 --spec docs/agentic/build-specs/2026-10-25-login-email-case.md`. Order: #46 builds first, then #49 (new test file; no conflict).

## Sources read
CLAUDE.md (rules 7-9, delegation, minimal discipline); DEC-097 (f)(g), DEC-107 (image-build gate); build specs 2026-09-13-auth-module + 2026-10-25-user-crud; code: `auth.service.ts` (login, recordFailedAttempt), `dto/login.dto.ts`, `packages/shared/src/auth/schemas.ts`, `users/dto/user-requests.dto.ts` (local `trimLower`), `users.service.ts` (P2002 -> 409), `prisma/schema.prisma` (`User.email String @unique`, plain text, no citext/functional index), `prisma/seed.ts`, `auth.e2e-spec.ts`, `users.e2e-spec.ts`, `seed.e2e-spec.ts`, `auth.service.spec.ts`. Finance-free task: accountant-expert N/A.

## Objective
One normalization rule `normalizeEmail = trim + toLowerCase` lives in `@hub/shared`; login, user create/update, and the seed all use it, so a user typing `Ada@Example.com ` logs in to the lowercase-stored `ada@example.com`, case variants share one lockout counter, and case-only duplicates are 409.

## Findings (verified)
- Defect: `AuthService.login` does `findUnique({where:{email}})` with the raw input; `LoginDto` only `@IsEmail()` (no transform). Mixed case -> 401; padded with spaces -> 400 (class-validator rejects leading/trailing space) before reaching the service.
- Lockout is stored per user row (`failed_login_attempts`, `first_failed_attempt_at`, `lockout_until`, updated `WHERE id = user.id`). Once lookup is normalized every case variant resolves to the same row, so the counter is shared. Needs no code change; needs a test.
- Create/update already lowercase+trim via a file-local `trimLower` in `user-requests.dto.ts`. This is the second copy of the rule; replace it with the shared helper (single rule).
- Seed stores `SUPER_ADMIN_EMAIL` verbatim. Its idempotency check is role-based (any active SUPER_ADMIN), not email-based, so a differently-cased seed never duplicates; only the stored case matters.
- Dev DB check (done by planner): `users` has 1 row, `admin@hub.dev` (already lowercase). Migrations only forward; none needed.

## Design decisions (implementer follows verbatim)
D1. `normalizeEmail(raw: string): string` = `raw.trim().toLowerCase()` in new `packages/shared/src/auth/email.ts`, exported from the barrel. No other normalization (no unicode folding, no dot/plus-tag stripping).
D2. `loginSchema.email` in shared becomes `z.string().transform(normalizeEmail).pipe(z.string().email())` so the zod consumer matches the Nest DTO (keep existing `.email()` style, no new API).
D3. `LoginDto.email`: add `@Transform(({value}) => typeof value === 'string' ? normalizeEmail(value) : value)` ABOVE `@IsEmail()` (needed so padded input passes validation; ValidationPipe already runs `transform: true`). Swagger `@ApiProperty` description: "Trimmed and lowercased before lookup".
D4. `AuthService.login(email, password)`: first line `const normalized = normalizeEmail(email)`, use it in `findUnique`. Defence in depth (service callable without the pipe, e.g. unit tests). Generic 401 behavior, enumeration behavior, status-ACTIVE check unchanged.
D5. `user-requests.dto.ts`: delete local `trimLower`; both Create/Update `@Transform` call a thin wrapper over `normalizeEmail` (keep local `trim` for name). No behavior change.
D6. `seed.ts` `readSuperAdminCredentials`: return `email: normalizeEmail(email)`; the missing-var check stays on the RAW value being falsy (a whitespace-only value normalizes to `''`: also throw the same "required" error, test it).
D7. NO data migration. Reason: dev phase; only row is already lowercase; no deployed environment holds user data (DEC-097 e: no schema change). Documented note in completion notes: "any pre-existing mixed-case row from before #46 would be un-loginable by its typed case; fix by `UPDATE users SET email = lower(btrim(email))` after a duplicate check `SELECT lower(btrim(email)), count(*) FROM users GROUP BY 1 HAVING count(*)>1` returns 0 rows." Run both queries as an empirical gate (E8) to prove the dev DB is clean. `ponytail: unique index is on raw text, case-only duplicates blocked only because every writer normalizes -> add a unique functional index on lower(email) via a new forward migration (raw SQL; Prisma cannot express it) if a non-normalizing writer ever appears.`
D8. Unaffected: refresh/me/logout (id-based), JWT strategies, users.service (reads normalized DTO; P2002 -> 409 already).

## Batches (TDD: RED first; each batch is one hub-implementer delegation; run `pnpm --filter @hub/shared build` after Batch 2 because the api consumes `dist`)

### Batch 1: RED tests (3 files, append-only, minimal diffs; no existing test edited)
1. `apps/api/test/auth.e2e-spec.ts` (append inside the existing `describe('Auth (e2e) [F-27]')`, new nested `describe('login email normalization [F-27]')`; create scratch users via `createScratchUser`, which stores lowercase `${prefix}-${uuid}@example.com`; register new scratch users in `createdUserIds`):
   - mixed-case email (`email.toUpperCase()` of local+domain) + correct password -> 200/201, `data.user.email === lowercase stored`, no `passwordHash` anywhere (`hasKeyDeep`).
   - padded (`'  ' + email + '  '`, and padded+uppercase) -> 200/201.
   - unknown email in mixed case -> 401 with the SAME body message as wrong-password for an existing user (`'Invalid credentials'`); proves enumeration unchanged.
   - wrong password with mixed-case email -> 401; DB row `failedLoginAttempts === 1`.
   - lockout across variants: a dedicated new scratch user; alternate lowercase / UPPERCASE / padded wrong-password logins (each with a fresh IP via `nextIp()`, same as existing lockout tests) until `LOCKOUT_MAX_ATTEMPTS` (10) reached -> DB `failedLoginAttempts === 10`, `lockoutUntil` set; then the CORRECT password via a case variant -> 401 (locked); via lowercase -> 401.
   - invalid shapes still 400: `'not-an-email'`, empty string, `'   '`.
2. `apps/api/test/users.e2e-spec.ts` (append inside `describe('POST /users [F-28]')` or a new nested describe; reuse that file's `http(adminToken)`, `login`, `createdUserIds` helpers):
   - create `base = users-e2e-case-<uuid>@example.com`; then POST again with `base.toUpperCase()` and with `'  ' + base + '  '` -> both 409 `'Email already in use'`, `prisma.user.count({where:{email:{equals:base,mode:'insensitive'}}}) === 1`.
   - PATCH user B's email to user A's email in different case -> 409; B unchanged in DB.
   - user created with mixed-case email can log in with a differently-cased/padded variant (create -> login round-trip).
3. `apps/api/prisma/seed.e2e-spec.ts` (append inside `describe('seedSuperAdmin')`, which already deactivates/restores real SUPER_ADMINs per test):
   - `readSuperAdminCredentials({SUPER_ADMIN_EMAIL: '  Admin@Example.COM ', SUPER_ADMIN_PASSWORD: 'x'}).email === 'admin@example.com'`.
   - whitespace-only `SUPER_ADMIN_EMAIL` throws the "required" error.
   - `seedSuperAdmin(prisma, {SUPER_ADMIN_EMAIL: testEmail.toUpperCase(), ...})` creates a row whose stored email === `testEmail` (lowercase), and a second call with the original-case env is a no-op (exactly 1 SUPER_ADMIN user with that email, `count` via `equals + mode: 'insensitive'`). Cleanup already keys on lowercase `testEmail`.
Verify RED: `pnpm --filter @hub/api test:e2e -- auth.e2e-spec seed.e2e-spec users.e2e-spec` -> the new login/lockout/seed tests FAIL (create/update-409 case tests may already pass: they are regression guards). Record which fail.

### Batch 2: shared helper (3 files)
1. `packages/shared/src/auth/email.ts` (new): D1.
2. `packages/shared/src/index.ts`: add `export * from './auth/email';`.
3. `packages/shared/src/auth/schemas.ts`: D2 (import from `./email`).
Verify: `pnpm --filter @hub/shared build && pnpm --filter @hub/shared lint`; `grep -n normalizeEmail packages/shared/dist/index.d.ts packages/shared/dist/auth/email.d.ts` shows export.

### Batch 3: login path (3 files)
1. `apps/api/src/modules/auth/dto/login.dto.ts`: D3 (import `Transform` from `class-transformer`, `normalizeEmail` from `@hub/shared`).
2. `apps/api/src/modules/auth/auth.service.ts`: D4 (import `normalizeEmail` from `@hub/shared`; one-line change in `login`; nothing else).
3. `apps/api/src/modules/auth/auth.service.spec.ts` (append unit tests in `describe('login')`; this file mocks Prisma by existing design, the real-DB proof is the e2e): `login('  ADA@Example.com ', pw)` calls `findUnique` with `where: { email: 'ada@example.com' }`; unknown mixed-case still generic `UnauthorizedException`.
Verify: `pnpm --filter @hub/api test` (58 + new unit green); `pnpm --filter @hub/api test:e2e -- auth.e2e-spec` green.

### Batch 4: write path + seed (2 files)
1. `apps/api/src/modules/users/dto/user-requests.dto.ts`: D5.
2. `apps/api/prisma/seed.ts`: D6.
Verify: `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @hub/api test:e2e` (all 84 pre-existing e2e + new green; 58 pre-existing unit green).

## Regression surface
`auth.service.ts` login (all auth e2e journeys: lockout, throttle, refresh, logout, race); `LoginDto` Swagger doc (`swagger.e2e-spec.ts` must stay green); users create/update DTO transforms (users.e2e incl. audit-line tests asserting lowercased email); seed.e2e (shared dev DB: tests deactivate and restore the real admin; must leave `admin@hub.dev` ACTIVE); `@hub/shared` barrel consumers (api + Docker image copy of `packages/shared`). Shared `dist` must be rebuilt or api tests silently use stale code.

## DoD gates

### Static (hub-reviewer)
S1. `grep -rn "toLowerCase" apps/api/src apps/api/prisma/seed.ts packages/shared/src` -> exactly ONE hit (inside `packages/shared/src/auth/email.ts`). Proves single rule; `trimLower` no longer defined: `grep -rn "trimLower" apps/api/src` -> 0 hits.
S2. `grep -rn "normalizeEmail" apps/api/src apps/api/prisma/seed.ts packages/shared/src` shows uses in: `login.dto.ts`, `auth.service.ts`, `user-requests.dto.ts` (create + update), `seed.ts`, `schemas.ts`, `email.ts`, `index.ts`.
S3. `login.dto.ts`: `@Transform` appears before `@IsEmail()` on `email`.
S4. `git diff --stat` touches only: the 3 test files + `auth.service.spec.ts`, `packages/shared/src/{index.ts,auth/email.ts,auth/schemas.ts}`, `login.dto.ts`, `auth.service.ts`, `user-requests.dto.ts`, `seed.ts` (+ `tasks/046-*` by orchestrator). No `schema.prisma`, no `migrations/`, no `infra/`, no `Dockerfile`, no `package.json`/lockfile change.
S5. `auth.service.ts` diff: `recordFailedAttempt` and the SQL unchanged (lockout stays keyed by `WHERE id = ${user.id}`); `INVALID_CREDENTIALS` still the only thrown message in `login`.
S6. No new dependency; no `any`; existing tests not edited, only appended (`git diff` on the spec files shows additions only).
S7. Swagger: no route added/changed in shape (LoginDto/ response DTOs unchanged except the description string); existing `@ApiResponse` on `/auth/login` (201 `AuthResponseDto`-type, 400, 401, 429) untouched; `swagger.e2e-spec.ts` green.

### Empirical (hub-tester; backend only, no browser UI)
E1. RED-then-GREEN evidence recorded: Batch-1 failing list, then all green after Batch 4.
E2. Full suites: `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @hub/api test:e2e` all exit 0; counts >= 58 unit and >= 84 e2e plus the new tests, zero skipped.
E3. Live API (`pnpm dev` api on :4000, seeded admin `admin@hub.dev`): `curl -s -X POST localhost:4000/api/v1/auth/login -H 'content-type: application/json' -d '{"email":"  ADMIN@Hub.DEV ","password":"<SUPER_ADMIN_PASSWORD>"}'` -> 200/201 with `data.user.email == "admin@hub.dev"`; same body with a wrong password -> 401 `{"error":{"statusCode":401,"message":"Invalid credentials"}}` identical to unknown `nobody@hub.dev` -> 401 same body.
E4. Lockout across case: against a scratch user (not the real admin; delete after, or use the e2e), 10 wrong-password attempts alternating `X@..`, `x@..`, padded -> DB `failed_login_attempts=10`, `lockout_until` non-null; correct password in any case -> 401.
E5. Case-only duplicate: POST /users with existing email uppercased -> 409 `Email already in use`; padded -> 409; PATCH collision -> 409; DB count of case-insensitive matches stays 1.
E6. Seed: `SUPER_ADMIN_EMAIL='  Ops@Example.COM '` seed on a throwaway DB or via the seed e2e stores `ops@example.com`; second run no-op. Do not run against the shared dev DB in a way that alters the real admin.
E7. Mutation checks (revert after each, confirm GREEN again): (a) change `normalizeEmail` body to `return raw` -> mixed-case login, padded login, lockout-across-case and seed tests FAIL; (b) remove only the D4 line in `auth.service.ts` (keep DTO transform) -> unit spec fails but e2e still passes (documents defence-in-depth); (c) remove the D3 `@Transform` -> padded-email e2e fails (400).
E8. Data-state proof on dev DB (read-only): `docker exec hub-dev-postgres-1 psql -U hub -d hub_dev -c "select count(*) from users where email <> lower(btrim(email))"` -> 0, and `select lower(btrim(email)), count(*) from users group by 1 having count(*)>1` -> 0 rows. If non-zero: STOP, report to orchestrator (a migration decision is then needed).
E9. Image gate (DEC-107): `docker build --target runtime -f apps/api/Dockerfile .` (Dockerfile UNMODIFIED) exits 0; boot the image with dev env (DATABASE_URL to dev PG, JWT secrets, SUPER_ADMIN vars, WEB_ORIGIN) -> `/api/v1/health` 200, mixed-case login 200/201 inside the container proves the rebuilt `@hub/shared` is in the image; clean up container. If #48 has not landed and the build fails at `nest build` with TS2694, that is the known pre-existing DEC-107 defect: report it, do not patch here.

### Gatekeeper criteria (zero context)
G1. F-27 (SRS auth/lockout, 10 attempts / 15 min per account) still holds and cannot be bypassed by email case or padding.
G2. F-28 / DEC-097: user email stored trimmed+lowercased; duplicate-by-case -> 409; no AuditLog or schema semantics changed; response views never leak `passwordHash`/lockout fields.
G3. ADR-0004 / auth spec: generic 401 for unknown / wrong password / locked / inactive (no enumeration); cookie/JWT behavior unchanged.
G4. CLAUDE.md: rule 9 invariant untouched; minimal-diff discipline (<= listed files, no new dependency, no unrequested abstraction beyond the single shared helper); `packages/shared` is the home of shared rules (rule 7 spirit); DEC-107 image-build gate evidenced; migrations forward-only and none added, with D7 rationale and E8 proof recorded.
G5. Tests are real-DB, `[F-27]`/`[F-28]` tagged, mutation-checked (E7), no mocks added to e2e (the one mocked unit file is pre-existing convention).

## Assumptions (defaults, no blocking questions)
A1. No unicode normalization or plus/dot handling; trim + lowercase only (matches existing create/update).
A2. No deployed environment with real user rows exists, so no backfill (D7); E8 proves dev DB clean.
A3. Padded login email is accepted (trimmed) rather than 400, because create/update already trim and the same rule should apply everywhere.
A4. Password is never trimmed or case-folded.
A5. `@hub/shared` is consumed via built `dist`; implementer rebuilds it after Batch 2.
