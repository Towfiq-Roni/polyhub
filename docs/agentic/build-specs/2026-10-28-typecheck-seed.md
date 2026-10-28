# Build spec: #57 typecheck prisma/seed*.ts under `pnpm typecheck`

Task: `tasks/057-*.md` · Date: 2026-10-28 · Planner: hub-planner
Sources read: `apps/api/tsconfig.json`, `tsconfig.base.json`, `apps/api/package.json`, `eslint.config.mjs` (L6 comment: non-type-aware on purpose, no `parserOptions.project`), `apps/api/test/jest-e2e.json`, `apps/api/Dockerfile` (build stage `COPY . .` then `nest build`), `.claude/agents/hub-tester.md` L29-30 (IMAGE-BUILD trigger list), `apps/api/prisma/seed.ts`.
Not finance-touching (no ledger path) -> `accountant-expert` not needed.

## 1. Objective

`pnpm typecheck` for `@hub/api` also typechecks `apps/api/prisma/seed.ts` and `seed.e2e-spec.ts`, so a stale Prisma schema reference there fails typecheck instead of failing only at seed runtime (#54 Stage C). The build tsconfig, `nest build` output (`dist/main.js`), the Docker image, jest and eslint config stay byte-identical.

## 2. Measurements (scratchpad, repo untouched, tsc via `corepack pnpm exec tsc -p <scratch json>`)

Config tested = extend `apps/api/tsconfig.json`, `noEmit`, `rootDir` = apps/api root, include variants:

| Variant | include | New errors |
|---|---|---|
| B (recommended) | `src`, `prisma/*.ts` | **0** (clean) |
| A | `src`, `prisma/*.ts`, `test` | **13**, all TS2352 `Conversion of type 'string' to type 'string[]'` (a `body.message as string[]` style cast): `auth-lockout.e2e-spec.ts` x1 (L135), `auth.e2e-spec.ts` x8 (L149,236,249,283,288,301,302... ), `users.e2e-spec.ts` x5 (L397,485,725,756,777). `test/support/*`, `auth-lockout-race`, `auth-throttle`, `db-indexes`, `health`, `swagger` clean. |

Decision: ship variant B. Variant A needs 13 edits (`as unknown as string[]`) across 3 big e2e files = churn + risk to a 129-test suite -> follow-up task (see Open Q2).

### Mutation-proof probe (scratch file `.../scratchpad/mut/m.ts`, @prisma/client mapped via `paths`) — which stale constructs does tsc catch?

| Construct (stale key `failedLoginAttempts`) | Caught? |
|---|---|
| `where: { failedLoginAttempts: 0 }` (findFirst) | YES TS2561 |
| `data: {...}` literal in `prisma.user.create({ data })` | **NO** (Prisma XOR hole, same as #54) |
| `select: { failedLoginAttempts: true }` (findFirst) | **NO** (generic arg inference hole) |
| `{...} satisfies Prisma.UserCreateInput` | YES TS2561 |

Honest limit: plain typecheck of seed.ts catches stale `where` keys, removed model/relation names, wrong method names, wrong types, but NOT unknown keys in `create.data` or `select`. The `satisfies` wrapper closes the create-data hole (Batch 1, tiny, optional-by-default-yes).

## 3. Batches

### Batch 1 (3 files max; 3 used) — one hub-implementer delegation

1. **NEW `apps/api/tsconfig.typecheck.json`** (exact content, nothing else):
   ```json
   {
     "extends": "./tsconfig.json",
     "compilerOptions": { "noEmit": true, "rootDir": "." },
     "include": ["src", "prisma/*.ts"]
   }
   ```
   Why: `rootDir: "src"` in the parent would raise TS6059 for prisma/*.ts; override to `.`. `prisma/*.ts` (not `prisma`) avoids picking up anything in `migrations/` (SQL only today, but glob is explicit). `noEmit` makes accidental emit impossible. Do NOT edit `tsconfig.json`: `nest build`, ts-node (`prisma.seed`), ts-jest (unit + e2e), eslint all resolve it. Parent `types: ["node","jest"]` carries over so `describe`/`it` in seed.e2e-spec.ts type-resolve.
2. **EDIT `apps/api/package.json`**: only the `typecheck` script -> `"typecheck": "tsc -p tsconfig.typecheck.json"` (or keep `--noEmit`; either; keep `--noEmit` to be surgical: `tsc --noEmit -p tsconfig.typecheck.json`). Touch no other line (deps, `prisma.seed`, `jest` block untouched).
3. **EDIT `apps/api/prisma/seed.ts`** (default-yes, see Open Q1): in `seedSuperAdmin` `tx.user.create`, change `data: { email, passwordHash, name: 'Super Admin' },` to `data: { email, passwordHash, name: 'Super Admin' } satisfies Prisma.UserCreateInput,` and extend the import to `import { Prisma, PrismaClient } from '@prisma/client';`. If `UserCreateInput` rejects the scalar form (it requires nested relation syntax only for relations; User has none required so should pass) the implementer must fall back to `Prisma.UserUncheckedCreateInput` and tell the orchestrator. Do the same for `tx.userRole.create` data only if tsc accepts it as `Prisma.UserRoleUncheckedCreateInput` — otherwise leave it. Behavior unchanged (type-level only). Don't touch anything else in the file (surgical).

Trust boundary / money / a11y: none (tooling + type annotation). Seed creates the SUPER_ADMIN bootstrap user (rule 9) but runtime behavior is unchanged; seed.e2e-spec.ts must stay green as proof.

Regression surface: `pnpm -r typecheck` (root), `nest build` (uses tsconfig.json, unchanged), Docker build stage runs `nest build` only (typecheck script not run in Dockerfile; confirm by grep), ts-node seed run (tsconfig.json unchanged), jest unit (`rootDir: src`) and jest-e2e (`rootDir: ..`), eslint (`eslint .` non-type-aware; the new JSON is not linted), prettier `format:check` covers the new JSON (format it prettier-style: if `prettier --check` complains, run prettier on that file only).

## 4. DoD gates

### Static (hub-reviewer)
- S1 `git diff --name-only` for the task is exactly: `apps/api/tsconfig.typecheck.json` (new), `apps/api/package.json`, `apps/api/prisma/seed.ts` (+ task/spec/RUNLOG/memory docs). Anything else = FAIL.
- S2 `git diff apps/api/package.json` shows exactly one changed line, the `typecheck` script, value contains `tsconfig.typecheck.json`.
- S3 `git diff --quiet apps/api/tsconfig.json tsconfig.base.json apps/api/Dockerfile eslint.config.mjs apps/api/test/jest-e2e.json` unchanged (exit 0 relative to pre-task state; these files may carry earlier uncommitted changes, so compare against the pre-task snapshot, orchestrator records `git diff` hash before Batch 1).
- S4 `grep -n 'tsconfig.typecheck' apps/api/package.json apps/api/Dockerfile nest-cli.json 2>/dev/null` -> only package.json (build path does not reference the new file).
- S5 new JSON has `"include": ["src", "prisma/*.ts"]`, `"rootDir": "."`, `"noEmit": true`, `"extends": "./tsconfig.json"`; no `test`, no `outDir` override, no `paths`.
- S6 `grep -n "satisfies Prisma\." apps/api/prisma/seed.ts` >= 1 and `grep -nE "failedLoginAttempts" apps/api/prisma/seed.ts` -> none.
- S7 `corepack pnpm lint` = `eslint . --max-warnings 0` exit 0; `corepack pnpm format:check` exit 0.
- S8 `corepack pnpm typecheck` (root) exit 0.

### Empirical (hub-tester; use `corepack pnpm`, shim on PATH)
- E1 Baseline green: `corepack pnpm typecheck` exit 0, and output shows `tsc --noEmit -p tsconfig.typecheck.json` ran for @hub/api.
- E2 File-set proof: `cd apps/api && corepack pnpm exec tsc -p tsconfig.typecheck.json --listFilesOnly | grep -E "apps/api/prisma/seed(\.e2e-spec)?\.ts$"` prints both files (falsifies "seed never typechecked").
- E3 Mutation M1 (stale `where`, tsc must catch): in a scratch COPY of the repo or via temporary edit that is reverted and `git diff` re-verified clean, change seed.ts `existing` query `where: { status: 'ACTIVE', ...}` to add `failedLoginAttempts: 0`; `corepack pnpm typecheck` MUST exit non-zero with TS2561 naming `seed.ts`; revert -> exit 0. Also M1 against the OLD script (`tsc --noEmit -p tsconfig.json`) exits 0 (proves it was the blind spot).
- E4 Mutation M2 (create-data, caught only via `satisfies`): add `failedLoginAttempts: 0` to the `tx.user.create` data literal; `pnpm typecheck` MUST fail TS2561 (if Batch 1 item 3 was applied). Without `satisfies` this passes tsc (documented limit). Revert and confirm green.
- E5 Mutation M3 (removed field in typed object / wrong model): rename `prisma.role.upsert` to `prisma.roles.upsert` in seed.e2e-spec.ts or seed.ts -> typecheck fails; revert.
- E6 Unit suite: `corepack pnpm --filter @hub/api test` -> 82 passed (unchanged count).
- E7 Whole e2e, never filtered (no `-- users`): `corepack pnpm --filter @hub/api test:e2e` -> **10 suites, 129 tests passed** (includes `prisma/seed.e2e-spec.ts` if currently in the jest-e2e glob; count must be unchanged). Dev DB: after run `users` = admin only, `login_attempts` = 0 (per #56 hygiene).
- E8 Seed runtime unaffected: `corepack pnpm --filter @hub/api exec prisma db seed` (dev DB, env vars set) exits 0 / logs "already exists, skipping".
- **IMAGE-BUILD (REQUIRED, triggered)**: changed paths `apps/api/tsconfig.typecheck.json` and `apps/api/package.json` match `^apps/api/tsconfig(\..*)?\.json$` and `^apps/api/package\.json$`, also `apps/api/prisma/seed.ts` (`^apps/api/prisma/(...|seed\.ts$)`) in `.claude/agents/hub-tester.md` L30. hub-tester runs the gate exactly as defined there: unmodified `docker build -f apps/api/Dockerfile -t hub-api:test .` (NO `--target`), then boot + health/login/users checks per the tester's IMAGE-BUILD steps, assert `dist/main.js` exists in the image and CMD default stage is runtime, then cleanup (container, network, image/tmp files). Report line format as in hub-tester.md L44. `python3 tools/check-dockerfile-stages.py` is NOT required (Dockerfile untouched).

### Gatekeeper criteria (standalone audit)
- G1 AC below satisfied; evidence = E1-E5.
- G2 CLAUDE.md "Minimal Code Discipline" (surgical, one new 5-line config, one script line, one type annotation); no new deps (RAM/footprint rule).
- G3 CLAUDE.md DoD commands: `pnpm lint && pnpm typecheck && pnpm test` clean, plus e2e whole-suite (10/129) and `format:check`.
- G4 Build/runtime layout non-regression: `dist/main.js` = Docker CMD; Dockerfile and `tsconfig.json` unchanged; IMAGE-BUILD passed.
- G5 Honest limits recorded in task Completion notes: create-data/select unknown keys not caught by plain tsc (XOR/generic hole); test/ dir excluded with 13 pre-existing TS2352 listed as follow-up.
- G6 Memory: task Changelog stages logged; DECISIONS.md entry only if Open Q1/Q2 answered non-default; pitfall note optional (update the #54 Stage C pitfall pointer if one exists).

## 5. Suggested AC text for `tasks/057-*.md`

> **AC1** `pnpm typecheck` (root and `--filter @hub/api`) typechecks `apps/api/src`, `apps/api/prisma/seed.ts` and `apps/api/prisma/seed.e2e-spec.ts` via a new `apps/api/tsconfig.typecheck.json` (extends `tsconfig.json`, `noEmit`, `rootDir "."`, include `src` + `prisma/*.ts`).
> **AC2** A stale schema key in a Prisma `where` (or a wrong model/method name) in seed.ts or seed.e2e-spec.ts makes `pnpm typecheck` exit non-zero (mutation-proved, reverted).
> **AC3** The `tx.user.create` data in seed.ts is wrapped with `satisfies Prisma.UserCreateInput` so a stale scalar key in seed user creation also fails typecheck (mutation-proved); limit documented: plain `create.data`/`select` unknown keys are not caught by tsc alone.
> **AC4** `tsconfig.json`, `nest build` output (`dist/main.js`), Dockerfile, jest configs and eslint config unchanged; IMAGE-BUILD gate passes; lint `--max-warnings 0`, `format:check`, typecheck clean; unit 82; whole e2e 10 suites / 129 tests green.
> **AC5** Follow-up task filed for `apps/api/test/**` typecheck (13 pre-existing TS2352 errors, 3 files).

## 6. Open questions (recommended defaults, do not block)

1. Add `satisfies Prisma.UserCreateInput` to seed user.create? Default: YES (tiny, only way tsc catches the exact #54 bug). If declined: drop Batch item 3 and E4, AC3.
2. Include `apps/api/test/**` now? Default: NO (13 pre-existing TS2352 casts `as string[]` in auth.e2e-spec x8, users.e2e-spec x5, auth-lockout.e2e-spec x1; fix = `as unknown as string[]`, scope creep into the 129-test suite). File follow-up task; one-line change to the include when done.
3. Keep `--noEmit` flag in script given config already sets it? Default: keep flag (surgical, mirrors old script).
4. ts-node/prisma seed uses `tsconfig.json` (rootDir src, include src) — unchanged, works today since ts-node ignores `include`. Default: leave.

## 8. CORRECTION (2026-10-28, from Batch 1 build; supersedes §2 line 26 and E3 wording)
A stale key in a Prisma `where` is caught by tsc ONLY when it is the SOLE key in that `where` (e.g. `where: { failedLoginAttempts: 0 }` → TS2561). A stale key mixed with a valid key (`{ status: 'ACTIVE', failedLoginAttempts: 0 }`, `{ email, failedLoginAttempts }`, updateMany/upsert `where`) is NOT caught. E3/M1 must therefore use the sole-key form. Also NOT caught: unknown keys in plain `create({data})` and in `select`. Caught: wrong model name (TS2551), stale key in a `satisfies Prisma.UserCreateInput` literal (TS2561). Task Completion notes (G5) must list all of these limits.
Cosmetic: a sole-key stale `where` surfaces as TS2353 (`does not exist in type ...WhereUniqueInput`) or TS2561 depending on the model/method; either is a pass for the mutation gate.
