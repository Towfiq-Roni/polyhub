# Build spec — #56 login_attempts hygiene + hardening (2026-10-28)

Task: `tasks/056-login-attempts-hygiene-hardening-from-52.md`. Trace E-07/F-27. Planner: hub-planner. Sources read: DEC-113, DEC-115 (+addenda 1-9), DEC-116, DEC-117; ADR-0004 addenda; `apps/api/src/modules/auth/auth.service.ts` (login, `recordFailedAttempt`, `normalizeClientIp`); `auth.service.spec.ts`; `test/auth-lockout.e2e-spec.ts`; migration `20261026104357_login_attempts`; `.claude/agents/hub-tester.md` IMAGE-BUILD trigger; CLAUDE.md rules 8/9 + minimal-code ladder. Not finance-touching (no ledger path) — accountant-expert not needed.

## 1. Objective

Three small hardenings to the login failure path, no schema change, no new dependency: (A) make the existing prune-on-failure sweep ALL users' dead `login_attempts` rows; (B) key IPv6 clients on their /64 so rotating addresses inside one /64 cannot dodge the per-(account, client IP) lockout; (C) run one dummy argon2 verify for unknown/inactive emails so their latency matches a wrong-password attempt. After: per-(account, IP) lockout semantics (DEC-115) unchanged, ONE generic 401 for locked/wrong/unknown/inactive unchanged, no migration.

## 2. Recommendations per item (reasoning)

### (A) Periodic DELETE — RECOMMEND: DO the minimal form (global opportunistic prune); REJECT timer and scheduler

- Is it needed? Barely. Rows exist only for real ACTIVE users (FK, L11), at most 5 users x real source IPs, nginx caps 5 req/min/IP, and the per-user prune already runs on every failure (DEC-115 add. 8 "row growth"). Unbounded growth is not realistic. The only gap: a user's stale rows (one failure from an IP, never again; or a deactivated user's rows) are never swept because the prune is scoped to the failing user.
- Cheapest rung: drop `userId` from the existing prune `where` (one deleted line + comment edit). Runs on every failure anywhere, so every user's dead rows get swept whenever anyone fails. Zero lifecycle, zero timer, zero deps.
- Safe because a row with `firstFailedAt < now-window` AND (`lockoutUntil` null OR <= now) behaves identically to an absent row (the upsert CASE resets it to count 1, L9). A live lock is protected by the existing OR guard.
- `setInterval` + `unref` + `onModuleDestroy`: works (stdlib) but adds lifecycle code, a second DELETE site, jest open-handle risk, and runs when nothing happened. Not simpler than a one-line change. `@nestjs/schedule`: new dependency, RAM, no. Both rejected.
- Residual: if NOBODY ever fails again, stale rows stay forever (bounded, harmless, tiny). Accepted, documented as the new `ponytail:` ceiling. Known race (tiny): a global prune can delete a stale row at the instant another request upserts-resets it, losing one count for that user — same race existed per-user; only matters at the exact window boundary; accepted.
- Alternative (user choice): DEFER A entirely and just document. Default stays DO-minimal; see OPEN QUESTIONS Q1.

### (B) IPv6 /64 bucketing — RECOMMEND: DO

- Real hole: one IPv6 subscriber typically holds a /64 (2^64 addresses); the exact-address key lets an attacker get a fresh lockout budget per guess. This is the recorded "accepted limit" (ponytail comment in `normalizeClientIp`) that (B) closes. IPv4 untouched.
- Implementation (stdlib only): `import { isIPv6 } from 'node:net'`. Order inside `normalizeClientIp`: missing -> `'unknown'`; lowercase; strip `^::ffff:` (IPv4-mapped dotted form -> IPv4, as today); strip zone id (`split('%')[0]`); if `!isIPv6(v)` -> `v.slice(0,45)` (IPv4, junk, 'unknown'-like strings keep today's behavior incl. the 45 cap); else expand to 8 hextets (split on `::`, `z = 8 - head.length - tail.length` zero groups; an embedded dotted-IPv4 last group counts as 2 groups — it sits in hextets 7-8, never in the first 4), take the first 4, normalize each with `parseInt(g,16).toString(16)`, return `` `${h.join(':')}::/64` `` (e.g. `2001:db8:0:0::/64`, max 24 chars < 45).
- NO migration: `login_attempts.ip` is `TEXT` (migration `20261026104357`; the 45 limit is code-only: `.slice(0,45)`). Old exact-IPv6 rows are never matched again; they are dead rows swept by (A)'s prune; effect = an IPv6 client locked at deploy time is unlocked (same deploy-time reset class DEC-115 accepted for legacy columns). IPv4 rows unaffected. No backfill.
- Limits to document: (i) a hex-form mapped address (`::ffff:7f00:1`) is not stripped — pre-existing, Node/Express emit the dotted form; (ii) a whole-/64 shared by several users (household, office LAN) shares one lock budget — same class as the accepted shared-egress-IPv4 limit; (iii) the Nest throttler (5/60s) and nginx `limit_req` still key on exact `req.ip` / `$remote_addr` — NOT changed here (out of scope; the lockout is the control that bounds guesses per account); a /64-rotator is still throttled per exact address but now shares ONE lockout row, so lockout caps it at 10 guesses/window/account/(/64).

### (C) argon2 dummy verify — RECOMMEND: DO (default; user may defer, Q2)

- Measured (this machine, argon2 0.45.1, default `hashPassword` params m=64MiB t=3 p=4): `argon2.verify` ≈ 27 ms. Unknown/inactive email today returns after one indexed `findUnique` (~1-3 ms). A ~25 ms gap is trivially measurable over a LAN and statistically measurable over the internet by averaging, and it gives an attacker a free email-enumeration oracle (the generic 401 body is otherwise identical on purpose — Design Decision #4).
- Throttler mitigates volume, not the oracle: 5/60s per exact IP (and nginx 5 r/min) still allows ~5 samples/min/IP and a distributed/IPv6-rotating attacker multiplies that. A deterministic 25 ms vs 1 ms gap needs only a handful of samples. So the throttle does not remove it.
- Cost of the fix: one extra argon2 verify (~27 ms CPU, ~64 MiB transient, libuv thread pool) ONLY on unknown/inactive-email logins, which are already throttled 5/60s/IP. Negligible for <=5 users; no steady RAM.
- Implementation: module-level lazy memo `let dummyHash: Promise<string> | undefined; const getDummyHash = () => (dummyHash ??= hashPassword('timing-equaliser-not-a-credential'))` (uses the SAME params as real hashes, so equal cost). In `login`, in the `!user || status !== 'ACTIVE'` branch: `await verifyPassword(await getDummyHash(), password).catch(() => false);` then the same `throw new UnauthorizedException(INVALID_CREDENTIALS)`. First-ever call pays hash+verify once (~55 ms) — acceptable; the e2e timing test warms it up.
- Honest ceiling (`ponytail:` comment): the locked path (lock check before the password verify, DEC-115) is still fast. That reveals "this email is real AND this IP is locked" only to the caller who just locked it from that IP, so it is NOT an enumeration oracle to a third party; leave as is. Also not constant-time at ms granularity (DB write on the wrong-password path adds ~1-2 ms) — equalising to within noise, not exactly.
- Rule 8 / audit: no new sensitive write. No audit line for unknown-email failures (login failures were never audited, DEC-117 rationale). The existing `auth.lockout` audit line is untouched. Do NOT log the dummy-verify path (no email/IP in logs).

## 3. Assumptions

A1 `req.ip` remains the only source of client IP (controller unchanged; never X-Forwarded-For directly). A2 e2e IPv6 clients are simulated via `X-Forwarded-For` (trust proxy 1 in `configureApp`/test app), documentation prefix `2001:db8::/32` (RFC 3849). A3 No change to throttler, controller, DTOs, Swagger, routes, schema, shared package — so no endpoint contract change: Swagger-detail and per-route API-journey gate families apply only as "no regression" (auth routes' docs untouched; existing journeys must stay green). A4 apps/web n/a.

## 4. Batches (<=3 files each; dependency order)

### Batch 1 — service + unit (2 files)

1. `apps/api/src/modules/auth/auth.service.ts`
   - Add `import { isIPv6 } from 'node:net';` (stdlib, after the `crypto` import).
   - Replace body of `normalizeClientIp` per (B). Update its JSDoc: delete the `ponytail: exact-address key -> key on the /64 prefix` line; state "IPv6 keyed on /64 (first 4 hextets, `a:b:c:d::/64`); IPv4/junk keep exact value capped at 45; zone id stripped". Add `ponytail: hex-form IPv4-mapped (::ffff:7f00:1) not unwrapped -> unwrap if a proxy ever emits it`.
   - Add the `getDummyHash` memo next to `verifyPassword` and the dummy verify in `login` per (C), with a comment citing DEC-118/#56 and the locked-path ceiling `ponytail:`.
   - In `recordFailedAttempt` prune: delete the `userId,` property from the `deleteMany` `where` (keep `firstFailedAt: { lt: ... }` and the `OR: [{ lockoutUntil: null }, { lockoutUntil: { lte: now } }]` guard exactly). Replace the `ponytail:` comment above it with: "Sweeps ALL users' dead rows (#56/DEC-118). ponytail: runs only when someone fails -> add a timer only if row count ever matters."
   - Do NOT touch: the upsert SQL, `auth.lockout` audit line, success `deleteMany({ userId, ip })`, `UnauthorizedException` messages, imports of Prisma.
   - Trust boundary: client-IP key derivation + auth failure path. Why: B/A/C.
2. `apps/api/src/modules/auth/auth.service.spec.ts` (`describe('normalizeClientIp')`, line ~291)
   - Change row `['2001:DB8::1', '2001:db8::1']` to `['2001:DB8::1', '2001:db8:0:0::/64']`.
   - Add rows (format is hextets joined by `:` then `::/64`): (1) `['2001:0db8:85a3:0042:1111:2222:3333:4444', '2001:db8:85a3:42::/64']`; (2) `['::1', '0:0:0:0::/64']`; (3) `['fe80::1%eth0', 'fe80:0:0:0::/64']`; (4) `['1::2:3:4:5:6:7', '1:0:2:3::/64']` (`::` fills 1 group: 1,0,2,3,4,5,6,7). Existing `['::ffff:1.2.3.4', '1.2.3.4']` stays.
   - Add one `it`: two addresses in the same /64 (`2001:db8:1:2::a`, `2001:db8:1:2:ffff:ffff:ffff:ffff`) normalize equal; `2001:db8:1:3::a` differs.
   - Keep the 45-char junk test unchanged (must still pass: `'A'*100` is not IPv6).
   - Expected unit: 10 suites / **79** (74 + 4 new rows + 1 new `it`; the rewritten row adds 0). Implementer reports the actual count; any deviation from 79 must be explained.
   - Tag: all inside existing `describe('AuthService [F-27]')`.

Batch 1 verification before Batch 2: `corepack pnpm --filter api test` 79, `corepack pnpm lint`, `corepack pnpm typecheck`, prettier format check clean. TDD: write the spec rows FIRST (RED against old `normalizeClientIp`), then the service.

### Batch 2 — e2e (1 file)

3. `apps/api/test/auth-lockout.e2e-spec.ts` — extend (do not replace); append after L15 using the existing helpers (`createScratchUser`, `loginVia`, `failFrom`, `rowFor`, `minutesAgo`; add a small local `ip6()` counter helper producing `2001:db8:<n>:<n>::<k>` strings, never repeating, <=5 requests per exact address because the in-memory throttler is shared). All titles end `[F-27]`.
   - **L16** IPv6 /64 shares one lock: user U; 3 failures spread over three DIFFERENT addresses in one /64 (`2001:db8:56:1::a`, `::b`, `2001:db8:56:1:1:2:3:4`); afterwards correct password from a fourth address in that /64 -> 401 (no Set-Cookie); exactly ONE row for U with `ip === '2001:db8:56:1::/64'`, `failedCount === 3`, `lockoutUntil` set.
   - **L17** adjacent /64 unaffected: after L16-style lock of U in `2001:db8:57:1::/64`, correct password from `2001:db8:57:2::a` -> 201, and from an unrelated IPv4 `ip()` -> 201; locked /64 row untouched (still `failedCount` 3).
   - **L18** global prune [A]: users X, Y; seed X row A (`firstFailedAt` 20 min ago, `lockoutUntil` null, stale), X row B (stale firstFailedAt 20 min ago, `lockoutUntil` +10 min = live lock), X row C (`firstFailedAt` 1 min ago, count 1, fresh); Y fails once from a fresh IP -> X row A gone, X rows B and C still present, Y row exists with `failedCount` 1.
   - **L19** timing equalised [C]: warm-up (one unknown-email login so argon2 + dummy hash are initialised, ignored). Then 5 trials each, one request per fresh IPv4 `ip()` (no throttle collisions), measuring `performance.now()` wall time: (a) unknown email, (b) INACTIVE scratch user, (c) ACTIVE user wrong password. Compute medians. Assert all statuses 401 and bodies byte-identical (`JSON.stringify(res.body)` equal across the three); assert `median(a) >= 0.5 * median(c)` and `median(b) >= 0.5 * median(c)`. (Without the dummy verify a ~1-3 ms vs ~27+ ms gap makes ratio ~0.05-0.15; threshold 0.5 leaves large margin for CI noise.) Document in a comment that this is a ratio, not an absolute-ms assertion, and why.
   - L13: its `['127.0.0.1','::1']` allow-list stays valid (socket peer is 127.0.0.1 since #55); the `::1` case would now be stored as `0:0:0:0::/64` — update the L13 allow-list to `['127.0.0.1', '0:0:0:0::/64']` ONLY if a run shows `::1`; otherwise leave (surgical).
   - Expected e2e: 10 suites / **129** (125 + L16, L17, L18, L19). Suite count unchanged. No change to `auth-lockout-race`, `auth.e2e`, `users.e2e`, `auth-throttle`.
   - Real DB, no mocks, no spies on argon2/Prisma. Scratch users `lockout-e2e-*@example.com`, removed in the file's existing `afterAll`; seeded admin never used.

### Batch 3 — docs (2 files)

4. `docs/adr/0004-jwt-argon2-auth.md` — append `## Addendum 2026-10-28 (task #56, DEC-118)`: lockout key for IPv6 = /64 (`a:b:c:d::/64`), old exact-IPv6 rows orphaned and swept, no migration; prune now global (no timer/scheduler, ceiling stated); unknown/inactive-email dummy argon2 verify (measured ~27 ms vs ~1-3 ms, throttle does not remove the oracle, locked-path ceiling); residual limits (shared /64, hex-form mapped, throttler/nginx still exact-address). Do NOT change status lines.
5. `planning/adr/ADR-0004-auth-approach.md` — same addendum condensed to 4 bullets (match the 6-bullet condensed style of the #52 addendum).
   (DECISIONS.md `DEC-118` entry, task file changelog, PROGRESS tick = orchestrator, not the implementer.)

## 5. Regression surface

`auth.service.ts` is touched by: `auth.controller.ts` (passes `req.ip`), `auth.service.spec.ts` (74 unit tests incl. the audit-line and login describes, which must stay green — they use real argon2), `auth.e2e-spec.ts` (E4/E5/#46 tests drive `AuthService.login` with specific IP literals — IPv4/'unknown' unaffected; any test passing a literal IPv6 or `::1` to the service must be re-checked), `auth-lockout*.e2e-spec.ts`, `auth-throttle.e2e-spec.ts` (T1.4 no-XFF fallback), `users.e2e-spec.ts` (activate/reset clear rows by userId only). Login latency for unknown emails rises ~27 ms (+~55 ms once). First-call memo: concurrent first calls share one hash promise (no race).

## 6. DoD gates

### Static (hub-reviewer)

- S1 `grep -n "from 'node:net'" apps/api/src/modules/auth/auth.service.ts` -> exactly 1 line, `isIPv6` only; `git diff -- apps/api/package.json pnpm-lock.yaml` empty (no new dep); `grep -rn "@nestjs/schedule\|setInterval" apps/api/src` -> no match.
- S2 Prune: in `recordFailedAttempt`, the `loginAttempt.deleteMany` `where` contains `firstFailedAt: { lt:` and the `OR: [{ lockoutUntil: null }, { lockoutUntil: { lte:` guard and does NOT contain `userId` (inspect that block); the old `prune-on-failure only -> add a nightly DELETE` ponytail text is gone, replaced by the new ceiling text.
- S3 `normalizeClientIp`: order = `!ip` -> lowercase/`::ffff:` strip/`%` strip -> `isIPv6` branch -> `.slice(0, 45)` for non-IPv6; output of IPv6 branch ends with `::/64`.
- S4 `login`: dummy verify sits ONLY in the `!user || user.status !== 'ACTIVE'` branch, before the `throw`; every `throw new UnauthorizedException(` still uses `INVALID_CREDENTIALS` (`grep -c "UnauthorizedException(INVALID_CREDENTIALS)"` unchanged or +0 vs before; no new message string); the dummy hash is created via `hashPassword` (same params), not a literal `$argon2id$...` string.
- S5 No logging added on the dummy path: `git diff` shows no new `auditLogger`/`Logger` call; no secret/email/IP written to logs. Rule 8: no new sensitive write path introduced (state in review).
- S6 No schema/migration change: `git diff --name-only` for this task shows none of `apps/api/prisma/**`; the only changed files are the 5 listed (+ orchestrator memory files).
- S7 Tests: every new `it(` title in e2e ends ` [F-27]`; no `jest.mock`/`jest.spyOn(argon2`/`spyOn(prisma` in the new tests; no `supertest` import (ESLint rule, DEC-116); no `it.only`/`it.skip`.
- S8 `corepack pnpm lint` 0 warnings; `corepack pnpm format:check` (or the repo's prettier check) clean; `corepack pnpm typecheck` clean.
- S9 ADR addenda present in both files with heading `Addendum 2026-10-28`; status lines unchanged (`git diff` shows additions only).

### Empirical (hub-tester); API server/DB per repo dev setup, `corepack pnpm` everywhere

- E1 Unit: `corepack pnpm --filter api test` -> 10 suites / 79 passed.
- E2 Full e2e: `corepack pnpm --filter api test:e2e` -> 10 suites / 129 passed; run 5 consecutive times, 0 failures.
- E3 RED-first evidence: against the unmodified service the new unit rows and L16, L17 (and L18) fail.
- E4 Isolation: `auth-lockout.e2e-spec.ts` alone x3; `--randomize` seeds 11/222/3333; each of L16, L17, L18, L19 alone via `-t 'L16 '` etc.; `--detectOpenHandles` clean.
- E5 Live probe (dev DB scratch user, `LOCKOUT_MAX_ATTEMPTS=3` api, XFF): 3 wrong from `2001:db8:70:1::a/b/c`, correct from `2001:db8:70:1::d` -> 401 no Set-Cookie; correct from `2001:db8:70:2::a` -> 201; `SELECT ip FROM login_attempts` shows `2001:db8:70:1::/64`; a mapped `::ffff:192.0.2.9` stores `192.0.2.9`. Locked/wrong/unknown/inactive response bodies byte-identical (`curl` diff).
- E6 Timing evidence (record numbers in the stage report): 10 unknown-email vs 10 wrong-password logins from fresh XFF IPs (<=5/IP): medians within 2x of each other; the same measurement on the mutated copy (dummy removed) shows unknown << wrong.
- E7 Mutation proofs on a SCRATCH COPY of the tree (never the repo; nothing left under `apps/api/test`): (m1) revert `normalizeClientIp` to exact IPv6 -> L16 + unit rows fail; (m2) key on /48 or first 3 hextets -> L17 or unit same-/64 `it` fails; (m3) put `userId` back in the prune -> L18 fails; (m4) drop the `OR` lock guard from the prune -> L18 (live-lock row B) fails; (m5) remove the dummy verify -> L19 fails (run 10x for stability); (m6) dummy verify also in the locked branch is NOT required — skip; (m7) distinct message in the unknown branch -> existing L5 and L19 body-equality fail. Report which mutation each test caught; unproven ones stated as UNPROVEN.
- E8 Scratch DB hygiene afterward: dev DB users = admin only, `login_attempts` = 0 rows; scratch DB/files dropped.
- E9 IMAGE-BUILD: see section 7 (expected not triggered).
- E10 No regression: `auth-throttle` 8/8, `auth.e2e` 21/21, `users.e2e` 56/56, `auth-lockout-race` 2/2 each alone.

### Gatekeeper criteria (zero-context standalone audit)

- G1 CLAUDE.md rule 8 (no unaudited sensitive write added; `auth.lockout` audit line preserved), rule 9 (activate/reset unlock paths untouched; `users.e2e` green).
- G2 DEC-113/DEC-115: per-(account, client IP) semantics — nobody lockable from another IP; SUPER_ADMIN no special case; one generic 401 for locked/wrong/unknown/inactive.
- G3 ADR-0004 addenda (#52 security invariant: nginx sole ingress, `trust proxy 1`) still true; new addendum records /64 key, global prune, dummy verify with the measurement, limits.
- G4 Minimal-code discipline: no new dependency (`git diff` of package manifests/lockfile empty), no timer/scheduler, only the 5 listed files changed, every changed line traces to A/B/C.
- G5 Task AC text (below) met item by item; DEC-118 logged; deferred/declined items documented, not silently dropped.
- G6 Test honesty: unit 79, e2e 129 with the stated counts; mutation results stated with UNPROVEN where applicable.

## 7. IMAGE-BUILD

Per `.claude/agents/hub-tester.md` trigger list (single source): required if a changed path matches `^apps/api/prisma/(schema.prisma|migrations/|seed.ts)`, `Dockerfile`, `.dockerignore`, `apps/api/package.json`, `apps/api/tsconfig*`, `tsconfig.base.json`, root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `packages/shared/{package.json,src/,tsconfig.json}`, or an `apps/api/src/**/*.ts` file matching `Prisma\.|@prisma/client`. This task's files: `apps/api/src/modules/auth/auth.service.ts` (planner grep for `Prisma\.|@prisma/client` -> NO match; it uses injected `PrismaService` + `this.prisma.$queryRaw`), `auth.service.spec.ts` (not under the trigger), `apps/api/test/*`, two ADR docs -> **NOT triggered** by this task. CAVEAT: the working tree is dirty with other tasks' uncommitted paths (`apps/api/prisma/migrations/2026102*`, `schema.prisma`, `seed.ts`, from #52/#54, already IMAGE-BUILD-passed), so the mechanical `git diff HEAD` + untracked command WILL match; the tester must report `IMAGE-BUILD: not triggered by #56's files (trigger matches come from #52/#54 paths already verified)`, and if the orchestrator prefers certainty, run the full gate anyway: unmodified `docker build -f apps/api/Dockerfile .` (no `--target`), `python3 tools/check-dockerfile-stages.py` is NOT needed (Dockerfile untouched), boot the image against a scratch DB, health 200 / admin login 201 / users 200 without hash, then stop/remove containers, scratch DB and image. If the implementer adds any `Prisma.`/`@prisma/client` reference to `auth.service.ts` the gate becomes required.

## 8. AC pointer text for the task file (replace "add description + acceptance criteria")

```
Goal: Financial traceability (auth hardening, F-27/E-07). Spec: docs/agentic/build-specs/2026-10-28-login-attempts-hardening.md
AC1 [A] Failure-path prune sweeps every user's dead login_attempts rows (stale window AND no live lock); live locks and fresh rows survive; no timer, no new dependency (proof: e2e L18).
AC2 [B] IPv6 client IPs are keyed on their /64 (a:b:c:d::/64); IPv4, ::ffff: mapped, 'unknown' and the 45-char cap behave as before; two addresses in one /64 share a lock, an adjacent /64 does not; no migration (proof: unit rows + e2e L16, L17).
AC3 [C] Unknown and INACTIVE emails run one dummy argon2 verify so median latency is >= 0.5x the wrong-password path; response body/status identical (proof: e2e L19).
AC4 DEC-113/115 semantics unchanged: per-(account, client IP), one generic 401 for locked/wrong/unknown/inactive, no audit regression; unit 79, e2e 10 suites/129, lint/format/typecheck clean, ADR-0004 addenda (both copies) + DEC-118.
```

## 9. OPEN QUESTIONS (recommended defaults; none block the build)

- Q1 (A) scope: DO the one-line global prune (default) or DEFER+document only? Default DO-minimal. Timer/scheduler rejected either way.
- Q2 (C): DO the dummy argon2 verify (default; ~27 ms CPU only on already-throttled unknown/inactive logins) or DEFER+document? Default DO. Behavior change is latency only; no status/body change.
- Q3 (B) behavior change: IPv6 clients locked at deploy time become unlocked, and households/offices sharing a /64 share one lock budget. Default accept (same class as DEC-115's accepted shared-egress limit).
- Q4: throttler (5/60s) and nginx `limit_req` stay exact-address for IPv6 (not /64). Default leave; file a follow-up only if the owner wants /64 rate limiting too.
- Q5: DEC number assumed `DEC-118` (next after DEC-117); orchestrator to confirm.
