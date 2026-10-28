# Build spec: #52 login lockout keyed on (account, client IP) — "lockout only the attacker"

Date: 2026-10-26 · Task: tasks/052-lockout-account-dos-risk-adr-0004-addend.md · Trace: E-07/F-27
Sources that shaped this: CLAUDE.md rules 7, 8, 9; planning/SRS.md §3.7 (line ~210, lockout 10/15 min); planning/FEATURES.md F-27; docs/adr/0004-jwt-argon2-auth.md + planning/adr/ADR-0004-auth-approach.md; build-specs/2026-09-13-auth-module.md (DEC-078/079/080: Session model, atomic counter SQL); build-specs/2026-10-25-xff-throttler-e2e.md + DEC-111 (D5 pins per-account behaviour); auth.service.ts / auth.controller.ts / users.service.ts as read 2026-10-26; infra/nginx/default.conf.template (limit_req zone=login 5r/m burst=5, keyed `$binary_remote_addr`); env.validation.ts (LOCKOUT_MAX_ATTEMPTS default 10, LOCKOUT_WINDOW_MINUTES default 15).
Skills loaded: postgres-ledger (raw-SQL parameterization, forward-only migrations, FK indexes). No finance path touched (accounting-expert not applicable: no ledger/money).

## 1. Objective
Today a failed-login counter lives on the `users` row, so anyone who knows an email can lock that account (incl. the sole SUPER_ADMIN) for 15 min from any IPs. After this task, failed attempts and lockout are tracked per (user, client IP): the attacker's IP is locked out of that account, while the real user logging in from another IP is unaffected, and nobody can lock a victim out from elsewhere. The SUPER_ADMIN is never lockable by third parties.

## 2. Owner decision and interpretation
Owner (verbatim): "2 and lockout only the attacker". Question was: 1 keep+document, 2 exempt SUPER_ADMIN, 3 lock per account+IP.

**Assumption A1 (PROMINENT): the owner wants "a victim admin can never be locked out by others" AND "for everyone, lockout hits only the attacker".** Literal orchestrator reading R1 = (a) SUPER_ADMIN has NO lockout at all + (b) everyone else keyed per (account, IP). This spec instead implements **R2 = per-(account, IP) lockout for ALL accounts including SUPER_ADMIN** because R2 satisfies BOTH owner sentences (nobody, admin included, can be locked from another IP) without giving the admin a lockout-free brute-force surface. R2 is the recommended reading; R1's delta is fully specified in section 8 in case the owner rejects R2.

### Decision table (attacker IP = X, victim IP = Y, X != Y)
| Case | Today | R1 (admin: none, others: per IP) | R2 (all per IP) — IMPLEMENTED |
|---|---|---|---|
| Non-admin, attacker fails 10x from X; victim from Y | victim locked 15 min | victim OK; X locked | victim OK; X locked |
| Non-admin, attacker (X) with correct password later | locked | X locked | X locked (correct password still refused while locked; 401 generic) |
| SUPER_ADMIN, attacker fails 10x from X; admin from Y | admin locked 15 min | admin OK; X NOT locked (no lockout) | admin OK; X locked |
| SUPER_ADMIN, distributed attacker, N IPs | admin locked | no lockout ever; guess rate = throttle ceiling | each IP capped at ~10 guesses / 15 min; no lock on admin |
| Attacker and victim share one egress IP (NAT/office) | locked | non-admin victim locked until expiry; admin OK | victim (admin too) locked on that IP until expiry; recovery = wait <=15 min or another admin `POST /users/:id/activate` |
| Unknown / INACTIVE email | generic 401, no state | same | same, no row written (no enumeration, no table growth) |

### Owner-visible tradeoff (numbers)
- Edge limits: nginx `limit_req zone=login rate=5r/m burst=5` per real client IP; app `@Throttle` 5 / 60 s per `req.ip` (trust proxy 1); password min length 12; argon2id (tens of ms per guess).
- R1 admin exposure: no lockout, so a guesser's only ceiling is the throttle = 5 guesses/min/IP = **300/hour/IP**; 100 IPs = 30,000/hour. R2: after 10 failures an IP is locked 15 min => **~40/hour/IP** (7.5x less). Both are negligible against a >=12-char password, but R1 removes the only per-credential brake for the single most valuable account.
- R2 residual weakness (accepted): same-egress-IP attacker can lock the admin on that IP for 15 min (needs the attacker already on the admin's network); a botnet with unlimited IPs gets ~10 guesses/IP/15 min (identical to every other account).
- Cheap mitigations already included without scope growth: R2 itself (per-IP lock for admin); generic 401 for locked vs wrong; audit line on each lock trip (step 2.6).
- Not included (outside scope; say if wanted): IPv6 /64 bucketing (a single v6 /64 holder can rotate addresses past both the throttle and this lockout; `ponytail: exact-address key -> key on /64 prefix`), CAPTCHA, alerting.

## 3. Design decisions
- D-1 Data model: NEW table `login_attempts` keyed `(user_id, ip)` (PK). Reusing the user columns is impossible (one set of columns per user cannot hold per-IP state). Columns: `user_id TEXT NOT NULL FK users(id) ON DELETE CASCADE` (cascade so scratch-user cleanup in e2e and any future user hard-delete cannot be blocked), `ip TEXT NOT NULL`, `failed_count INTEGER NOT NULL`, `first_failed_at TIMESTAMP(3) NOT NULL`, `lockout_until TIMESTAMP(3) NULL`, `updated_at TIMESTAMP(3) NOT NULL`. PK (user_id, ip) doubles as the FK index (user_id is the leading column; no extra index).
- D-2 Atomic race-safe upsert in ONE raw statement (same philosophy as DEC-079 counter): `INSERT ... ON CONFLICT (user_id, ip) DO UPDATE SET ... RETURNING failed_count, lockout_until`, using CASE reset-vs-increment exactly like today's UPDATE, referencing `login_attempts.<col>` for existing-row values. Insert branch covers the first-failure race (two concurrent first failures: one INSERTs, the other takes the conflict path, count ends 2). Tagged-template `$queryRaw` only (parameterized; never `*Unsafe`).
- D-3 Lock check before password verify: `loginAttempt.findUnique({ where: { userId_ip } })`; `lockoutUntil > now` => same generic 401 `Invalid credentials` (Design Decision #4 unchanged; locked == wrong-password == unknown email, body identical). Correct password from the locked IP is refused; from another IP succeeds.
- D-4 Success: `loginAttempt.deleteMany({ userId, ip })` for THIS (user, ip) only (idempotent, no throw on missing row); other IPs' rows (an attacker's lock) are NOT cleared by the victim's success. `user.update` keeps only `lastLoginAt`.
- D-5 Expiry/cleanup (memory bound): rows exist only for real ACTIVE users and only after a wrong password, so growth <= (distinct failing IPs x <=5 users). Each failure also prunes THAT user's stale rows: `deleteMany({ userId, firstFailedAt < now-window, OR [lockoutUntil null, lockoutUntil <= now] })` (PK prefix scan, tiny). Success deletes its own row. `ponytail: prune-on-failure only; a user with no further failures keeps stale rows until next failure/unlock -> add a nightly DELETE if rows ever matter (<=5 users, bytes each)`.
- D-6 Client IP: controller passes Express `req.ip` (already derived with `trust proxy` 1, the same value the throttler uses; NEVER read `X-Forwarded-For` directly). Pure exported `normalizeClientIp(ip?: string): string` in auth.service.ts: `undefined/''` -> `'unknown'` (single shared bucket = fail-closed per-account lock for IP-less requests); strip a leading `::ffff:` (IPv4-mapped); lowercase; `.slice(0, 45)` (max textual IPv6; bounds junk XFF when the API is hit directly). IPv6 /64 grouping explicitly out of scope (ponytail above).
- D-7 SUPER_ADMIN detection: NOT NEEDED in R2 (no special-casing, rule 7 untouched, zero extra queries). R1 delta (section 8) costs zero extra queries too because `login()` already `include`s `userRoles.role`.
- D-8 Legacy columns `users.failed_login_attempts / first_failed_attempt_at / lockout_until`: stop reading and writing them, KEEP in schema (comment `@deprecated, unused since #52`), drop in a SEPARATE later forward migration (orchestrator: create a follow-up task via `task.py new`; dropping a column needs its own DEC and touches seed/tests). Rows locked at deploy time become unlocked (state <=15 min old; acceptable, noted in DEC).
- D-9 Admin unlock (`UsersService.activate` / `resetPassword`): replace `clearLockout` (user columns) by `loginAttempt.deleteMany({ where: { userId } })` (all IPs). `activate` on an already ACTIVE user = "unlock": `lockoutCleared: true` audit only when `count > 0` (same contract as today).
- D-10 Audit: on the failure that REACHES the threshold (`RETURNING failed_count == LOCKOUT_MAX_ATTEMPTS`) AuthService logs one `Logger('Audit')` line `{"actorId":null,"action":"auth.lockout","entityType":"User","entityId":<userId>,"ip":<ip>}`. No before/after, no email, no password. `ponytail: logger line, #6 replaces with AuditLog write (same marker as users.service)`.
- D-11 Throttler interplay for tests: per-IP throttle 5/60 s means 10 failures from one IP cannot happen via HTTP inside a minute. HTTP lockout journeys therefore run in a NEW file that sets `process.env.LOCKOUT_MAX_ATTEMPTS = '3'` before importing AppModule (env validated by `z.coerce.number()`); the real default 10 is pinned in auth.e2e through `app.get(AuthService).login(...)` directly (bypasses the controller throttle, hits the real DB).
- D-12 No new dependency; no `packages/shared` change; no new route and no controller business logic (controller only forwards `req.ip`).

## 4. Assumptions (defaults; not open questions)
- A2 Table name `login_attempts`, Prisma model `LoginAttempt`.
- A3 Behind nginx, `req.ip` is the real client; if trust-proxy were ever misconfigured every client would share nginx's IP and behaviour degenerates to today's per-account lock (fail-closed). Guarded by the existing trust-proxy parity test in auth-throttle.e2e.
- A4 Same window for counting and lock length (LOCKOUT_WINDOW_MINUTES), as today.
- A5 Locked path skips argon2 (faster than wrong-password path): pre-existing timing difference, unchanged, noted only.
- A6 DB session timezone is UTC (the existing raw SQL already compares `TIMESTAMP(3)` with `now()`); keep the same pattern.

## 5. Minute breakdown (one hub-implementer delegation per batch, <=3 files, TDD: tests first inside each batch, watch them fail, then implement)

### Batch 1 — schema + migration (2 files)
1.1 `apps/api/prisma/schema.prisma`: add model
```
model LoginAttempt {
  userId        String    @map("user_id")
  ip            String
  failedCount   Int       @map("failed_count")
  firstFailedAt DateTime  @map("first_failed_at")
  lockoutUntil  DateTime? @map("lockout_until")
  updatedAt     DateTime  @map("updated_at")
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([userId, ip])
  @@map("login_attempts")
}
```
(no `@updatedAt`: raw SQL sets `updated_at = now()`; Prisma client never writes this table except deleteMany/seed rows in tests, which must pass `updatedAt` explicitly). Add `loginAttempts LoginAttempt[]` to `User`. Change the lockout comment above the three legacy columns to say unused since #52 (do NOT remove or rename them).
1.2 New migration dir under `apps/api/prisma/migrations/` generated with `pnpm --filter api exec prisma migrate dev --name add_login_attempts` (dev DB up via `docker compose -f infra/docker-compose.dev.yml up -d`). Expected SQL: `CREATE TABLE "login_attempts" (... CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("user_id","ip"))` + `ALTER TABLE ... ADD CONSTRAINT "login_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`. No `ALTER TABLE "users"`, no DROP. Never edit existing migration files. Then `pnpm --filter api exec prisma generate`.
Touches: DB schema (trust boundary: auth state). Regression surface: every file importing `@prisma/client` types; seed.ts untouched.
Verify: `git status --short apps/api/prisma` shows only schema.prisma modified + one new migration dir; `pnpm --filter api typecheck`.

### Batch 2 — auth service + controller + unit spec (3 files)
2.1 `apps/api/src/modules/auth/auth.service.spec.ts` FIRST (update deliberately): extend `makeService` prisma mock with `loginAttempt: { findUnique, deleteMany }` and `$queryRaw` (returns `[{ failed_count: 1, lockout_until: null }]`); remove `$executeRaw`. Rewrite tests: (a) wrong password => exactly one `$queryRaw`, zero `user.update`, no session create (race-safety, still a delegation test); (b) row with future `lockoutUntil` for (user,ip) => UnauthorizedException, `$queryRaw` NOT called, argon2 not required, `loginAttempt.findUnique` called with `{ where: { userId_ip: { userId: 'user-1', ip: '203.0.113.9' } } }`; (c) expired `lockoutUntil` => login succeeds; (d) success => `loginAttempt.deleteMany({ where: { userId, ip } })` and `user.update` data `{ lastLoginAt: expect.any(Date) }` only (no failedLoginAttempts keys); (e) `normalizeClientIp`: `'::ffff:1.2.3.4'`->`'1.2.3.4'`, `'2001:DB8::1'`->`'2001:db8::1'`, `undefined`->`'unknown'`, `''`->`'unknown'`, 100-char junk -> length 45; (f) trip: `$queryRaw` returns `failed_count: 10` with `LOCKOUT_MAX_ATTEMPTS` 10 => exactly one Audit log line containing `"action":"auth.lockout"` and NO `password`/`email` substring; returns 3 => no audit line. (g) unknown/INACTIVE user => no `$queryRaw`, no `loginAttempt.findUnique`. Keep unit tests mocking Prisma only as today (real behaviour proven in e2e).
2.2 `apps/api/src/modules/auth/auth.service.ts`:
- add `export function normalizeClientIp(ip?: string): string` (D-6).
- `login(email, password, clientIp?: string)`: `const ip = normalizeClientIp(clientIp)`; after active check, `const attempt = await this.prisma.loginAttempt.findUnique({ where: { userId_ip: { userId: user.id, ip } } })`; if `attempt?.lockoutUntil && attempt.lockoutUntil.getTime() > Date.now()` throw generic 401. Remove the `user.lockoutUntil` check. Wrong password => `await this.recordFailedAttempt(user.id, ip)` then generic 401. Success => `loginAttempt.deleteMany({ where: { userId: user.id, ip } })` + `user.update({ where, data: { lastLoginAt: new Date() } })`.
- replace `recordFailedAttempt` body with the single upsert (tagged `$queryRaw`, values parameterized: userId, ip, windowMinutes, maxAttempts):
```
INSERT INTO login_attempts (user_id, ip, failed_count, first_failed_at, lockout_until, updated_at)
VALUES (${userId}, ${ip}, 1, now(),
        CASE WHEN 1 >= ${maxAttempts}::int THEN now() + (${windowMinutes} * interval '1 minute') END, now())
ON CONFLICT (user_id, ip) DO UPDATE SET
  failed_count = CASE WHEN login_attempts.first_failed_at < now() - (${windowMinutes} * interval '1 minute')
                      THEN 1 ELSE login_attempts.failed_count + 1 END,
  first_failed_at = CASE WHEN login_attempts.first_failed_at < now() - (${windowMinutes} * interval '1 minute')
                         THEN now() ELSE login_attempts.first_failed_at END,
  lockout_until = CASE WHEN (CASE WHEN login_attempts.first_failed_at < now() - (${windowMinutes} * interval '1 minute')
                                  THEN 1 ELSE login_attempts.failed_count + 1 END) >= ${maxAttempts}::int
                       THEN now() + (${windowMinutes} * interval '1 minute') ELSE NULL END,
  updated_at = now()
RETURNING failed_count, lockout_until
```
(add `::int` casts only if Postgres complains about parameter type inference; keep parameterized either way). Read `failed_count` from the returned row (`$queryRaw<{failed_count:number}[]>`), if `=== maxAttempts` emit the Audit line (D-10; `private readonly auditLogger = new Logger('Audit')`). Then prune this user's stale rows (D-5, `deleteMany`). Update the doc comment above the method to describe per-(user,ip) keying and keep the lost-update-race rationale. Remove `FailedAttemptState` interface if unused.
- Do NOT reference SUPER_ADMIN/ROLE_NAMES (R2).
2.3 `apps/api/src/modules/auth/auth.controller.ts`: `login(@Body() body, @Req() req: { ip?: string }, @Res({passthrough:true}) res)` -> `this.authService.login(body.email, body.password, req.ip)`; import `Req` from `@nestjs/common`. Update the comment block above `@Post('login')` ("per-account lockout" -> "per (account, client IP) lockout, DEC-1xx") and the 401 `@ApiResponse` description to `'Invalid credentials, or this account is temporarily locked for this client IP'` (type stays `ErrorResponseDto`; all other `@ApiResponse` entries unchanged: 201 LoginResponseDto, 400 ValidationErrorResponseDto, 429 ErrorResponseDto).
Touches: auth trust boundary, raw SQL, client-IP handling (spoofing: only `req.ip`). Regression surface: refresh/logout/me untouched; `AuthService.login` callers: `grep -rn "\.login(" apps/api/src` (controller only; seed does not call it).
Verify: `pnpm --filter api test -- auth.service`, `pnpm --filter api typecheck`, `pnpm --filter api lint`.

### Batch 3 — admin unlock (2 files)
3.1 `apps/api/test/users.e2e-spec.ts` FIRST: (a) test at ~L431 'clears lockout state...': seed `prisma.loginAttempt.createMany` for the target with TWO IPs (`failedCount` 10, `firstFailedAt` now, `lockoutUntil` now+10 min, `updatedAt` now) instead of 10 HTTP logins; assert after `activate`: `prisma.loginAttempt.count({ where: { userId } }) === 0`, login 200/201; keep the already-ACTIVE no-op + 404 assertions; (b) test at ~L452 reset-password: replace the `user.update({failedLoginAttempts,...lockoutUntil})` seed with a `loginAttempt.create` row and assert count 0 after reset (keep session revocation + old/new password assertions; delete the assertion on `failedLoginAttempts: 0, firstFailedAttemptAt: null, lockoutUntil: null`); (c) audit test at ~L621: seed a `loginAttempt` row instead of user columns; still expects exactly one line `{action:'user.activate', lockoutCleared:true}`; add: activate with NO rows emits zero lines (existing ~L654 no-op). Leave `SECRET_KEYS` list as is (still must not leak).
3.2 `apps/api/src/modules/users/users.service.ts`: delete `const clearLockout = {...}`. `activate` ACTIVE branch: `const { count } = await this.prisma.loginAttempt.deleteMany({ where: { userId: id } }); if (count > 0) audit(... { lockoutCleared: true })`. INACTIVE->ACTIVE branch: `$transaction([...])` not needed; do `await this.prisma.loginAttempt.deleteMany({ where: { userId: id } })` before the status update (stale rows are harmless but cleared for hygiene) with data `{ status: 'ACTIVE' }`. `resetPassword`: inside the existing `$transaction(async (tx) => ...)` add `await tx.loginAttempt.deleteMany({ where: { userId: id } })` and drop `...clearLockout` from the update data. No audit payload change (no secrets).
Touches: audit lines (rule 8), rule 9 untouched. Regression: deactivate/last-SUPER_ADMIN guard untouched; users e2e whole file.
Verify: `pnpm --filter api test:e2e -- users`.

### Batch 4 — auth e2e files (3 files; tests only)
4.1 NEW `apps/api/test/auth-lockout.e2e-spec.ts` (`[F-27]` in every describe name; header sets `process.env.LOCKOUT_MAX_ATTEMPTS = '3'` BEFORE any import of AppModule, same env-before-import pattern as auth-throttle; reuse its `bootApp(1)`/`loginVia`/`createScratchUser` style, prefix `lockout-e2e-`, `@example.com`, RFC 5737 IPs, scratch users only (seeded admin never used); for the admin case copy `createScratchUser({ superAdmin: true })` from auth.e2e-spec.ts incl. its role cleanup; each test self-contained, distinct IP per test, <=5 requests per IP per test (throttle)). Tests:
 - L1 attacker X: 3 wrong => 401 x3; `login_attempts` row (userId, ip X) `failedCount` 3, `lockoutUntil` > now; 4th with CORRECT password from X => 401, no `data`, no `set-cookie`.
 - L2 same account, correct password from Y right after => 201 + cookie + accessToken (core owner requirement).
 - L3 X still locked after victim's success on Y (row for X untouched; X correct password => 401).
 - L4 other account from X with correct password => 201 (lock is per account+IP).
 - L5 locked-from-X response body deep-equals a plain wrong-password response body and unknown-email body (status 401, message `Invalid credentials`).
 - L6 distributed attacker: 4 distinct IPs x 3 failures each (12 requests) => victim from a fresh IP => 201; `login_attempts` has 4 locked rows, none for victim's IP.
 - L7 SUPER_ADMIN scratch user: 3 failures from X; admin from Y => 201; admin from X => 401.
 - L8 expiry: update the (user,X) row to `lockoutUntil` past and `firstFailedAt` 20 min ago; correct password from X => 201 and row deleted.
 - L9 window reset: row `failedCount` 2, `firstFailedAt` 20 min ago; one wrong password => row `failedCount` 1, `firstFailedAt` within 5 s of now, `lockoutUntil` null.
 - L10 success clears own row: 2 wrong then correct from X => row gone.
 - L11 unknown email and INACTIVE user (scratch INACTIVE): wrong-password-style logins from X => `login_attempts.count({ where: { ip: X } }) === 0`.
 - L12 atomicity: 3 parallel wrong-password requests from one fresh IP via `Promise.all` => all 401 and the single row has `failedCount` exactly 3 and `lockoutUntil` set (insert-vs-conflict race); second case: pre-seed a row with `failedCount` 1 (fresh `firstFailedAt`), fire 2 parallel wrong passwords => `failedCount` exactly 3 (conflict-path race).
 - L13 no XFF header: failed login stores an `ip` that is non-empty and does not start with `::ffff:`.
 - L14 admin unlock: lock (user,X), admin token `POST /users/:id/activate` => 200, row gone, X correct password => 201 (reuse admin login from a distinct IP).
 - L15 audit: spy `Logger.prototype.log` filtered to context `Audit` (same capture technique as users.e2e audit test): exactly one `auth.lockout` line at the 3rd failure, none at the 2nd, line has `entityId` = user id and `ip`, no `password`/email substring.
4.2 `apps/api/test/auth.e2e-spec.ts` (default env, max 10): update deliberately, not delete: 
 - 'bumps updatedAt on a failed attempt' -> assert a `login_attempts` row appears for (user, ip) with `failedCount` 1 and `updatedAt` > user's creation time (rename test, drop the users.updatedAt assertion).
 - E4 'locks out after 10 failed attempts' -> drive attempts with `await app.get(AuthService).login(email, WRONG, ip)` (expect each rejects `UnauthorizedException`) because 10 HTTP calls from one IP are throttled: after 9 no `lockoutUntil` (row `failedCount` 9), after the 10th `lockoutUntil` set; then HTTP login with CORRECT password from the same IP => 401 no data; from another IP => 201. Pins the default threshold 10.
 - E5 'resets ... aged out' -> seed a `login_attempts` row (`failedCount` 9, `firstFailedAt` 20 min ago, `lockoutUntil` null) for (user, ip); success from that ip => row deleted.
 - race test (~L308): five parallel wrong-password requests from ONE unique fixed IP (exactly the throttle limit 5, all 401) => row `failedCount` === 5 (replaces `user.failedLoginAttempts`).
 - #46 `normalization` describe: 'wrong password with a mixed-case email counts one failed attempt' -> `login_attempts` `failedCount` 1 for (normWrongPwUser, ip); 'lockout counter is shared across case and padding variants' -> drive 10 attempts through `AuthService.login` directly with the typed variants (same IP) then assert one row, `failedCount` 10, `lockoutUntil` set, and HTTP login of the upper-case and plain variants from that IP => 401 no `data`.
 - Throttle test (~L326) unchanged. Remove every read of `row.failedLoginAttempts` / `row.lockoutUntil` from `prisma.user`.
4.3 `apps/api/test/auth-throttle.e2e-spec.ts`: replace the D5 describe ("Account lockout is per-account...") deliberately: new title `'Account lockout does not spread across source IPs [F-27]'`; test 1 'ten failures from ten different IPs lock no one: victim from an eleventh IP still gets 201' (1 request per IP, `203.0.113.x`, so default max 10 and throttle both irrelevant; assert 10 rows each `failedCount` 1 and all `lockoutUntil` null, victim row for its IP absent). Delete the other two D5 tests (their lockout-needed intent moves to auth-lockout L1/L4/L5). Rewrite the file-header bullets that say lockout is "keyed on the ACCOUNT only / ignores the IP by design (DEC-111)" to the per-(account, IP) behaviour and the new DEC; delete `lockAccount` helper and the `LOCKOUT_MAX_ATTEMPTS >= 11` note if now unused. Keep D1-D4 and D6 unchanged.
Verify: `pnpm --filter api test:e2e` (runInBand, whole suite twice) and `pnpm --filter api test:e2e -- auth-lockout --randomize` for order independence.

### Batch 5 — docs (3 files)
5.1 `docs/adr/0004-jwt-argon2-auth.md`: append `## Addendum 2026-10-26 (task #52, DEC-NNN)`: consequence discovered (per-account lockout let anyone who knows an email lock it for 15 min, incl. the sole SUPER_ADMIN, defeating the intent of rule 9); owner decision "2 and lockout only the attacker"; resulting rule: failed attempts and lockout keyed on (account, client IP), SUPER_ADMIN covered by the same per-IP rule so it cannot be locked from another IP; decision table and numbers from section 2 (condensed); residual risks (shared egress IP, IPv6 /64, distributed guessing bounded by nginx 5r/m + app 5/60s + >=12-char policy + argon2id). Status line of the ADR unchanged.
5.2 `planning/adr/ADR-0004-auth-approach.md`: same addendum, 5-8 lines (this is the planning-chain copy; keep wording consistent).
5.3 `planning/SRS.md` (line ~210, F-27 auth/session detail paragraph): extend the lockout clause: "lockout after 10 failed attempts within 15 minutes, tracked per account and client IP (task #52) so a third party cannot lock another user out; admin unlock via `POST /users/:id/activate`." Do not touch other SRS text (planning/FEATURES.md F-27 line already says "10 failed attempts/15min": leave).
Verify: greps in static gates.

## 6. DEC text for the orchestrator (append to docs/memory/DECISIONS.md)
`DEC-1xx · 2026-10-26 · #52 lockout keyed on (account, client IP): owner chose "2 and lockout only the attacker". Interpreted (A1) as: nobody, SUPER_ADMIN included, can be locked from another IP; implemented as per-(user_id, ip) failed-attempt rows in new table login_attempts (PK user_id+ip, FK cascade) via one atomic INSERT..ON CONFLICT..RETURNING upsert (supersedes the users-row counter of DEC-079, same race-safety). No SUPER_ADMIN special case (R2) because a lockout-free admin would allow 300 guesses/hour/IP vs 40 with per-IP lock; R1 delta recorded in the spec if owner rejects. Client IP = Express req.ip (trust proxy 1), normalized (strip ::ffff:, lowercase, cap 45, missing -> 'unknown'). Locked, wrong-password and unknown email stay one generic 401. Legacy users.failed_login_attempts/first_failed_attempt_at/lockout_until unused, drop deferred to a follow-up migration task. Supersedes the "lockout ignores IP by design" clause of DEC-111 (D5 rewritten). Admin unlock/reset clears all rows for the user. Residual: shared egress IP, IPv6 /64 rotation.`

## 7. DoD gates

### Static gates (hub-reviewer)
S1 `grep -rnE "failedLoginAttempts|firstFailedAttemptAt|lockoutUntil" apps/api/src` -> matches ONLY `login_attempts`-related `lockoutUntil` in auth.service.ts (the new `LoginAttempt.lockoutUntil` reads) and none in users.service.ts; zero reference to `user.lockoutUntil`/`user.failedLoginAttempts`.
S2 `grep -n "ON CONFLICT (user_id, ip)" apps/api/src/modules/auth/auth.service.ts` = 1 hit; `grep -rnE "\\$(queryRaw|executeRaw)Unsafe" apps/api/src` = 0 hits; the lockout SQL is a tagged template (`$queryRaw\``).
S3 `grep -rniE "x-forwarded-for" apps/api/src` = 0 hits (IP only from `req.ip`).
S4 `grep -nE "SUPER_ADMIN|ROLE_NAMES" apps/api/src/modules/auth/auth.service.ts` = 0 hits (R2: no admin special case; rule 7 keys stay in packages/shared).
S5 Migration: exactly one NEW dir under apps/api/prisma/migrations; `git diff --stat -- apps/api/prisma/migrations` shows no modified pre-existing files; the new `migration.sql` contains `CREATE TABLE "login_attempts"`, `PRIMARY KEY ("user_id","ip")`, `ON DELETE CASCADE`, and does NOT contain `DROP` or `ALTER TABLE "users"`.
S6 Swagger detail (route `POST /api/v1/auth/login`, no new routes): `grep -n "@ApiResponse" apps/api/src/modules/auth/auth.controller.ts` still lists 201 `LoginResponseDto`, 400 `ValidationErrorResponseDto`, 401 `ErrorResponseDto` (description now mentions "client IP"), 429 `ErrorResponseDto`, each with `type:`; no bare-description-only ApiResponse; `swagger.e2e-spec.ts` passes.
S7 No new deps: `git diff --stat -- package.json apps/api/package.json packages/shared/package.json pnpm-lock.yaml` empty. `git diff --stat -- packages/shared` empty. No `apps/web` or `infra/` change.
S8 Controller has no business logic: `git diff apps/api/src/modules/auth/auth.controller.ts` adds only the `@Req()` param, the third argument, comment and 401 description.
S9 `normalizeClientIp` exported from auth.service.ts and unit-tested (`grep -n normalizeClientIp apps/api/src/modules/auth/auth.service.spec.ts`).
S10 Audit line has no secrets: the logged object keys are exactly `actorId, action, entityType, entityId, ip`.
S11 Docs: `grep -n "task #52" docs/adr/0004-jwt-argon2-auth.md planning/adr/ADR-0004-auth-approach.md planning/SRS.md` hits in all three; `grep -n "per account and client IP" planning/SRS.md` = 1 hit.
S12 Prisma legacy columns still present in schema (`grep -n "failed_login_attempts" apps/api/prisma/schema.prisma` = 1 hit) and flagged unused (comment).
S13 `pnpm lint && pnpm typecheck && pnpm test` exit 0; `python3 tools/check-dockerfile-stages.py` exit 0 (Dockerfile untouched, run because IMAGE-BUILD is triggered).

### Empirical gates (hub-tester; real DB `docker compose -f infra/docker-compose.dev.yml up -d`)
E1 `pnpm --filter api test:e2e` (runInBand) full suite green twice; new totals reported (auth-lockout >= 15 tests).
E2 Core journey (auth-lockout L1+L2): attacker IP X locked after 3 failures (max 3 in that file); same account's correct login from IP Y => 201 with `accessToken` and `Set-Cookie: refresh_token`; correct password from X while locked => 401 with no `data` and no `set-cookie`.
E3 SUPER_ADMIN (L7): scratch SUPER_ADMIN locked on X only; login from Y => 201 `data.user.roles` contains `SUPER_ADMIN`.
E4 Enumeration safety (L5): bodies of locked, wrong-password and unknown-email responses deep-equal (`{ error: { statusCode: 401, message: 'Invalid credentials' ... } }`).
E5 Default threshold 10 pinned (auth.e2e E4 via AuthService): count 9 => no lock; 10th => `lockoutUntil` set.
E6 Race/atomicity (L12, auth.e2e race test): parallel failures from one IP produce exact counts; no unique-violation 500 (all responses 401).
E7 Admin unlock (users.e2e + L14): activate clears every IP row; audit line `lockoutCleared:true` only when rows existed.
E8 Expiry/reset/cleanup (L8, L9, L10, L11): behaviours exactly as listed; unknown/INACTIVE emails create no rows.
E9 Response envelope: login 201 body has `data.accessToken`, `data.user` and no `passwordHash`/`passwordhash`/`refreshToken`/`lockout`/`failed` keys (`hasKeyDeep`); 401/429 error envelope shape unchanged (`error.statusCode`).
E10 Throttle regression (auth-throttle D1-D4 unchanged (D6, the main.ts parity guard, was deleted by #53; auth-throttle now has D1-D5)) still green; rewritten D5 green.
E11 Mutation checks (scratch copy of the tree, never the working tree): (M1) key the lock check on `userId` only (drop `ip` from `userId_ip`) -> L2/L3/L6 fail; (M2) make `recordFailedAttempt` read-then-write (findUnique + upsert in JS) -> L12 fails; (M3) skip the `deleteMany` on success -> L10 fails; (M4) drop the window CASE (always increment) -> L9 fails; (M5) don't clear rows in `activate` -> users.e2e + L14 fail; (M6) log the audit line on every failure -> L15 fails; (M7) success deletes all of the user's rows instead of (user, ip) -> L3 fails.
E12 Live probe (production bootstrap, scratch user, `PORT` 4888 or dev server): 3 wrong logins from `X-Forwarded-For: 192.0.2.77` with `LOCKOUT_MAX_ATTEMPTS=3`, then correct password from `192.0.2.78` => 201; from `.77` => 401. Report DB before/after (scratch rows removed).
**IMAGE-BUILD (REQUIRED: schema.prisma, migrations/, auth.service.ts match the trigger list in `.claude/agents/hub-tester.md`)**: follow that file's steps (b)-(e) verbatim: `python3 tools/check-dockerfile-stages.py` exit 0; pre-clean `docker rm -f hub-api-gate-52`; unmodified `docker build -f apps/api/Dockerfile -t hub-api-gate:52 .` (NO `--target`); dist check prints `ok`; boot on port 4010 with the inline env list, health 200, admin login 201, `GET /api/v1/users` 200 without `passwordHash`; boot must apply/accept the new migration against the dev DB (migrated in Batch 1); cleanup via EXIT trap; report that cleanup ran and that the login inserted a sessions row.

### Gatekeeper criteria (standalone audit; "done" for THIS task)
G1 CLAUDE.md rule 9 intent: a third party cannot make the sole active SUPER_ADMIN unable to log in from the admin's own IP; no stored balance/ledger touched (rules 1-4 N/A, confirm no finance file diff).
G2 Rule 8: lockout trip + admin unlock emit audit lines (actor/entity), no secrets; rule 7: no permission key added, no role-name logic outside `@hub/shared` constants.
G3 SRS §3.7/F-27: 10 failed attempts within 15 min still the default threshold/window (env `LOCKOUT_MAX_ATTEMPTS`/`LOCKOUT_WINDOW_MINUTES` honoured).
G4 ADR-0004 + planning ADR-0004 + SRS addenda present and consistent with the shipped behaviour and with the owner's verbatim decision; DEC drafted by orchestrator references A1 and the R1 alternative.
G5 DEC-079 race-safety preserved (single atomic statement; e2e race tests green) and DEC-080/Design Decision #4 generic-401 indistinguishability preserved.
G6 Migration forward-only, new files only; legacy columns intentionally retained with a recorded follow-up.
G7 DEC-111 D5 superseded deliberately (test + header rewritten, not deleted silently).
G8 Minimal-code discipline: no new deps, no new route, controller logic limited to forwarding `req.ip`, every changed line traces to this spec.

## 8. R1 delta (ONLY if the owner rejects R2 and wants the admin lockout-free)
In auth.service.ts `login()`: `const isSuperAdmin = user.userRoles.some((ur) => ur.role.name === ROLE_NAMES.SUPER_ADMIN)` (import `ROLE_NAMES` from `@hub/shared`; the existing `include: { userRoles: { include: { role: true } } }` already loads it: zero extra queries; also require `ur.role.status === 'ACTIVE'` to match `assertNotLastActiveSuperAdmin`). Skip BOTH the lock check and `recordFailedAttempt` when `isSuperAdmin`. Tests: replace L7 with "admin: 5 wrong from X (throttle ceiling) never locks; no `login_attempts` rows for admin; correct password from X => 201", S4 inverted to require the single `ROLE_NAMES.SUPER_ADMIN` use, ADR addendum states the 300/h/IP exposure. Roughly +1 file-batch-free change (same 3 batch-2/4 files).

## 9. Regression surface
`auth.service.ts` (login/refresh/me share the file), `auth.controller.ts`, `users.service.ts` activate/resetPassword/deactivate paths, `users.e2e-spec.ts` (largest e2e file), `auth.e2e-spec.ts` and `auth-throttle.e2e-spec.ts` (rewritten assertions), Prisma client types in every module importing `@prisma/client`, `seed.ts` (unchanged but compiled against new client), the production image boot (new migration).
