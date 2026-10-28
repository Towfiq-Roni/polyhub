# Build spec: #55 e2e loopback bind (supertest wildcard-bind flake)

Date 2026-10-26 · Task `tasks/055-*.md` · Planner: hub-planner
**Build AFTER #52 closes** (auth-lockout.e2e-spec.ts is being edited by #52's L12 fix; re-run the grep in §1 at build start, do not trust the counts below). Orchestrator: `python3 tools/task.py start 55 --spec docs/agentic/build-specs/2026-10-26-e2e-localhost-bind.md` first.
Sources read: CLAUDE.md, planning/ENGINEERING_STANDARDS.md (test standards), docs/memory/pitfalls/INDEX.md, apps/api/src/app.setup.ts, all apps/api/test/*.e2e-spec.ts, apps/api/test/jest-e2e.json, eslint.config.mjs, DEC-111/114/115 + addendum 6. Test-only + lint-config + docs change: no product code, no schema, no endpoints.

## 0. Objective
Every e2e HTTP request must reach OUR app, never a foreign process on the dev machine. Today supertest `request(app.getHttpServer())` calls `server.listen(0)` per request, binding wildcard `::`; on macOS that succeeds even while another process (IntelliJ IDEA built-in server, 127.0.0.1:63343, answers 404 `server: IntelliJ IDEA`) holds 127.0.0.1:<same port>, and supertest then dials 127.0.0.1:<port> and hits the foreign listener (~1 in 20000 requests: `expected 201, received 404`). After: each app listens ONCE on `127.0.0.1` port 0 (kernel picks a port nobody holds on loopback; bind fails loudly instead of silently coexisting), supertest talks to that exact `http://127.0.0.1:<port>` URL, and a lint rule stops the old pattern returning.

## 1. Facts established (planner prototype + grep)
- Call sites at planning time (`grep -rn "request(app.getHttpServer())" apps/api/test`): auth 11, users 11, auth-lockout 2, health 1, auth-throttle 1 = 26. swagger.e2e (builds OpenAPI doc, no requests), db-indexes.e2e (Prisma only), prisma/seed.e2e-spec.ts (no app) make NO requests: untouched.
- Cookies: no file uses `request.agent`; refresh tests pass the cookie explicitly via `cookiePair` + `.set('Cookie', ...)`. So use plain `request(url)` (stateless, identical to today). NOT `request.agent(url)`: its cookie jar would silently change semantics (a login's refresh cookie would auto-replay on later calls).
- Reproduction (scratch `/private/tmp/claude-501/-Users-mdshakilurrahman-Documents-projects-Personal-polyhub/e34cd697-c973-409a-825a-7c2830e36290/scratchpad/p.js`, macOS, node): decoy `http` server on 127.0.0.1:P answering 404 `server: DECOY`. (a) old style `http.createServer(app).listen(P)` -> bind OK, `address()` = `{"address":"::","port":P}`, `GET 127.0.0.1:P` -> **404 DECOY** (flake reproduced deterministically). (b) `listen(P,'127.0.0.1')` -> **EADDRINUSE** (fails loudly). (c) `listen(0,'127.0.0.1')` -> `{"address":"127.0.0.1"}`, port != P. Linux may EADDRINUSE on (a) too; that is fine, the fix is correct on both.
- Design choice (1): ONE helper `apps/api/test/support/http.ts` (26 call sites + 6 boot sites would otherwise each need the listen/URL plumbing duplicated). Helper keeps call-site edit mechanical: `request(app.getHttpServer())` -> `http(app)`; `await app.init()` -> `await startApp(app)` (Nest `listen` calls `init` itself). `startApp` stores the URL in a `WeakMap<INestApplication,string>` so `http(app)` needs no extra variable (zero signature churn in `loginVia(app,...)` helpers).
- `app.close()` closes the listening server (Nest closes the http server it listened on); existing `afterAll(app.close())` calls stay as is. `listen` additionally logs Nest's "successfully started" line per app (harmless; do NOT add `useLogger` changes). No Logger override exists in these harnesses; none introduced.
- Lint guard chosen (6): ESLint `no-restricted-syntax` on `ImportDeclaration[source.value='supertest']` for `apps/api/test/**`, with the helper file exempted. Cheaper and stricter than a tools/ script (already part of `pnpm lint` and lint-staged), catches `request(server)` variants too. Root config edit is additive, 1 block.

## 2. Batches (≤3 files each, dependency order; orchestrator audits between batches)

### Batch 1 — helper + its own proof (2 files, both NEW)
1. `apps/api/test/support/http.ts`:
```ts
import { INestApplication } from '@nestjs/common';
import { AddressInfo } from 'net';
import request from 'supertest';

// supertest's request(server) calls server.listen(0) per request, binding the wildcard `::`;
// on macOS that succeeds even if another process holds 127.0.0.1:<same port>, so the request can
// reach a foreign listener (IntelliJ's built-in server answers 404). Listen once, on loopback.
const urls = new WeakMap<INestApplication, string>();

export async function startApp(app: INestApplication): Promise<string> {
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;
  urls.set(app, url);
  return url;
}

export function http(app: INestApplication): ReturnType<typeof request> {
  const url = urls.get(app);
  if (!url) throw new Error('http(app): call startApp(app) first');
  return request(url);
}
```
This is the ONLY file allowed to import `supertest`.
2. `apps/api/test/support/http.e2e-spec.ts` (matches jest-e2e `testRegex`; no DB, no AppModule): describe tag `[E2E-HARNESS] loopback-bound supertest helper`. Inline `@Controller('ping') class PingController { @Get() ping() { return 'pong'; } }` in `Test.createTestingModule({ controllers: [PingController] })`. Three tests:
   - H1 binds IPv4 loopback only: after `startApp`, `(app.getHttpServer().address() as AddressInfo).address === '127.0.0.1'`, and `await http(app).get('/ping')` -> 200 text `pong`.
   - H2 decoy cannot capture: start a decoy `http.createServer` (404, header `x-decoy: 1`) on `listen(0,'127.0.0.1')`; boot app via `startApp`; assert app port !== decoy port and the response has no `x-decoy` header and is 200 `pong`; then also start a SECOND app and assert its port differs from the first (each app owns its URL). Close decoy + apps in `afterAll`.
   - H3 `http(neverStartedApp)` throws `/startApp/`.
   Verify: `corepack pnpm --filter @hub/shared build && corepack pnpm --filter @hub/api test:e2e -- support/http` -> 1 suite, 3 passed.

### Batch 2 — convert the three largest harnesses (3 files)
Per file: add `import { http, startApp } from './support/http';`, delete `import request from 'supertest';`, replace every `await app.init();` in the app boot (beforeAll/bootApp) with `await startApp(app);`, replace every `request(app.getHttpServer())` with `http(app)` (chain unchanged; users.e2e:164 `http(app)[method](url)` keeps working). Do not touch assertions, describe names or feature tags.
3. `apps/api/test/auth.e2e-spec.ts` (11 sites; boot at ~line 96).
4. `apps/api/test/users.e2e-spec.ts` (11 sites; boot ~line 136).
5. `apps/api/test/health.e2e-spec.ts` (1 site; boot ~line 28).
Verify after batch: `corepack pnpm --filter @hub/api test:e2e` -> all suites still green (auth/users/health counts unchanged).

### Batch 3 — remaining harnesses + guard (3 files)
6. `apps/api/test/auth-throttle.e2e-spec.ts`: same transform; `bootApp()` ends with `await startApp(app); return app;` (the `trust proxy` override for D4 stays BEFORE `startApp`; listen after configuring). `loginVia` -> `http(app).post(...)`. (Each describe boots its own app and closes it: each gets its own port.)
7. `apps/api/test/auth-lockout.e2e-spec.ts`: same transform on whatever the file looks like after #52 (L14 `activate` call + `loginVia`); keep #52's L12 change intact. Re-grep before editing.
8. `eslint.config.mjs`: append two blocks BEFORE `eslintConfigPrettier`:
```js
  {
    files: ['apps/api/test/**/*.ts'],
    ignores: ['apps/api/test/support/http.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "ImportDeclaration[source.value='supertest']",
          message: "Use http(app) from ./support/http: supertest's request(server) binds the wildcard and can hit a foreign loopback listener (#55).",
        },
      ],
    },
  },
```
(One block with `ignores` is enough; flat-config `ignores` alongside `files` scopes the rule.) Comment: `// #55`.
Verify: `corepack pnpm lint` exit 0.

### Batch 4 — pitfall note (2 files, docs)
9. NEW `docs/memory/pitfalls/e2e-supertest-wildcard-bind-hits-foreign-listener.md` in the existing frontmatter format (`name`, `description`, `type: pitfall`): symptom (`expected 201, received 404`, ~1/20000, response header `server: IntelliJ IDEA`), root cause (supertest `listen(0)` -> `::` wildcard; macOS lets it coexist with 127.0.0.1:<same port>; client dials 127.0.0.1), fix (`startApp`/`http` in `apps/api/test/support/http.ts`, lint-enforced), check (`lsof -nP -iTCP:63343 -sTCP:LISTEN`; the scratch repro idea), why not `request.agent`.
10. `docs/memory/pitfalls/INDEX.md`: append ONE line `- [E2E supertest wildcard bind](e2e-supertest-wildcard-bind-hits-foreign-listener.md) — use http(app) from apps/api/test/support/http.ts; raw supertest request(server) can hit a foreign 127.0.0.1 listener (fix: #55).`
(Orchestrator adds the DECISIONS entry; implementer must log any deviation per pitfall `deviation-reasoned-but-not-logged`.)

## 3. Regression surface
Every e2e file's boot + every request. Risks: (a) `app.listen` after `configureApp`/trust-proxy override must stay before listen (done: startApp is the last boot step); (b) an app left listening if a `beforeAll` throws after `startApp` (same as today's open-handle risk; jest `--runInBand` run exits via existing behaviour — check no "open handle" hang); (c) auth-lockout/auth-throttle depend on `req.ip`: connecting over `127.0.0.1` yields `::ffff:127.0.0.1`-or-`127.0.0.1` (IPv4 socket gives `127.0.0.1`) vs previous possibly `::ffff:127.0.0.1`; tests set X-Forwarded-For (trust proxy 1) so keyed IP is the XFF value; any test relying on the *socket* IP (no XFF) normalizes via `normalizeClientIp` (strips `::ffff:`) so both forms map to `127.0.0.1`; verify those tests stay green and note in log if a literal differs. (d) lint-staged runs eslint on changed test files: they must not import supertest.

## 4. DoD gates

### Static (hub-reviewer)
- S1 `grep -rn "request(app.getHttpServer())" apps/api/test apps/api/prisma` -> empty.
- S2 `grep -rln "from 'supertest'" apps/api` (excluding node_modules) -> exactly `apps/api/test/support/http.ts`.
- S3 `grep -rn "getHttpServer()" apps/api/test` -> only `support/http.ts` (address read) and `support/http.e2e-spec.ts`.
- S4 every file with `bootApp`/`createNestApplication` in apps/api/test that issues requests contains `startApp(`: `for f in $(grep -l "http(app)" apps/api/test/*.e2e-spec.ts); do grep -q "startApp(app)" $f || echo MISSING $f; done` -> empty. No leftover `await app.init();` in those files (swagger.e2e-spec.ts keeps its init, it makes no requests).
- S5 `git diff --stat`: only the 10 files named above (+ spec file, task/memory files by orchestrator); `apps/api/src`, `schema.prisma`, `packages/**` untouched (`git diff --name-only -- apps/api/src apps/api/prisma packages | wc -l` = same as before #55 starts).
- S6 no new deps: `git diff package.json apps/api/package.json pnpm-lock.yaml` empty.
- S7 `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm --filter @hub/api format:check` (or repo's prettier check) exit 0. Unit tests unchanged: `corepack pnpm --filter @hub/api test` same count as baseline (74 after #52).
- S8 every pre-existing `describe(` string unchanged and feature tags intact: `git diff -U0 apps/api/test | grep -E "^[-+].*(describe|it)\(" ` -> empty for the 5 converted files (except the new helper spec).
- S9 mutation M1 (lint guard): temporarily put `import request from 'supertest';` in `apps/api/test/health.e2e-spec.ts` -> `corepack pnpm lint` must FAIL with the #55 message; revert. Mutation M2 (grep gate): revert ONE call site to `request(app.getHttpServer())` -> S1 non-empty + lint fails (supertest import needed); revert.
- IMAGE-BUILD: NOT triggered (test files, eslint config, docs only; no path on the hub-tester.md trigger list). Reviewer confirms by diff paths. No API endpoints changed, so Swagger-detail and API-journey gate families do not apply (existing journeys keep their coverage; no route added).

### Empirical (hub-tester)
- E1 baseline before Batch 2 is recorded by the orchestrator at start: full e2e = 8 suites / 121 tests (post-#52). After build: `corepack pnpm --filter @hub/shared build && corepack pnpm --filter @hub/api test:e2e` -> **9 suites / 124 tests**, 0 failed, process exits (no hang).
- E2 helper proof: `... test:e2e -- support/http` -> H1, H2, H3 pass.
- E3 deterministic repro of the old failure (scratch, not committed): run `node <scratchpad>/p.js` (or equivalent) -> prints wildcard bind `"address":"::"`, `GET 127.0.0.1 -> 404 DECOY`, then `listen(P,'127.0.0.1')` EADDRINUSE and `listen(0,'127.0.0.1')` address `127.0.0.1`. Then with a decoy on 127.0.0.1:63343 (or any port) held for the whole run, the full e2e passes (decoy never receives a request: decoy logs count 0). Tester writes the decoy in the scratchpad (`http.createServer` 404 counter on 127.0.0.1:<P>) and prints the counter.
- E4 flake loop: full e2e x 12 consecutive runs, each 9 suites / 124 green (`for i in $(seq 12); do corepack pnpm --filter @hub/api test:e2e 2>&1 | grep -E "^Tests:|^Test Suites:"; done`). Any failure -> REROUTE.
- E5 IDEA realism (macOS dev box): if `lsof -nP -iTCP:63343 -sTCP:LISTEN` shows IDEA, record it; the loop in E4 runs with it open.
- E6 mutation proof (empirical side of S9): revert `auth-throttle.e2e-spec.ts` `loginVia` to raw supertest `request(app.getHttpServer())` -> `pnpm lint` red; restore -> green.
- E7 order independence: run `test:e2e -- auth-lockout` and `-- auth-throttle` alone, green.

### Gatekeeper criteria
- G1 Task #55 text: loopback listen once per app + supertest pointed at that URL in ALL request-making harnesses (auth, users, auth-throttle, auth-lockout, health; swagger/db-indexes/seed make no requests and are correctly untouched).
- G2 planning/ENGINEERING_STANDARDS.md test standards + testing-anti-patterns: tests hit the real app over real HTTP, no mocks introduced; helper spec asserts observable behavior (bound address, decoy not hit).
- G3 CLAUDE.md "Minimal Code Discipline / Surgical Changes": diff is mechanical, no new dep, no src change, every changed line traces to the 3 transforms (import, boot, call site) + helper + lint block + pitfall.
- G4 CLAUDE.md Guardrails: 3-file batches, spec deviations logged in DECISIONS.md, no infra/Dockerfile touch (so no IMAGE-BUILD).
- G5 Harness memory: pitfall file + INDEX line exist; regression guard (lint) in `eslint.config.mjs` active and mutation-proven.
- G6 No behavior drift of #52/#53 tests: counts 124 = 121 + 3, feature tags kept.

## 5. Assumptions (no open questions)
A1 `app.listen(0,'127.0.0.1')` after a prior `app.init()` is not used; `startApp` replaces `init` (Nest `listen` initializes). A2 helper spec is added as a new e2e suite (+1 suite, +3 tests) rather than a unit test because jest unit config (`.*\.spec\.ts$`) would also match `.e2e-spec.ts`? Verify: unit run must NOT pick it up — if `pnpm --filter @hub/api test` count changes, rename the helper spec path accordingly (unit testRegex `.*\.spec\.ts$` does not match `.e2e-spec.ts` since the char before `spec` is `-`... the regex requires `.spec.ts` with a literal-ish dot; `e2e-spec.ts` has `-spec`, no match). A3 IPv6-only dev machines are out of scope (127.0.0.1 is assumed present). A4 No `request.agent` (see §1).
