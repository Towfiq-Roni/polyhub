# Build spec: TASKS #47 dependency security upgrade (2026-10-25)

Sources read: CLAUDE.md (locked stack, surgical changes), tasks/047, `pnpm audit` live (`scratchpad/audit-now.json`), root/api/shared package.json, apps/api/Dockerfile (node:22-alpine, argon2 lesson DEC-084), DEC-080 (NestJS 12 / Prisma 7 rejected, pins to 11 / 6), Makefile, infra/scripts/smoke.sh, env.validation.ts, npm registry (`npm view`) for in-major availability. Not a finance-touching change (no ledger code); accountant-expert not needed. Finance e2e paths are only regression-covered by the existing suite.

## 1. Objective
Clear all critical/high (and as many moderate/low as possible) `pnpm audit` advisories inside locked majors (NestJS 11, Prisma 6, TS 6, zod 4, jest 30) via manifest bumps plus a minimal `pnpm.overrides` block, with zero behavior change. Afterwards: `corepack pnpm audit --prod` shows critical 0 / high 0; all gates green; docker image builds and boots.

## 2. Baseline (2026-10-25, live)
Total low 3 / moderate 9 / high 13 / critical 3. `--prod`: low 1 / moderate 2 / high 7 / critical 1 (deepmerge-ts, multer x5, js-yaml, proxy-addr, zod, body-parser).

## 3. Per-finding strategy (verified against registry)

| Finding | Path | Fix available in locked major? | Action |
|---|---|---|---|
| zod high (<4.6.6) | apps/api + packages/shared direct | yes, zod 4.6.7 | direct bump `^4.6.7` in BOTH package.json |
| handlebars critical/mod (<=4.7.9) | ts-jest (dev) | yes, ts-jest 29.4.15 requires `handlebars ^4.7.10` | direct bump ts-jest `^29.4.15` |
| proxy-addr critical (<2.0.8) | express 5.2.1 dep `^2.0.7` | in-range, lockfile only | lockfile refresh (no override); express 5.2.1 is pinned exact by platform-express 11.2.8 and still current in-major |
| body-parser high (<2.4.0) | express 5.2.1 dep `^2.2.1` | in-range, lockfile only | lockfile refresh (no override) |
| multer high x4/mod/low (<2.5.0) | platform-express 11.2.8 pins EXACT `multer 2.4.0` | NO in-major release (11.2.8 latest 11.x still 2.4.0) | `pnpm.overrides` `"multer": "2.5.0"`. ponytail: remove when @nestjs/platform-express 11.x depends on multer >=2.5.0. Multer is not imported by our code (no FileInterceptor/upload route) so exposure is nil but override is cheap and API-compatible (2.x patch/minor) |
| js-yaml mod (<5.4.1) | @nestjs/swagger 11.4.7 pins EXACT `js-yaml 5.3.0` (11.4.7 is latest 11.x; 12.x is out-of-major) | NO | `pnpm.overrides` `"js-yaml": "5.5.0"`. ponytail: remove when @nestjs/swagger 11.x depends on js-yaml >=5.4.1 |
| deepmerge-ts high (<8.0.0) | @prisma/config 6.19.3 pins EXACT `7.1.5`; prisma 6.19.3 is latest stable 6.x (6.20 only integration builds) | NO | TRY `pnpm.overrides` `"deepmerge-ts": "8.0.2"` (ships CJS via exports.require, node>=16.9; used only by Prisma CLI config merge). ponytail: remove when @prisma/config 6.x moves to deepmerge-ts >=8. Empirically gated (G-E6); if `prisma generate`/`migrate`/seed break, DROP the override and accept (see section 5) |
| brace-expansion high/mod (3 majors 1.x/2.x/5.x) | minimatch ranges via eslint/typescript-eslint/jest (dev) | in-range (patched 1.1.21 / 2.1.7 / 5.0.12 satisfy parents) | lockfile refresh only |
| fast-uri mod/low (<3.1.9) | ajv 8.20 dep `^3.0.1` via @commitlint (dev) | in-range | lockfile refresh only |
| @nestjs/* 11.2.3 | direct | 11.2.8 latest 11.x | bump floors `^11.2.8` for common/core/platform-express/testing together (avoid mixed versions); no advisory depends on it, hygiene patch only |

Not touched on purpose: @commitlint/* (already latest 21.2.4; fix is transitive in-range), prisma/@prisma/client (6.19.3 latest stable 6), @nestjs/swagger (11.4.7 latest 11), jest (30.5.1 range fine), NestJS 12 / Prisma 7 / swagger 12 (locked-major violation, DEC-080).

## 4. Minute breakdown

Environment: use `corepack pnpm` everywhere (pitfall pnpm-not-on-path). Do NOT create infra/.env.* files. Do not edit apps/api/Dockerfile or infra/ (not needed: manifests are copied by the Dockerfile `deps` stage and root package.json carries overrides; `--frozen-lockfile` validates overrides against lockfile).

### Batch 1 (3 hand-edited files + mechanical lockfile output; ONE delegation)
1. `/Users/mdshakilurrahman/Documents/projects/Personal/polyhub/apps/api/package.json`: `dependencies`: `@nestjs/common|core|platform-express` -> `^11.2.8`; `zod` -> `^4.6.7`. `devDependencies`: `@nestjs/testing` -> `^11.2.8`; `ts-jest` -> `^29.4.15`. Touch nothing else (keep `prisma` in dependencies per DEC-084).
2. `/Users/mdshakilurrahman/Documents/projects/Personal/polyhub/packages/shared/package.json`: `zod` -> `^4.6.7`.
3. `/Users/mdshakilurrahman/Documents/projects/Personal/polyhub/package.json` (root): add top-level
   ```json
   "pnpm": { "overrides": { "multer": "2.5.0", "js-yaml": "5.5.0", "deepmerge-ts": "8.0.2" } }
   ```
   (pnpm 9.15 reads `pnpm.overrides` from root package.json; `overrides:` in pnpm-workspace.yaml is pnpm 10 only, do not use). Add a sibling `"//pnpm.overrides"` comment-key in the style of the existing `"// dev"` key listing the ponytail removal conditions from section 3.
4. Regenerate lockfile (mechanical output, `/Users/mdshakilurrahman/Documents/projects/Personal/polyhub/pnpm-lock.yaml`, not counted against the 3-file limit, not hand-edited): `corepack pnpm install` then in-range transitive refresh: `corepack pnpm update -r --depth Infinity proxy-addr body-parser brace-expansion fast-uri handlebars`. If any of those still resolve a vulnerable version, add that package to `pnpm.overrides` with the patched floor (`"proxy-addr": "^2.0.8"`, `"body-parser": "^2.4.0"`, `"brace-expansion@1": "1.1.21"` style selectors as needed) plus a ponytail comment; report it. Then `corepack pnpm install --frozen-lockfile` must succeed (proves Dockerfile path).
5. Run section 6 static + empirical gates E1-E5 yourself, record results in RUNLOG.

### Batch 2 (verification only, zero edits; hub-tester)
Gates E6-E9 (prisma CLI, docker build/boot, argon2, live e2e). Any failure => back to Batch 1 delta (drop/adjust the offending override), never inline patch.

Trust boundary/regression surface: express/body-parser/proxy-addr sit under every HTTP route (cookie-parser, `trust proxy` = 1 in `apps/api/src/main.ts:21` drives throttler client IP and lockout logic: re-verify via e2e). zod call sites (grep-confirmed only 2): `apps/api/src/config/env.validation.ts` (`z.preprocess`, `z.coerce`, `.default`, `safeParse`) and `packages/shared/src/auth/schemas.ts`. Money paths: none touched. No DB/schema change.

## 5. Findings that cannot be fixed inside locked majors (recommended accept, to be logged as a DEC by orchestrator)
Expected after Batch 1: none, because overrides cover the pinned-exact transitives. Contingent: (a) deepmerge-ts if override breaks Prisma CLI: accept; exposure is a stack-exhaustion DoS when merging recursive graphs in the Prisma CLI config loader, run only by trusted operators at build/migrate time against repo-owned config, never on request path; revisit on Prisma 6.x patch or at a deliberate Prisma 7 migration task. (b) multer/js-yaml overrides are "out-of-range-of-parent-pins" forced upgrades, not accepted risks; they are tracked by their ponytail removal conditions. Majors NOT adopted: @nestjs/* 12, @nestjs/swagger 12, prisma 7/8-rc (DEC-080).

## 6. DoD gates

### Static (hub-reviewer)
- S1 `git diff --stat` touches only: root package.json, apps/api/package.json, packages/shared/package.json, pnpm-lock.yaml (+ RUNLOG). `git diff --name-only | grep -vE '^(package.json|apps/api/package.json|packages/shared/package.json|pnpm-lock.yaml|docs/agentic/)'` is empty. No Dockerfile/infra change.
- S2 Majors unchanged: `git diff -U0 package.json apps/api/package.json packages/shared/package.json | grep '^+' | grep -E '"(@nestjs/[a-z-]+|prisma|@prisma/client|typescript|jest|zod|ts-jest)":'` shows only `^11.2.8`, `^4.6.7`, `^29.4.15`; no `@nestjs/*` 12, prisma 7+, swagger 12.
- S3 `grep -n '"pnpm"' -A3 package.json` shows overrides exactly multer/js-yaml/deepmerge-ts (plus any report-justified extras) each with a ponytail removal condition in a `//` key; no pnpm-workspace.yaml `overrides:`.
- S4 No new dependency names added: `git diff -U0 -- '*package.json' | grep '^+' | grep -c '"[@a-z/-]*": "\^'` equals count of bumped existing keys only (no new keys besides `pnpm`).
- S5 Lockfile resolution: `grep -nE '^  (multer|js-yaml|proxy-addr|body-parser|handlebars|zod|fast-uri|deepmerge-ts)@' pnpm-lock.yaml` shows multer@2.5.0, js-yaml@5.5.0, proxy-addr@2.0.8+, body-parser@2.4.0+, handlebars@4.7.10+, zod@4.6.7, fast-uri@3.1.9+ (deepmerge-ts@8.0.2 if override kept); `grep -E 'brace-expansion@' pnpm-lock.yaml` shows only >=1.1.21 / >=2.1.7 / >=5.0.12.
- S6 `corepack pnpm install --frozen-lockfile` exits 0.
- S7 `corepack pnpm audit --prod` : critical 0, high 0 (record full counts). `corepack pnpm audit`: record counts; every remaining advisory listed with reason in RUNLOG.
- S8 No money/ledger/source file in diff; no secrets or `infra/.env*` files created (`git status --short infra` empty).

### Empirical (hub-tester; all via `corepack pnpm`, Postgres from `docker compose -f infra/docker-compose.dev.yml up -d`)
- E1 `corepack pnpm lint` and `corepack pnpm format:check` exit 0.
- E2 `corepack pnpm --filter @hub/shared build && corepack pnpm typecheck` exit 0 (build shared first per pitfall).
- E3 `corepack pnpm test`: 58 unit passed, 0 failed (ts-jest bump proof).
- E4 `corepack pnpm --filter @hub/api test:e2e`: 84 passed, 0 failed, includes auth (login, refresh, lockout, throttler/trust-proxy client-IP), users, health, swagger, db-indexes suites. Run it twice (second run catches state leakage).
- E5 `corepack pnpm --filter @hub/api build` exit 0 and `ls apps/api/dist/main.js`.
- E6 Prisma 6 CLI under overrides: `corepack pnpm --filter @hub/api exec prisma generate` ok; `prisma migrate status` against dev DB reports up to date; `corepack pnpm --filter @hub/api exec prisma db seed` ok (loads @prisma/config -> deepmerge-ts 8). If fails: drop deepmerge-ts override, re-run E1-E6, report as accepted risk.
- E7 Docker (AMENDED 2026-10-25, DEC-107: the repo Dockerfile has a pre-existing build-order defect since #2 — `nest build` runs before `prisma generate` — filed as task #48; E7 is satisfied for #47 by building a scratch Dockerfile copy with the two RUN lines swapped; the repo Dockerfile is fixed under #48): `docker build -f apps/api/Dockerfile --target runtime -t hub-api:sec47 .` from repo root exits 0 (frozen-lockfile + `--prod` install with overrides; note the Dockerfile's last stage is `dev`, so `--target runtime` is mandatory). `docker run --rm hub-api:sec47 node -e "require('argon2').hash('x').then(h=>console.log(h.startsWith('\$argon2id'))).then(()=>process.exit(0))"` run with workdir `/repo/apps/api` prints `true` (argon2 loads on node:22-alpine, no segfault, exit 0). `docker run --rm hub-api:sec47 node -e "console.log(require('multer/package.json').version)"` is not resolvable from api (transitive); instead `docker run --rm hub-api:sec47 sh -c "ls node_modules/.pnpm | grep -E '^(multer|js-yaml|proxy-addr|body-parser|zod)@'"` shows patched versions.
- E8 Container boot (no infra/.env files allowed): run the image with inline `-e` flags against the dev Postgres, e.g. `docker run --rm -d --network host -e DATABASE_URL=<dev compose url from infra/.env.dev.example values, passed inline> -e JWT_ACCESS_SECRET=x -e JWT_REFRESH_SECRET=y -e SUPER_ADMIN_EMAIL=a@b.co -e SUPER_ADMIN_PASSWORD=pw -e WEB_ORIGIN=http://localhost:3000 -e PORT=4100 hub-api:sec47`; then `curl -s -o /dev/null -w '%{http_code}' http://localhost:4100/api/v1/health` = 200; `curl -s -X POST http://localhost:4100/api/v1/auth/login -H 'content-type: application/json' -d '{}'` returns 4xx envelope (not 500); container stays up 10s (`docker ps`). `make prod-build` / `infra/scripts/smoke.sh` need infra/.env.prod and an nginx/TLS stack which agents must not create: NOT RUN, say so; this inline-env boot plus health is the accepted substitute. Fallback if docker boot impossible: `node apps/api/dist/main.js` with same env. Stop container afterwards.
- E9 Live users + auth re-run (rerun of live e2e): with API started (`corepack pnpm --filter @hub/api start:dev` or the E8 container), exercise: login SUPER_ADMIN -> 200 with cookies/tokens; wrong password -> 401; `GET /api/v1/users` with token -> 200 list; without token -> 401; `POST /api/v1/users` invalid body (bad email) -> 400/422 envelope with zod/class-validator message and no stack leak; refresh -> 200; logout then refresh -> 401. Plus a malformed body regression for the body-parser bump: `curl -X POST .../auth/login -H 'content-type: application/json' -d '{bad'` -> 400 (not 500, not hang). Env validation regression (zod 4.6.7): start with `JWT_ACCESS_SECRET` unset -> process exits non-zero with message naming `JWT_ACCESS_SECRET`; `COOKIE_SECURE=false` yields boolean false (Set-Cookie lacks `Secure`).

### Gatekeeper criteria (hub-gatekeeper, zero context)
- G1 CLAUDE.md locked stack: NestJS 11, Prisma 6, TS 6 majors unchanged (S2); DEC-080 not violated; footprint: no new deps (S4).
- G2 Task 47 success: `pnpm audit --prod` critical/high = 0 re-run independently; remaining advisories each reasoned; DEC to be logged by orchestrator (overrides + ponytail removal conditions + any accepted risk) before Stage B closes (pitfall deviation-reasoned-but-not-logged).
- G3 ENGINEERING_STANDARDS / surgical-changes: diff limited to manifests + lockfile; no behavior or source changes.
- G4 Gates E1-E9 independently re-run: lint/format/typecheck/58 unit/84 e2e/build green; docker build + boot + argon2 load verified or explicitly declared not-run with substitute.
- G5 Rollback plan present and workable (section 7).
- G6 CLAUDE.md non-negotiables 1-9 untouched (no ledger/RBAC/audit code in diff).

## 7. Regression plan and rollback
- express 5.2.1 (unchanged) with body-parser 2.4.0 (fix: trailing-bytes-after-compressed-body DoS) and proxy-addr 2.0.8 (trust-proxy IP parsing fix): covered by E4 throttler/lockout e2e and E9 malformed-body probe; check `trust proxy`=1 yields the same client IP in lockout tests (no test change expected).
- multer 2.4.0 -> 2.5.0: no usage; verify only that app boots (E8) and swagger e2e passes (platform-express loads multer eagerly via `require`).
- zod 4.6.4 -> 4.6.7 (patch): only `env.validation.ts` and `shared/src/auth/schemas.ts`; E3/E4/E9 env and DTO paths; `packages/shared` must be rebuilt (E2).
- js-yaml 5.3 -> 5.5: used by swagger setup; swagger.e2e-spec must pass.
- Rollback: `git revert <commit>` (restores package.json x3 + lockfile atomically); or `git checkout HEAD -- package.json apps/api/package.json packages/shared/package.json pnpm-lock.yaml && corepack pnpm install --frozen-lockfile`. Single-commit change, no migrations, no data impact. If only one override misbehaves, drop just that override key and re-run `corepack pnpm install` + E1-E9.

## 8. Assumptions
- Overrides in root package.json `pnpm.overrides` (pnpm 9.15 pinned by `packageManager`).
- `pnpm update --depth Infinity <names>` will move in-range transitives; if registry state differs at run time, fall back to targeted overrides, reported.
- Registry data as of 2026-10-25; implementer re-checks `corepack pnpm audit` first and adapts floors if newer patches exist.
- Orchestrator runs `python3 tools/task.py start 47 --spec docs/agentic/build-specs/2026-10-25-dependency-security-upgrade.md` before Batch 1.
