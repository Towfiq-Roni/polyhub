# Build spec: shared configureApp(app) (task #53)

Date: 2026-10-26. Planner: hub-planner. Task file: tasks/053-extract-shared-configureapp-app-used-by.md.

Sources read: CLAUDE.md (rules, minimal-code, delegation), apps/api/src/main.ts, apps/api/test/{auth,users,auth-throttle,health,swagger}.e2e-spec.ts, apps/api/src/app.module.spec.ts, apps/api/test/jest-e2e.json, DEC-111 + addenda 1-4 (DECISIONS.md), `.claude/agents/hub-tester.md` IMAGE-BUILD section, skills nestjs-best-practices (hub overrides: single /api/v1 prefix, global ValidationPipe + envelope interceptor, shutdown hooks) and hub-codebase (placement, colocated specs).

## 1. Objective
Extract the hand-copied app wiring (trust proxy, cookie-parser, global ValidationPipe, TransformInterceptor, HttpExceptionFilter, global prefix `api/v1`) into ONE exported `configureApp(app)` in `apps/api/src/app.setup.ts`, called by `main.ts` and every e2e harness that boots an app, so they cannot drift. The auth-throttle D6 main.ts text-parity guard is then deleted. Runtime behaviour is unchanged (e2e 7 suites / 108 tests green, unit 60 green, Swagger document unchanged).

## 2. Design decisions (with reasons)
- Location `apps/api/src/app.setup.ts` (NEW). Importable from tests without running bootstrap (main.ts calls `bootstrap()` on import). It imports only the interceptor/filter/cookie-parser, NOT AppModule, so it does not trigger the env-validation-at-import problem noted in app.module.spec.ts.
- Signature: `export function configureApp(app: INestApplication): void`. No options object (YAGNI). Synchronous.
- One exported constant `export const TRUST_PROXY_HOPS = 1;` with the existing nginx rationale comment moved here from main.ts. Used only inside `configureApp` (`app.getHttpAdapter().getInstance().set('trust proxy', TRUST_PROXY_HOPS)`). Tests do not import it for production-parity describes; they simply call `configureApp`, so mutating the constant moves every harness AND main.ts together.
- Configured inside configureApp: trust proxy, `app.use(cookieParser())`, `useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))`, `useGlobalInterceptors(new TransformInterceptor())`, `useGlobalFilters(new HttpExceptionFilter())`, `setGlobalPrefix('api/v1')`.
- Stays in main.ts only: `NestFactory.create`, ConfigService reads, `enableCors` (needs WEB_ORIGIN, tests do not use CORS), Swagger DocumentBuilder/setup (`api/docs`), `enableShutdownHooks`, `listen`. Order in main.ts: create -> `configureApp(app)` -> CORS -> Swagger (after the prefix is set, same as today; today CORS was before the prefix call, which is order-independent) -> shutdown hooks -> listen.
- D4 negative control (trust proxy FALSE): auth-throttle `bootApp(trustProxyOverride?: boolean | number)` calls `configureApp(app)` then, only when an override is passed, `app.getHttpAdapter().getInstance().set('trust proxy', override)`. Express reads the setting per request, so setting it after configureApp is valid. No option added to configureApp. Production-parity describes call `bootApp()` with no argument; D4 calls `bootApp(false)`.
- D6 parity guard: DELETE (the whole `describe('Trust-proxy parity drift guard [F-27]')`, plus now-unused imports `readFileSync`, `path`, `PROD_TRUST_PROXY`). No replacement text test: replacing a text guard with another text guard defeats the point. main.ts calling configureApp is proven by the typecheck (import must resolve), the static grep gate below, and the IMAGE-BUILD boot probe (throttle by XFF, see E8). Residual risk (someone deletes the call in main.ts) is accepted and covered by those gates; logged here as `ponytail: main.ts call not unit-tested -> add a bootstrap smoke test only if main.ts gains more logic`.
- Harness adoption: auth, users, auth-throttle (required by AC) and health, swagger (they boot an app with a subset of the wiring; adopting makes them identical to prod and removes the last hand copies). Health and swagger have no behaviour change expected (extra pipes/filters/cookie-parser/trust proxy do not affect `GET /health` or the OpenAPI document). jest-e2e.json and app.module.spec.ts: no change (module spec uses `Test.createTestingModule` only, no app).
- Trust boundary: trust proxy/cookie-parser/ValidationPipe whitelist are security-relevant (throttle key, input validation). Pure move, no value change. No money path, no API route added or changed, no new deps, no Dockerfile change.

## 3. Batches (<=3 files each, dependency order)

### Batch 1: new module + main.ts (2 files)
1. `apps/api/src/app.setup.ts` (NEW). Imports: `cookieParser from 'cookie-parser'`, `{ INestApplication, ValidationPipe } from '@nestjs/common'`, `TransformInterceptor` (`./common/interceptors/transform.interceptor`), `HttpExceptionFilter` (`./common/filters/http-exception.filter`). Export `TRUST_PROXY_HOPS = 1` (with the existing comment: nginx first hop, req.ip from X-Forwarded-For for ThrottlerGuard per-client login limit) and `configureApp(app)` with the six statements above, in that order (trust proxy, cookie-parser, pipes, interceptors, filters, prefix). Why: single source.
2. `apps/api/src/main.ts`: add `import { configureApp } from './app.setup';`; replace the `trust proxy` statement + its comment, `app.use(cookieParser())`, the three `useGlobal*` lines and `app.setGlobalPrefix('api/v1')` with one `configureApp(app);`; remove now-unused imports `cookieParser`, `ValidationPipe`, `TransformInterceptor`, `HttpExceptionFilter`. Keep ConfigService, CORS, Swagger, shutdown hooks, listen exactly as is. Why: remove duplication; leave non-shared bootstrap.

### Batch 2: harnesses named by the AC (3 files)
3. `apps/api/test/auth.e2e-spec.ts`: in `beforeAll` replace lines `app.use(cookieParser())` .. `set('trust proxy', 1)` (about lines 94-105, including the long trust-proxy comment, keep a one-line note that configureApp mirrors main.ts and per-login simulated IPs keep throttle buckets independent) with `configureApp(app);`. Update the comment at ~86 accordingly. Remove unused imports (`ValidationPipe`, `cookieParser`, `TransformInterceptor`, `HttpExceptionFilter`); add `import { configureApp } from '../src/app.setup';`. Keep `app.init()`.
4. `apps/api/test/users.e2e-spec.ts`: same replacement of lines ~137-142 with `configureApp(app);`; fix imports (keep `Logger`, `LoggerService`, `INestApplication`).
5. `apps/api/test/auth-throttle.e2e-spec.ts`: (a) `bootApp(trustProxyOverride?: boolean | number)` body: `createNestApplication()`, `configureApp(app)`, `if (trustProxyOverride !== undefined) app.getHttpAdapter().getInstance().set('trust proxy', trustProxyOverride);`, `await app.init()`. (b) delete `const PROD_TRUST_PROXY = 1;`; every `bootApp(PROD_TRUST_PROXY)` becomes `bootApp()`; the D4 control keeps `bootApp(false)`. (c) delete the D6 describe; delete imports `readFileSync`, `path`, `ValidationPipe`, `cookieParser`, `TransformInterceptor`, `HttpExceptionFilter`; add `configureApp` import. (d) header comment: remove the "D6 parity guard" mention, note that apps are configured by `configureApp` so the proxy hop count comes from the shared constant; keep the D1-D5 numbering text consistent. Note: the D2/D3 "trust proxy 2" mutation now means changing `TRUST_PROXY_HOPS`.

### Batch 3: remaining harnesses (2 files)
6. `apps/api/test/health.e2e-spec.ts`: replace `app.useGlobalInterceptors(new TransformInterceptor()); app.setGlobalPrefix('api/v1');` with `configureApp(app);`; fix imports.
7. `apps/api/test/swagger.e2e-spec.ts`: replace `app.setGlobalPrefix('api/v1');` with `configureApp(app);` and add the import. Keep the DocumentBuilder part (title 'Hub API', version '1.0') unchanged; note main.ts still owns Swagger setup (the test mirrors it by design).

Regression surface: every e2e suite (all use the new wiring), `main.ts` (Docker CMD runs dist/main.js), Express `trust proxy` setting (login throttle key), refresh cookie parsing, ValidationPipe whitelist, response envelope. `dist` path: `apps/api/dist/main.js` must still be emitted and `dist/app.setup.js` must exist.

## 4. DoD gates

### Static (hub-reviewer)
- S1: `grep -rn "trust proxy" apps/api/src apps/api/test` returns lines ONLY in `apps/api/src/app.setup.ts` and the single D4 override line in `apps/api/test/auth-throttle.e2e-spec.ts` (plus comments). Any other `set('trust proxy'` is a FAIL.
- S2: `grep -rnE "new ValidationPipe|cookieParser\(|setGlobalPrefix\(|new HttpExceptionFilter|new TransformInterceptor" apps/api/src apps/api/test --include=*.ts` matches ONLY `apps/api/src/app.setup.ts` (spec files like unit specs that construct a filter directly for a unit test are the only allowed exceptions, name them in the report).
- S3: `grep -n "configureApp" apps/api/src/main.ts` shows import + exactly one call; `grep -c "configureApp(app)" apps/api/test/{auth,users,auth-throttle,health,swagger}.e2e-spec.ts` is >= 1 each (auth-throttle: inside `bootApp`).
- S4: `grep -nE "PROD_TRUST_PROXY|readFileSync|Trust-proxy parity" apps/api/test/auth-throttle.e2e-spec.ts` returns nothing; `grep -n "main.ts" apps/api/test/auth-throttle.e2e-spec.ts` has no source-text read.
- S5: `grep -nE "enableCors|SwaggerModule|enableShutdownHooks|listen" apps/api/src/app.setup.ts` returns nothing (non-shared concerns stay in main.ts); `configureApp` has exactly one parameter.
- S6: `grep -n "export const TRUST_PROXY_HOPS = 1" apps/api/src/app.setup.ts` and it is referenced exactly once in `set('trust proxy', TRUST_PROXY_HOPS)`.
- S7: `git diff --stat` shows no change to `package.json`, `pnpm-lock.yaml`, `apps/api/Dockerfile`, `packages/shared`, `apps/api/prisma`; no unused imports (`pnpm lint` clean).
- S8: `pnpm lint && pnpm typecheck && pnpm test` green (unit 60).

### Empirical (hub-tester); dev Postgres up, scratch copies only for mutations
- E1: `pnpm --filter api test:e2e` (or the repo's e2e script) run twice: 7 suites / 108 tests green, no test removed except the single D6 test, so the count is 107 + 0? STATE EXACTLY: auth-throttle goes from 11 to 10 tests, so the expected total is 7 suites / 107 tests. (The task's "108" was the pre-change figure; the D6 deletion is the only count change. Any other delta is a FAIL.)
- E2: auth-throttle alone, plain + `--randomize` seeds 1-3: 10/10 each; `--detectOpenHandles` clean.
- E3 mutation M1 (scratch copy): set `TRUST_PROXY_HOPS = 2` -> auth-throttle independence/multi-hop tests fail (D1 T1.x and D3 T3.x); restore.
- E4 mutation M2 (scratch copy): remove `app.use(cookieParser())` from configureApp -> auth.e2e refresh/logout cookie tests fail (e.g. the refresh journey reading `refresh_token`); restore.
- E5 mutation M3 (scratch copy): ValidationPipe `whitelist: false` -> a validation e2e fails (an unknown-property rejection/stripping test in users or auth; the tester names the one observed; if NONE fails, report FAIL: the pipe option is untested and the spec must be amended with a new test); restore.
- E6 mutation M4 (scratch copy): remove `setGlobalPrefix` -> every suite 404s (sanity). M5: comment out the `configureApp(app)` call in `bootApp` D4 override only (set override false still present) - not required.
- E7 Swagger unchanged: swagger.e2e green; additionally compare OpenAPI JSON before vs after (build old via `git stash`-free method: `git show HEAD:apps/api/test/swagger.e2e-spec.ts` is not enough, so run the built app before and after at the IMAGE-BUILD step and `curl localhost:4010/api/docs-json | python3 -c 'import sys,json;print(json.dumps(json.load(sys.stdin),sort_keys=True))' | shasum`; the hash from a build of `HEAD` (git worktree/scratch) must equal the hash of the new build).
- E8 IMAGE-BUILD (explicitly REQUIRED for this task even though NO trigger regex in hub-tester.md matches: changed paths are `apps/api/src/app.setup.ts`, `apps/api/src/main.ts`, e2e specs, none contain `Prisma.|@prisma/client`; the gate is required because main.ts is what the Docker image runs). Execute the procedure in `.claude/agents/hub-tester.md` section "Image-build gate" (b)-(e) verbatim: `python3 tools/check-dockerfile-stages.py` exit 0 (Dockerfile untouched, sanity only); pre-clean; unmodified `docker build -f apps/api/Dockerfile -t hub-api-gate:53 .` with NO `--target`, exit 0; `test -f /repo/apps/api/dist/main.js` prints ok and ALSO `test -f /repo/apps/api/dist/app.setup.js`; boot with all env vars inline via `-e`, port 4010, EXIT trap cleanup; health 200; login 201 token at `.data.accessToken`; `GET /api/v1/users` 200 with no `passwordHash`/`password`. Extra probe for configureApp parity on the real image (use a scratch/non-admin user is NOT possible without DB writes, so use the throttle only): do this BEFORE the single admin login, send 6 `POST /api/v1/auth/login` with a nonexistent email `nobody@example.com` and header `X-Forwarded-For: 198.51.100.7`: expect 401 x5 then 429; a 7th with `X-Forwarded-For: 198.51.100.8` is 401 (proves trust proxy 1 live in main.ts). Note the 5/60s per-IP budget is per source, so the admin login afterwards uses yet another XFF `198.51.100.9`. Report side effects (sessions row from the admin login) and that cleanup ran.
- E9: DB before == after for e2e (users count, no `throttle-e2e-`, `users-e2e-`, scratch rows left), same as DEC-111 addendum 2.

### Gatekeeper criteria
- AC (1)-(4) of `tasks/053-*.md`: one shared configureApp used by main.ts and the auth/users/auth-throttle harnesses; D6 removed; behaviour unchanged; IMAGE-BUILD done.
- CLAUDE.md Minimal Code Discipline (reuse, no new deps, no options object, surgical diff, every changed line traces to the task); Guardrail "main agent never writes product code" respected.
- ENGINEERING_STANDARDS / ADR-0002 (NestJS backend; single `/api/v1` prefix, global pipe/envelope/filter) unchanged in behaviour; nestjs-best-practices override `devops-graceful-shutdown` still satisfied (`enableShutdownHooks` still in main.ts).
- DEC-111 follow-up (addendum 1/3: "extract shared configureApp") is closed; record DEC-114 candidate in completion notes: D6 removed, D4 override-after-configureApp pattern, TRUST_PROXY_HOPS single constant.
- Security: whitelist ValidationPipe, cookie-parser, trust proxy 1 still active in the running image (E8 probe).

## 5. Assumptions
- A1: Test count after change is 107 (D6 deleted, nothing added). If the implementer adds a replacement test the count changes and must be justified.
- A2: Swagger setup stays in main.ts (not shared) because only main.ts serves it; the swagger e2e deliberately mirrors the DocumentBuilder.
- A3: CORS stays in main.ts (needs ConfigService WEB_ORIGIN; no e2e exercises CORS).
- A4: `import cookieParser from 'cookie-parser'` works in src exactly as it does in main.ts today (esModuleInterop), no tsconfig change.

## 6. Open questions
None.
