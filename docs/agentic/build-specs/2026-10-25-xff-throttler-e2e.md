# Build spec: TASKS #49 — e2e proving login throttler + lockout key on the forwarded client IP / account behind `trust proxy` 1

Date: 2026-10-25 · Planner: hub-planner · Trace: E-07 / F-27 · Origin: #47 Stage D
Orchestrator step before build: `python3 tools/task.py start 49 --spec docs/agentic/build-specs/2026-10-25-xff-throttler-e2e.md`

Sources that shaped this spec: CLAUDE.md (rules 7-9, test discipline), planning/FEATURES.md F-27, docs/adr/0004-jwt-argon2-auth.md, docs/agentic/build-specs/2026-09-13-auth-module.md (throttler + lockout, DEC-078/079/080), apps/api/src/{main.ts,app.module.ts,modules/auth/auth.controller.ts,modules/auth/auth.service.ts,config/env.validation.ts}, apps/api/test/auth.e2e-spec.ts, infra/nginx/default.conf.template. Not finance-touching (no money path), so no accountant-expert needed.

## 1. Objective
Add a NEW e2e file that locks in, empirically, that POST /api/v1/auth/login throttling (5 / 60s) is keyed on the Express-parsed client IP (`req.ip`, from the trusted hop of `X-Forwarded-For` with `trust proxy` = 1) and that account lockout (10 failures / 15 min) is keyed on the account only, so a regression in express/proxy-addr or in the trust-proxy setting fails CI. Production code is NOT changed.

## 2. Findings from reading the code (implementer: treat as facts, re-verify with the greps in Gates)
- Tracker: `ThrottlerGuard` (@nestjs/throttler ^6.5) default `getTracker(req)` = `req.ip`. No custom tracker, no `skipIf`, no `skipSuccessfulRequests`. Applied ONLY on `login` via `@UseGuards(ThrottlerGuard)` + `@Throttle({ default: { limit: 5, ttl: 60_000 } })` (auth.controller.ts). Bucket key additionally includes controller+handler name, so it is login-route-specific. EVERY login request counts (success and failure) and the 6th within 60s gets 429 with body `{ error: { statusCode: 429 } }` (HttpExceptionFilter envelope).
- Storage: default in-memory `ThrottlerStorageService`, one per `ThrottlerModule` instance, i.e. per Nest app instance. A fresh `Test.createTestingModule({imports:[AppModule]})` per describe => clean throttle state. (Jest `--runInBand`, one process; separate files get separate module registries.)
- Lockout: `AuthService.login` does `findUnique({where:{email}})`; `recordFailedAttempt` raw-SQL UPDATE on that user row; LOCKOUT_MAX_ATTEMPTS default 10, LOCKOUT_WINDOW_MINUTES default 15 (env.validation.ts). IP is never read => per-account, IP-agnostic (matches spec; locked and wrong-password both return identical 401 INVALID_CREDENTIALS).
- Harness parity: the existing auth e2e harness ALREADY applies `app.getHttpAdapter().getInstance().set('trust proxy', 1)` (auth.e2e-spec.ts ~line 100), a hand-copied duplicate of main.ts:21. So XFF tests there run with the same setting as prod TODAY, but nothing ties the two together (drift risk), and health/users e2e do NOT set it. Not a current mismatch; a drift hazard.
- Tester's #2 observation ("random XFF per login still 429 after ~5/min even with trust proxy 1") is most likely NOT the app throttler: via nginx (infra/nginx/default.conf.template lines 4, 27-30) `limit_req zone=login rate=5r/m burst=5` is keyed on `$binary_remote_addr` (the real connecting peer, ignores client-sent XFF) and nginx OVERWRITES XFF with `$remote_addr` (`proxy_set_header X-Forwarded-For $remote_addr`, not `$proxy_add_x_forwarded_for`). So a client-supplied random XFF cannot rotate either bucket through nginx — that is correct, spoof-resistant behaviour, and explains the 429. Direct-to-API (:4000, no nginx) a random XFF DOES rotate the throttle bucket (that is what these tests prove). Another possible cause: a stale API process started before `trust proxy` existed. The implementer need not chase this; spec records it so the test file comment states: "XFF independence is an APP-level property; behind nginx the edge overwrites XFF so clients cannot rotate it."

## 3. Minimal fix for harness parity (decision)
No production change, no shared bootstrap extraction (would touch main.ts; not needed). Instead the new file:
(a) sets trust proxy itself via one local `bootApp(trustProxy)` helper (inline in the new file, not a shared helper file — YAGNI; only one consumer), and
(b) includes a static drift-guard test that reads `apps/api/src/main.ts` text and asserts it contains `set('trust proxy', 1)` and that the file's own `PROD_TRUST_PROXY` constant (1) matches — so if someone changes main.ts to 0/2/true the e2e fails and forces a conscious update. Marked in a comment as a deliberate source-text parity guard (ponytail: text match, not a runtime import of main.ts, because main.ts calls bootstrap() on import → upgrade path: extract `configureApp(app)` shared by main.ts and e2e if more setup drifts).

## 4. Assumptions (no open questions)
- A1: #46 (email lowercasing) builds before #49. #49 has no code dependency on it: new file never edits auth.e2e-spec.ts or login code, and all scratch emails are generated lowercase (`<prefix>-<uuid>@example.com`, uuid is lowercase hex) so behavior is identical before/after #46. If #49 happens to build first, still valid.
- A2: Dev Postgres reachable at DATABASE_URL default used by existing e2e (same `process.env.X ??=` preamble copied verbatim from auth.e2e-spec.ts).
- A3: Security note (not a question, documented design): per-account lockout is IP-agnostic by design, so anyone who knows an email can lock that account for 15 min (account-DoS) — accepted tradeoff; test documents it, does not change it.
- A4: Each throttle describe uses documentation-range IPs (TEST-NET RFC 5737: 192.0.2.x, 198.51.100.x, 203.0.113.x) unique across describes.

## 5. Batch plan (1 batch, 1 file — trivially small, collapsed per DEC-038)

### Batch 1 — hub-implementer
File: `apps/api/test/auth-throttle.e2e-spec.ts` (NEW). Do not edit any other file.

Step 1. Preamble: copy the env `process.env.X ??=` block and imports (randomUUID, fs `readFileSync`, path, INestApplication, ValidationPipe, Test, PrismaClient, cookieParser, supertest, TransformInterceptor, HttpExceptionFilter, hashPassword) from auth.e2e-spec.ts. `jest.setTimeout(60_000)` at top (argon2 verifies are slow). Why: AppModule evaluates ConfigModule at decoration time.

Step 2. Helpers (module scope):
- `PASSWORD`, `WRONG_PASSWORD` constants as in the existing file; `const PROD_TRUST_PROXY = 1;`
- `async function bootApp(trustProxy: number | boolean): Promise<INestApplication>`: createTestingModule({imports:[AppModule]}) via `require('../src/app.module')`; `createNestApplication()`; same pipeline as existing harness (cookieParser, ValidationPipe whitelist+transform, TransformInterceptor, HttpExceptionFilter, prefix `api/v1`); `app.getHttpAdapter().getInstance().set('trust proxy', trustProxy)`; `await app.init()`.
- `createScratchUser(prefix)`: `prisma.user.create` with `hashPassword(PASSWORD)`, email `${prefix}-${randomUUID()}@example.com`, push id to `createdUserIds`. No roles needed. NEVER touch the seeded admin (SUPER_ADMIN_EMAIL) — no login against it anywhere.
- `loginVia(app, email, password, xff?: string)`: POST `/api/v1/auth/login`, sets `X-Forwarded-For` only if `xff !== undefined`.
- `afterAll` (top-level, shared): `session.deleteMany({userId in ids})`, `user.deleteMany({id in ids})`, `prisma.$disconnect()`; each describe closes its own app in its own `afterAll`.

Step 3. Describes (each title contains `[F-27]`; each boots its OWN fresh app in `beforeAll`, closes in `afterAll`):

D1 `Login throttler keys on forwarded client IP, trust proxy 1 [F-27]` — `bootApp(PROD_TRUST_PROXY)`; one scratch user `thr-a`:
 - T1.1 "IP A exhausts 5/60s, 6th is 429; IP B still reaches auth": 5x wrong-password from XFF `192.0.2.10` each => 401; 6th => 429 and `body.error.statusCode===429`; then 1x wrong-password from XFF `192.0.2.11` => 401 (NOT 429).
 - T1.2 "same XFF is throttled together across users": two scratch users (`thr-b1`, `thr-b2`); alternate 5 requests across them with XFF `192.0.2.20` (401s), 6th (either user) => 429. Proves bucket is per-IP not per-account/body.
 - T1.3 "successful logins count toward the bucket": XFF `192.0.2.30`: 4 wrong + 1 correct (201, has `data.accessToken`) then 6th => 429. Documents the actual behavior (no skipSuccessfulRequests).
 - T1.4 "no XFF header falls back to socket peer; those requests share one bucket": 5 requests without the header => 401, 6th => 429 (uses a describe-private app so it can't poison siblings).
D2 `Multi-hop X-Forwarded-For uses the trusted (rightmost) hop with trust proxy 1 [F-27]` — fresh app, trust 1:
 - T2.1 "varying the spoofed leftmost entry cannot evade the limit": header values `198.51.100.1, 192.0.2.40`, `198.51.100.2, 192.0.2.40`, ... (5 different spoofed lefts, SAME rightmost `192.0.2.40`) => five 401; 6th (another new spoofed left, same right) => 429.
 - T2.2 "same leftmost, different rightmost are independent": `198.51.100.9, 192.0.2.41` x5 => 401 (exhaust), 6th => 429; then `198.51.100.9, 192.0.2.42` => 401 (not 429). Proves the right hop, not the left, is the key.
D3 `Trust proxy disabled control: XFF is ignored [F-27]` — `bootApp(false)` (negative control; makes the proxy regression detectable permanently): 5 wrong-password requests each with a DIFFERENT XFF (`192.0.2.50`..`.54`) => 401 x5; 6th with yet another XFF => 429 (all share the socket-peer bucket).
D4 `Account lockout is per-account, independent of source IP [F-27]` — fresh app, trust 1; scratch users `lock-a`, `lock-b`:
 - T4.1 "10 failures from 10 rotating IPs (XFF 203.0.113.1..10; one request per IP so the throttler never trips) all return 401; then the CORRECT password from a NEW IP (203.0.113.11) is still 401 with no `data` key and no `set-cookie`; DB row `lock-a` has `failedLoginAttempts>=10` and `lockoutUntil` > now" (Prisma read, observable state, not internals of service).
 - T4.2 "lock-b untouched": from the SAME IP that just hit lock-a's lockout (203.0.113.11), login lock-b with correct password => 201. Proves lockout is not IP-wide.
 - T4.3 "locked and wrong-password responses are indistinguishable": the locked-account 401 body equals (deep-equal on `body.error.message` and `statusCode`) a wrong-password 401 body for lock-b's wrong attempt (no lock oracle).
D5 `Trust-proxy parity drift guard [F-27]`:
 - T5.1 read `path.join(__dirname,'../src/main.ts')`; `expect(src).toMatch(/set\('trust proxy',\s*1\)/)` and that `PROD_TRUST_PROXY === 1`. Comment: why text-match (main.ts runs bootstrap() on import).
 - T5.2 read `apps/api/src/modules/auth/auth.controller.ts`... NOT asserted (implementation-internal). Skip.

Step 4. Header comment in the file: documents §2 nginx note ("XFF independence is app-level; behind nginx the edge overwrites XFF"), the A3 account-DoS tradeoff, and the TEST-NET IP allocation per describe.

Regression surface: none in product code (diff = 1 new test file). Test-only side effects: shared dev DB rows (scratch users/sessions) — cleaned in afterAll; throttle state is per-app in-memory, so no cross-file leakage. Existing auth.e2e-spec.ts untouched (conflict-free with #46). Shared nothing => can run alone or with the suite.

## 6. DoD gates

### Static gates (hub-reviewer)
S1. `git status --porcelain` shows exactly one new/changed path: `apps/api/test/auth-throttle.e2e-spec.ts` (no product, infra, package.json, lockfile change).
S2. `grep -c "describe(" apps/api/test/auth-throttle.e2e-spec.ts` >= 5 AND `grep "describe(" apps/api/test/auth-throttle.e2e-spec.ts | grep -vc "\[F-27\]"` prints 0.
S3. `grep -n "trust proxy" apps/api/test/auth-throttle.e2e-spec.ts` shows both the `.set('trust proxy', trustProxy)` in bootApp and the main.ts regex guard.
S4. `grep -nE "SUPER_ADMIN_EMAIL|admin@example.com" apps/api/test/auth-throttle.e2e-spec.ts` matches ONLY the env preamble line, never a login call.
S5. `grep -n "afterAll" ...` shows session.deleteMany + user.deleteMany scoped by `createdUserIds` (no unscoped `deleteMany()`/`deleteMany({})`): `grep -nE "deleteMany\(\s*\)|deleteMany\(\{\s*\}\)" ...` returns nothing.
S6. No mocks of ThrottlerGuard/ConfigService/AuthService: `grep -nE "jest\.mock|overrideProvider|overrideGuard" ...` returns nothing. No `it.skip`/`describe.skip`/`.only`.
S7. IPs only from RFC 5737 ranges: `grep -oE "[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+" ... | grep -vE "^(192\.0\.2|198\.51\.100|203\.0\.113)\."` returns nothing.
S8. `pnpm --filter api lint` and `pnpm --filter api typecheck` (or repo `pnpm lint && pnpm typecheck`) pass.

### Empirical gates (hub-tester; DB up: `docker compose -f infra/docker-compose.dev.yml up -d`)
E1. `pnpm --filter api test:e2e -- auth-throttle` => all tests in the 5 describes pass (expect T1.1-T1.4, T2.1-T2.2, D3, T4.1-T4.3, T5.1 green); run it 3 times consecutively, still green (no state leak, no flake).
E2. Full `pnpm --filter api test:e2e` green (existing auth.e2e-spec.ts unaffected; run order independent).
E3. DB hygiene: before and after E1/E2 run `psql`/prisma count `SELECT count(*) FROM users WHERE email LIKE 'thr-%@example.com' OR email LIKE 'lock-%@example.com'` => 0 after; and `SELECT count(*) FROM users` identical before vs after; seeded admin row (SUPER_ADMIN_EMAIL) has `failed_login_attempts=0` and `lockout_until IS NULL` before and after.
E4. Mutation M1 (proxy regression): temporarily change test helper call in D1 only (scratch edit) `bootApp(PROD_TRUST_PROXY)` -> `bootApp(false)` => T1.1 FAILS (B gets 429). Revert; green again. (Equivalent permanent evidence: D3 control passing.)
E5. Mutation M2 (tracker constant): in a scratch edit of `apps/api/src/modules/auth/auth.controller.ts` replace `@UseGuards(ThrottlerGuard)` with a guard subclass whose `protected async getTracker(): Promise<string> { return 'const'; }` (scratch only) => T1.1, T1.2(per-IP side), T2.2 and T4.1 stay as designed but T1.1 FAILS (B 429). Revert with `git checkout -- apps/api/src/modules/auth/auth.controller.ts`; `git status --porcelain` must again list only the new test file. Tester records the failing test names in RUNLOG. Mutation edits must never be committed or left in tree.
E6. Mutation M3 (proxy hop choice): in scratch set trust proxy to `2` in the D2 helper call => T2.1 or T2.2 FAILS (leftmost spoofed entry becomes the key). Revert.
E7. Mutation M4 (lockout keyed wrongly): not required (lockout is DB/email-keyed); skip. T4.1/T4.2 passing is the evidence.

### Gatekeeper criteria
G1. F-27 (planning/FEATURES.md) rate-limit + lockout (10 attempts / 15 min) behaviors are demonstrably covered by tests keyed exactly as implemented (IP for throttle, account for lockout); no behavior invented.
G2. ADR-0004 / auth build spec DEC-078/079/080: locked and wrong-password responses indistinguishable (T4.3); refresh/session semantics untouched.
G3. CLAUDE.md: test real behavior, no mocks (testing-anti-patterns); product code diff empty; Surgical Changes (one new file); no new deps; scratch data cleaned; seeded SUPER_ADMIN never locked (rule 9 spirit).
G4. Mutation evidence M1/M2/M3 present in RUNLOG, each with the failing test name and proof of revert.
G5. Production `main.ts:21` still `set('trust proxy', 1)` and parity guard T5.1 passes.
