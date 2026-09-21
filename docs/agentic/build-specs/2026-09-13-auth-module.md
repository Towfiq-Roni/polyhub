# Build Spec: Auth module (login/refresh/logout/me, argon2id, lockout) — TASKS.md #1

**Slug:** `auth-module` · **Date:** 2026-09-13 · **Planner:** hub-planner
**Backlog row:** TASKS.md #1, `[E-07/F-27]`, blocks everything else (foundational).

## Sources read (cite, don't trust summary)

- `planning/FEATURES.md` F-27 — description, deps (none), risk note ("token lifetime/lockout values already locked").
- `planning/SRS.md` §3.7 FR-ADMIN-01/02, and the "Auth/session detail" line directly under the table (line 210): **access JWT 1 day TTL** (DEC-073/ADR-0012 supersedes the old 15 min), refresh 7 days, argon2id, lockout 10 failed attempts/15 min. FR-ADMIN-01 (SUPER_ADMIN invariant) and FR-ADMIN-06 (audit) noted as adjacent but out of scope here.
- `planning/ERD.md` §3.1 User, §3.2 Role, §3.3 Permission, §3.4 UserRole, §3.5 RolePermission, §1.4 delete convention (RESTRICT, archive-via-status, no soft-delete), §1.5 single-tenant.
- `docs/adr/0004-jwt-argon2-auth.md` (Accepted parts still binding: argon2id, refresh in httpOnly cookie not localStorage, SUPER_ADMIN-mediated reset, no SMTP) and `docs/adr/0012-jwt-access-token-ttl-1-day.md` (supersedes only the access TTL number, 15m→1d).
- `docs/adr/0007-allow-only-rbac.md` — permission keys live only in `packages/shared`, format `resource.action`; single global `PermissionsGuard` is a **separate task (#4)**, not built here.
- `CLAUDE.md` Non-Negotiable Rules #7 (RBAC keys only in packages/shared), #8 (audit sensitive writes), #9 (≥1 active SUPER_ADMIN invariant).
- `analysis/task-breakdown.md` Phase 1 (repo/apps/Prisma scaffold) and Phase 2 (`Auth module: login/refresh/logout/me, argon2id, lockout, SUPER_ADMIN env-seed bootstrap`) — confirms this task is a Phase-2 feature but has a hard Phase-1 scaffold prerequisite that doesn't exist yet.
- `analysis/development-plan.md` §monorepo layout, §Testing Strategy, §Migrations ("forward-only, `migrate deploy`, never auto-migrate on boot").
- `analysis/requirement-gaps.md` §C S-1/S-2 — confirms JWT/argon2/lockout/env-seed decision provenance.
- Skills loaded: `hub-codebase` (placement/naming/envelope/thin-controller rules), `nestjs-best-practices` (hub precedence overrides — **note:** that skill file's own security-auth-jwt override text still says "access 15m/refresh 7d"; this is STALE, superseded by ADR-0012/SRS as re-confirmed today per DEC-076 — this spec follows SRS.md/ADR-0012 (1 day access), not the skill file's cached text; flagged for a future skill-doc fix, not blocking this task).
- `accountant-expert`/`hub-ledger` — **not loaded**, no money path in this task (judgment call, confirmed correct: Auth touches no Account/JournalEntry/payment rows).

## Objective

Stand up the minimum greenfield monorepo scaffold (pnpm workspace, `packages/shared` auth contracts, `apps/api` NestJS bootstrap, Prisma with a User/Role/UserRole slice) and a working, testable login → access/refresh JWT → refresh → logout → `/me` flow, with argon2id hashing, a 10-attempts/15-minute lockout, and an env-driven SUPER_ADMIN bootstrap seed — so that every subsequent write-capable feature has an auth foundation to sit on.

## Scope boundary (explicit, do not build)

- Full Phase 1 (web app, Docker, CI/CD, full ERD migration, ESLint/Prettier/husky/commitlint, all entities) is **not** this task — only the slice strictly required for auth exists after this spec. **Flag to orchestrator:** batches 1–7 below are Phase-1-prerequisite scaffolding bundled into this task per the task's own instruction (not silently — called out here). Recommend treating them as a lighter static-only review pass (no business logic to misjudge) before batches 8–12 (actual auth logic) get the full quality chain.
- `PermissionsGuard`, permission catalog (~60 keys), Role/Permission CRUD — task #3/#4.
- User CRUD, activate/deactivate, admin-mediated reset — task #2.
- SUPER_ADMIN-invariant enforcement on deactivation/role-removal (422) — task #5 (bootstrap here only *creates* the one guaranteed SUPER_ADMIN; no deactivation path exists yet to violate the invariant).
- AuditLog / audit interceptor — task #6. Login/logout/refresh events are **not** written to AuditLog this task (FR-ADMIN-06's enumerated sensitive-write list is CRUD-style business writes, not auth events; lockout state is visible via `User.lockoutUntil` in the meantime). Call this out plainly — it is a scope boundary, not a silent gap.
- `TeamMember` linkage on `User` (ERD's `teamMemberId`) — deferred, `TeamMember` table doesn't exist yet (task in the Teams epic). Add the column later when that table lands.
- Self-service password reset / forgot-password endpoints — explicitly out per ADR-0004 (SUPER_ADMIN-mediated only, no SMTP). Do not build `/auth/forgot-password` or `/auth/reset-password`.

## Flagged deviation from ERD (must be logged, not silently built)

`planning/ERD.md` §3.1 User does not list lockout-tracking fields. Lockout (10 failed attempts / 15 min, SRS §3.7) cannot be implemented without persistent per-user state. This spec adds three columns to `User` not currently in the ERD table: `failedLoginAttempts int default 0`, `firstFailedAttemptAt timestamptz nullable`, `lockoutUntil timestamptz nullable`. This is an ERD extension, not a contradiction (ERD predates today's lockout-mechanics detail work). **Orchestrator action required before this task is marked DONE:** append a `docs/memory/DECISIONS.md` line recording this ERD extension (planner cannot write memory files — no Edit tool, and DECISIONS.md isn't on the planner's allowed-write list). hub-gatekeeper should treat the deviation as accepted only if that DECISIONS.md entry exists by the time it runs (see Gate G6).

## Design decisions the implementer must follow verbatim

1. **Refresh token transport:** httpOnly, `secure` (prod only, env-gated), `sameSite=lax` cookie named `refresh_token`, `path=/api/v1/auth`. Access token: returned in the login/refresh JSON response body only (`{data:{accessToken, user}}`), never cookied — client keeps it in memory, sends `Authorization: Bearer <token>`. This matches ADR-0004's explicit refresh-cookie/no-localStorage requirement; access-token storage is unspecified by the ADR, so in-memory + header is the simplest (YAGNI rung 1) choice.
2. **SUPERSEDED 2026-09-13 (DEC-078) — real per-device session revocation, not stateless-only.** This decision originally said refresh was stateless-JWT-only with no revocation list, logout only clearing the cookie client-side. Batch 10's own empirical test proved that directly contradicts Empirical Gate E10 below (a stateless refresh token cannot be invalidated by logout, by construction) — not a citation error, a genuine irreconcilable conflict. Presented to the stakeholder as a 3-way tradeoff including the easy-to-miss side effect that a naive single `tokenVersion` counter would log a user out of every device at once; stakeholder chose real per-device revocation, built now, not deferred (DEC-078). Revised decision: add a `Session` model (`id`, `userId`, `revokedAt DateTime?`, `createdAt`, `expiresAt`) with `onDelete: Restrict` from `User`; its `id` is embedded as a `sid` claim in the refresh JWT payload (access JWT unaffected — still stateless, per ADR-0012's already-accepted access-token blast-radius tradeoff, untouched by this revision). `login()` creates one `Session` row per login. `JwtRefreshStrategy.validate()` loads the `Session` by `sid` and rejects (401) if it's missing, revoked, or past `expiresAt`. `logout()` sets `revokedAt=now()` on that one `Session` row only — other devices'/sessions' rows are untouched, which is what makes this per-device rather than a global "log out everywhere." `refresh()` may rotate the JWT while keeping the same `Session` row (implementer's call, either is acceptable — reissuing a new `Session` row per refresh is also fine if simpler, as long as the old `sid` a rotated-away token embedded stops being independently useful). This is a real, intentional narrowing of "no session state" — logged as DEC-078, not silently built.
3. **Lockout window semantics:** on a failed attempt, if `firstFailedAttemptAt` is null or older than `LOCKOUT_WINDOW_MINUTES` ago, reset `failedLoginAttempts=1, firstFailedAttemptAt=now`; else increment. If the incremented count reaches `LOCKOUT_MAX_ATTEMPTS`, set `lockoutUntil = now + LOCKOUT_WINDOW_MINUTES`. A locked account is rejected (generic 401 message, see below) even with the correct password, until `lockoutUntil` passes. On any successful login, reset all three fields to `0/null/null` and set `lastLoginAt=now`.
4. **No user-enumeration / no factor-leak in error responses.** Unknown email, wrong password, inactive user, and locked user all return the same generic `401 { message: "Invalid credentials" }` (locked can use `423` — pick one and apply it consistently; document the choice in code, don't mix). Never reveal which reason.
5. **Response envelope `{ data, meta? }`** (hub-codebase convention) via a global `TransformInterceptor`; errors via a global exception filter — both introduced in this task since no prior app.module exists to retrofit later.
6. **Controllers stay thin**: `auth.controller.ts` only calls `authService.*` and sets/clears the cookie — no Prisma/argon2 calls in the controller file.
7. **Env-driven bootstrap, no hardcoded credentials anywhere** (code, seed, `.env.example` defaults for the two secret values must be empty placeholders, not real-looking creds). Seed is idempotent: skip creating a SUPER_ADMIN if an active one already exists.

## Batches (≤3 files each, dependency order)

### Batch 1 — Monorepo root scaffold
1. `package.json` (root) — `private:true`, `"packageManager":"pnpm@<pin>"`, workspaces via `pnpm-workspace.yaml`, scripts `dev`/`lint`/`typecheck`/`test`/`build` delegating to `pnpm -r <script>` (note in a comment that `dev` only runs `apps/api` until `apps/web` exists).
2. `pnpm-workspace.yaml` — `packages: ["apps/*", "packages/*"]`.
3. `tsconfig.base.json` — strict TS base (`strict:true`, `target:ES2022`, `module:NodeNext`) extended by each workspace package.

### Batch 2 — `packages/shared` init
1. `packages/shared/package.json` — name `@hub/shared`, `main`/`types` pointing at build output, `zod` dependency.
2. `packages/shared/tsconfig.json` — extends root base.
3. `packages/shared/src/index.ts` — barrel file (empty exports for now, filled by batch 3).

### Batch 3 — `packages/shared` auth-relevant contracts
1. `packages/shared/src/enums/status.ts` — `export enum Status { ACTIVE = 'ACTIVE', INACTIVE = 'INACTIVE' }`, shared generic Active/Inactive enum per ERD §1.3 modeling convention (used by both `User.status` and `Role.status`).
2. `packages/shared/src/permissions/permission-key.ts` — `export type PermissionKey = \`${string}.${string}\`;` and `export const ROLE_NAMES = { SUPER_ADMIN: 'SUPER_ADMIN' } as const;` **placeholder only** — do not enumerate the ~60-key catalog here, that's task #3's job (keep this file ≤10 lines).
3. `packages/shared/src/auth/schemas.ts` — `export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) })` + inferred `LoginInput` type. Update `src/index.ts` to re-export all three new files (edit, same batch).

### Batch 4 — `apps/api` scaffold core
1. `apps/api/package.json` — deps: `@nestjs/core @nestjs/common @nestjs/platform-express @nestjs/config @nestjs/jwt @nestjs/passport passport passport-jwt argon2 cookie-parser class-validator class-transformer @prisma/client zod`; devDeps: `@nestjs/cli prisma typescript ts-node @types/passport-jwt @types/cookie-parser jest ts-jest supertest ...`.
2. `apps/api/tsconfig.json` — extends root base, `experimentalDecorators`/`emitDecoratorMetadata` true.
3. `apps/api/src/main.ts` — `NestFactory.create(AppModule)`; `app.use(cookieParser())`; global `ValidationPipe({whitelist:true, transform:true})`; global `TransformInterceptor`/`HttpExceptionFilter` (from batch 5); `app.enableCors({origin: <web origin from config>, credentials:true})`; `setGlobalPrefix('api/v1')`; Swagger at `/api/docs`; `app.enableShutdownHooks()`; `listen(config PORT, default 4000)`.

### Batch 5 — `apps/api` cross-cutting
1. `apps/api/src/app.module.ts` — imports `ConfigModule.forRoot({validate: envValidation, isGlobal:true})`, `PrismaModule`, `AuthModule`, `ThrottlerModule.forRoot([...])` (short/default window, applied via guard only on the login route in batch 10 — defense-in-depth per `security-rate-limiting` override; nginx-level limiting stays a separate deployment-plan task).
2. `apps/api/src/common/interceptors/transform.interceptor.ts` — wraps every controller return value as `{ data: <value> }` unless already shaped that way.
3. `apps/api/src/common/filters/http-exception.filter.ts` — global filter → `{ error: { statusCode, message } }`, logs via Nest `Logger` (no `console.log`).

### Batch 6 — `apps/api` config/health
1. `apps/api/src/config/env.validation.ts` — zod schema validating `DATABASE_URL, JWT_ACCESS_SECRET, JWT_ACCESS_TTL(default '1d'), JWT_REFRESH_SECRET, JWT_REFRESH_TTL(default '7d'), LOCKOUT_MAX_ATTEMPTS(default 10), LOCKOUT_WINDOW_MINUTES(default 15), SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, COOKIE_SECURE(bool), PORT(default 4000)`; throws on boot if a required secret is missing (no silent defaults for secrets).
2. `apps/api/src/health/health.controller.ts` — `GET /api/v1/health` → `{status:'ok'}` (proves DB reachability by pinging `PrismaService` — a trivial `SELECT 1`).
3. `apps/api/.env.example` — documents every var from env.validation.ts; secret values left blank/placeholder, `LOCKOUT_MAX_ATTEMPTS=10`, `LOCKOUT_WINDOW_MINUTES=15`, `JWT_ACCESS_TTL=1d`, `JWT_REFRESH_TTL=7d`.

### Batch 7 — Prisma + DB layer
1. `apps/api/prisma/schema.prisma` — `generator client`, `datasource db` (postgresql, `env("DATABASE_URL")`); `enum Status { ACTIVE INACTIVE }`; `model User { id String @id @default(uuid()) email String @unique passwordHash String name String status Status @default(ACTIVE) failedLoginAttempts Int @default(0) firstFailedAttemptAt DateTime? lockoutUntil DateTime? lastLoginAt DateTime? createdAt DateTime @default(now()) updatedAt DateTime @updatedAt userRoles UserRole[] }` with a `//` comment noting `teamMemberId` deferred until TeamMember ships; `model Role { id String @id @default(uuid()) name String @unique status Status @default(ACTIVE) createdAt/updatedAt userRoles UserRole[] }`; `model UserRole { userId String roleId String assignedAt DateTime @default(now()) user User @relation(fields:[userId], references:[id], onDelete: Restrict) role Role @relation(fields:[roleId], references:[id], onDelete: Restrict) @@id([userId, roleId]) }`. Snake_case DB columns via `@@map`/`@map` per hub-codebase convention.
2. `apps/api/src/prisma/prisma.service.ts` — `PrismaClient` extended, `onModuleInit` connect, `onModuleDestroy`/`enableShutdownHooks` for graceful drain.
3. `apps/api/src/prisma/prisma.module.ts` — `@Global()` module exporting `PrismaService`.

**After this batch:** implementer runs `pnpm --filter api exec prisma migrate dev --name init_auth` to produce a committed migration (forward-only convention, `analysis/development-plan.md` §Migrations) — a checked-in `apps/api/prisma/migrations/*/migration.sql` is a Batch 7 deliverable, not optional.

### Batch 8 — Auth strategies/guards (part 1)
1. `apps/api/src/modules/auth/strategies/jwt-access.strategy.ts` — `PassportStrategy(Strategy,'jwt-access')`, extracts from `Authorization: Bearer`, secret `JWT_ACCESS_SECRET`, `validate(payload)` loads user by `payload.sub` via Prisma, throws `UnauthorizedException` if not found or `status!==ACTIVE`, returns `{id,email,name,status}`.
2. `apps/api/src/modules/auth/strategies/jwt-refresh.strategy.ts` — `PassportStrategy(Strategy,'jwt-refresh')`, custom `jwtFromRequest` extractor reading `req.cookies.refresh_token`, secret `JWT_REFRESH_SECRET`, same validate shape.
3. `apps/api/src/modules/auth/guards/jwt-access.guard.ts` — `class JwtAccessGuard extends AuthGuard('jwt-access') {}`.

### Batch 9 — Auth guard/decorator/DTO (part 2)
1. `apps/api/src/modules/auth/guards/jwt-refresh.guard.ts` — `class JwtRefreshGuard extends AuthGuard('jwt-refresh') {}`.
2. `apps/api/src/modules/auth/decorators/current-user.decorator.ts` — `@CurrentUser()` param decorator pulling `req.user`.
3. `apps/api/src/modules/auth/dto/login.dto.ts` — class-validator DTO mirroring `packages/shared`'s `loginSchema` (`@IsEmail() email`, `@IsString() @IsNotEmpty() password`).

### Batch 10 — Auth service/module/controller
1. `apps/api/src/modules/auth/auth.service.ts` — `login(email,password)` (lockout/verify logic per Design Decisions #3/#4, argon2 `verify`/`hash` with `{type: argon2.argon2id}`, issues access+refresh JWTs via `JwtService` with the two distinct secrets/TTLs from config, returns `{accessToken, refreshToken, user}` — controller strips `refreshToken` into the cookie, never returns it in the body), `refresh(userId)` (re-check `status===ACTIVE`, issue new access token + rotated refresh token), `me(userId)` (fresh DB lookup, returns `{id,email,name,status,roles: role names[]}` via the `UserRole→Role` join — no permission expansion, that's task #4).
2. `apps/api/src/modules/auth/auth.module.ts` — registers `JwtModule` (no default secret — service picks secret per-call), both strategies, both guards, `AuthController`, `AuthService`.
3. `apps/api/src/modules/auth/auth.controller.ts` — `POST /auth/login` (public, `@Throttle` decorator, sets refresh cookie, returns `{accessToken,user}`), `POST /auth/refresh` (`@UseGuards(JwtRefreshGuard)`, sets new refresh cookie, returns `{accessToken}`), `POST /auth/logout` (`@UseGuards(JwtAccessGuard)`, clears refresh cookie, `204`), `GET /auth/me` (`@UseGuards(JwtAccessGuard)`, returns `me()` result). Import `AuthModule` into `app.module.ts` (edit, same batch).

### Batch 11 — SUPER_ADMIN bootstrap seed
1. `apps/api/prisma/seed.ts` — idempotent: if any `User` with an active `SUPER_ADMIN` `UserRole` exists, no-op + log; else upsert `Role{name:'SUPER_ADMIN'}`, create `User` from `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD` env vars (argon2id-hash the password, never store plaintext, never log it), create the `UserRole` join. Fails loudly (non-zero exit) if the two env vars are unset — never falls back to a hardcoded default.
2. `apps/api/package.json` (edit) — add `"prisma":{"seed":"ts-node prisma/seed.ts"}` and any newly-needed devDeps (`ts-node` if not already added in batch 4).

### Batch 12 — Tests
1. `apps/api/test/jest-e2e.json` — e2e Jest config (per `analysis/development-plan.md` §Testing Strategy: Jest for api).
2. `apps/api/test/auth.e2e-spec.ts` — supertest against a real Nest app instance + real (test) Postgres: covers login success, wrong-password 401, 10-failures→lockout→423/401-even-with-correct-password, window-expiry reset (manipulate `firstFailedAttemptAt` via Prisma directly, don't sleep 15 real minutes), refresh success, refresh with missing/invalid cookie→401, logout clears cookie + subsequent refresh fails, `/me` success/401, `/health` 200. One `it()` per Empirical Gate below (E1–E12).
3. `apps/api/src/modules/auth/auth.service.spec.ts` — unit tests (mocked `PrismaService`) for the lockout window state machine (Design Decision #3) in isolation — increments, window-reset, lockout-trip, success-reset — independent of HTTP.

## Definition of Done gates

### Static gates (hub-reviewer — grep/pattern, run from repo root)

- **S1** argon2id used, nothing weaker: `grep -n "argon2id" apps/api/src/modules/auth/auth.service.ts apps/api/prisma/seed.ts` finds matches; `grep -rniE "bcrypt|md5|sha1\(" apps/api/src apps/api/prisma` → no matches.
- **S2** No plaintext password logged: `grep -rniE "log.*password|console\.log" apps/api/src/modules/auth` → no matches.
- **S3** TTLs match SRS/ADR-0012: `grep -n "JWT_ACCESS_TTL=1d" apps/api/.env.example` and `grep -n "JWT_REFRESH_TTL=7d" apps/api/.env.example` both match.
- **S4** Lockout constants match SRS §3.7: `grep -n "LOCKOUT_MAX_ATTEMPTS=10" apps/api/.env.example` and `grep -n "LOCKOUT_WINDOW_MINUTES=15" apps/api/.env.example` both match.
- **S5** Refresh token never in a JSON response body: `grep -n "refreshToken" apps/api/src/modules/auth/auth.controller.ts` — the only occurrences are destructuring-into-cookie, never inside a returned object literal (manual read, not just grep count).
- **S6** Refresh cookie flags correct: `grep -n "httpOnly: true" apps/api/src/modules/auth/auth.controller.ts` present; `grep -n "sameSite: 'lax'" apps/api/src/modules/auth/auth.controller.ts` present.
- **S7** Controller has zero direct data/crypto access: `grep -n "prisma\.\|argon2\." apps/api/src/modules/auth/auth.controller.ts` → no matches.
- **S8** No permission-catalog scope creep: `wc -l packages/shared/src/permissions/permission-key.ts` ≤ 10 lines; `grep -rn "PermissionsGuard\|@Permissions(" apps/api/src/modules/auth` → no matches (this task correctly doesn't gate on permissions yet).
- **S9** No hardcoded credentials anywhere: `grep -rniE "admin@|password123|changeme|super-?secret" apps/api/prisma/seed.ts apps/api/.env.example` → no matches; seed reads only `process.env.SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD`.
- **S10** Migration checked in (forward-only convention): `ls apps/api/prisma/migrations/*/migration.sql` resolves to ≥1 file.
- **S11** No money/float anywhere in this task's files (defensive — this task has no money path): `grep -rn "Float" apps/api/prisma/schema.prisma` → no matches.
- **S12** No self-service reset endpoints built (ADR-0004 scope boundary): `grep -rn "forgot-password\|reset-password" apps/api/src/modules/auth` → no matches.

### Empirical gates (hub-tester — run `apps/api` against a real test Postgres, HTTP-level; this task has no browser UI, so these are HTTP/API journeys, not Playwright)

- **E1** `pnpm --filter api exec prisma migrate deploy && pnpm --filter api exec prisma db seed` with `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD` set → exactly one `User` row exists with `status=ACTIVE`, joined via `UserRole`→`Role.name='SUPER_ADMIN'`.
- **E2** `POST /api/v1/auth/login` with correct seeded credentials → `201`/`200`, body `{data:{accessToken, user:{email, roles:['SUPER_ADMIN']}}}`, response has `Set-Cookie: refresh_token=...; HttpOnly; SameSite=Lax`.
- **E3** `POST /api/v1/auth/login` wrong password → `401`, body has no `accessToken`, no `refresh_token` cookie set.
- **E4** Repeat E3 ten times total on the same account within the lockout window, then attempt login with the **correct** password on the 11th try → still rejected (401/423), proving lockout beats valid credentials once tripped.
- **E5** Directly set `firstFailedAttemptAt` to >15 min ago via Prisma (test-only DB write, not real sleep) then login with correct password → `200` success, and `SELECT "failedLoginAttempts" FROM "User" WHERE email=$1` = `0` afterward.
- **E6** `POST /api/v1/auth/refresh` with the cookie from E2 → `200`, new `accessToken` in body, new `Set-Cookie: refresh_token=...`.
- **E7** `POST /api/v1/auth/refresh` with no cookie → `401`.
- **E8** `GET /api/v1/auth/me` with `Authorization: Bearer <accessToken from E2>` → `200`, body `{data:{id,email,name,status:'ACTIVE',roles:['SUPER_ADMIN']}}`, and body has no `passwordHash` key anywhere.
- **E9** `GET /api/v1/auth/me` with no/garbage bearer token → `401`.
- **E10** `POST /api/v1/auth/logout` → `204`, `Set-Cookie: refresh_token=;...` (cleared); a subsequent `POST /api/v1/auth/refresh` reusing the pre-logout cookie value → `401` (now literally achievable per DEC-078's `Session` revocation — logout marks that session's `revokedAt`, `JwtRefreshStrategy` rejects a revoked session's `sid`).
- **E13** (new, DEC-078) A second, still-active login session (different `Session` row/device) is unaffected by the first session's logout — its own `POST /api/v1/auth/refresh` still succeeds after the first session logs out. Proves revocation is per-device, not global.
- **E11** `GET /api/v1/health` → `200 {data:{status:'ok'}}` (proves app boots + DB connects).
- **E12** Every response body across E2/E3/E6/E8 checked for absence of a `passwordHash` field (no accidental serialization leak).

### Gatekeeper criteria (hub-gatekeeper — maps to authoritative sources; standalone, reads only artifacts + docs)

- **G1** SRS §3.7 Auth/session detail (1d/7d/argon2id/10-per-15min) — verified by S1/S3/S4/E2/E4/E5.
- **G2** ADR-0004 + ADR-0012 — refresh via httpOnly cookie not localStorage (S5/S6/E2), no self-service reset endpoints built (S12), SUPER_ADMIN-mediated reset model left untouched (correct — that's task #2).
- **G3** CLAUDE.md rule #7 — permission keys live only in `packages/shared` (S8) — this task adds none beyond the placeholder, correctly.
- **G4** CLAUDE.md rule #9 (≥1 active SUPER_ADMIN) — bootstrap guarantees exactly one exists after seed (E1). **Do not fail this task for missing deactivation-time invariant enforcement** — that's task #5/F-30, out of scope here; only the bootstrap-creates-one guarantee applies.
- **G5** FR-ADMIN-02 elaboration (argon2id-hashed password) — S1.
- **G6** ERD §3.1 User fields — id/email/passwordHash/name/status/lastLoginAt present; `teamMemberId` correctly deferred (TeamMember doesn't exist yet); the three lockout columns are a documented ERD extension. **Gate condition:** PASS only if `docs/memory/DECISIONS.md` contains an entry (dated on/after this task's build) recording the lockout-column ERD extension — if that entry is missing, this is a REROUTE (not a build defect, a memory-sync defect — route back to orchestrator to log it, not back to hub-implementer).
- **G7** hub-codebase conventions — response envelope `{data}`/`{error}` (E2/E8/E11 body shapes), kebab-case files, thin controllers (S7).
- **G8** No business logic in controllers (CLAUDE.md + nestjs-best-practices arch rules) — S7.
- **G9** No money path — hub-ledger/accountant-expert correctly not invoked; confirm no `Account`/`JournalEntry`/payment model touched in `schema.prisma` this task (S11 plus manual schema read).

## Write + log

- Spec persisted at `docs/agentic/build-specs/2026-09-13-auth-module.md` (this file).
- RUNLOG line appended (see tool call).
