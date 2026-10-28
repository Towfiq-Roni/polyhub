# Build spec: typecheck apps/api/test/** (task #58)

Date: 2026-10-28 · Planner: hub-planner · Follow-up of #57 (DEC-119 + addenda 1-4, spec 2026-10-28-typecheck-seed.md)
Sources read: CLAUDE.md (minimal-code, delegation <=3 files), Workflow.md, DEC-119, #57 spec, tasks/058, hub-tester.md IMAGE-BUILD trigger list.

## 1. Objective
`pnpm typecheck` (apps/api) also typechecks every `.ts` under `apps/api/test/**`, so a type error in an e2e file or `test/support/*.ts` fails the gate. Afterwards: typecheck rc=0, no test behaviour change (e2e 10 suites/129, unit 82), tsconfig.json / nest build output / Dockerfile / jest config untouched.

## 2. Re-measurement (scratchpad, repo untouched; 2026-10-28)
Scratch tsconfig extended `tsconfig.typecheck.json` with include `[src, prisma/*.ts, test]`. Result: exactly 13 errors, all TS2352 "Conversion of type 'string' to type 'string[]'", nothing else. No errors from test/support/*.ts, test/jest-e2e.json (json is not matched by a dir include), jest globals or supertest types (`types: ["node","jest"]` inherited from tsconfig.json; `@types/jest`, `@types/supertest` present in apps/api/node_modules/@types). `rootDir "."` already covers test/. No new compilerOptions needed.
Sites (all `X.headers['set-cookie'] as string[] | undefined`):
- auth-lockout.e2e-spec.ts:135 (1)
- auth.e2e-spec.ts:149,236,249,283,288,301,302 (7; the "8" in the task text is 7 here + the lockout one... measured total is 13 = 1 + 7 + 5; auth.e2e measured 7, not 8)
- users.e2e-spec.ts:397,485,725,756,777 (5)
Re-run the count first in Batch 1; if it differs, fix the actual list (grep `as string\[\]` test/*.ts).

What the cast is for: superagent types `res.headers` as `{[k:string]:string}`, but Node/express emit `set-cookie` as `string[]` at runtime. The cast corrects a known-wrong library type. A direct `as string[]` is rejected because string -> string[] has no overlap. So the cast is legitimate, not hiding a bug.

## 3. Decision: simplest correct fix
Options: (A) `as unknown as string[] | undefined` at each of 13 sites; (B) helper `setCookies(res)` in test/support/http.ts (one double-cast + 13 call-site rewrites + import in 3 files = 5 files, 3 batches-ish). A is the task-suggested fix, same 13-line diff, no new API, fits 4 files / 2 batches. DEFAULT = A. Do NOT use `as any`, `// @ts-expect-error`, or loosen tsconfig (`strict`, `skipLibCheck` untouched). Helper (B) is a reasonable later refactor; not in scope.

## 4. Steps
Batch 1 (2 files, test-only edits first so typecheck stays green at every commit point):
1. `apps/api/test/auth.e2e-spec.ts` lines 149,236,249,283,288,301,302: replace `as string[] | undefined` with `as unknown as string[] | undefined`. Nothing else. Prettier may re-wrap long lines: run `pnpm format` equivalent (`prettier --write` on touched files only) and check diff is only these lines + wrapping.
2. `apps/api/test/users.e2e-spec.ts` lines 397,485,725,756,777: same replacement.
Batch 2 (2 files):
3. `apps/api/test/auth-lockout.e2e-spec.ts` line 135: same replacement.
4. `apps/api/tsconfig.typecheck.json`: `"include": ["src", "prisma/*.ts", "test"]` (dir form; matches repo's existing `src` style, picks up `.ts`, includes `test/support/*.ts`; do not use `test/**/*.ts` - equivalent but noisier). Leave `extends`, `noEmit`, `rootDir` as is. Do not touch tsconfig.json (its `include: ["src"]` + `rootDir: "src"` governs nest build -> dist layout unchanged).
Trust boundary / money / a11y: none touched (test-only + tooling config). Auth cookie assertions are test code; semantics identical (cast is erased at compile).
Regression surface: ts-jest (reads tsconfig.json, not the typecheck one; unchanged), `nest build` (tsconfig.build/tsconfig.json include src only), eslint on test files (cast shape change only), prettier line width, root `pnpm -r typecheck`, Dockerfile COPY of tsconfig files (typecheck config is not used in the image build).

## 5. DoD gates
Static (hub-reviewer):
- S1 `git diff --stat` lists exactly: auth.e2e-spec.ts, users.e2e-spec.ts, auth-lockout.e2e-spec.ts, tsconfig.typecheck.json (+ docs/tasks). No tsconfig.json, jest-e2e.json, Dockerfile, package.json change.
- S2 `grep -n "as string\[\]" apps/api/test/*.ts | grep -v "as unknown as"` prints nothing; `grep -c "as unknown as string\[\]" ` totals 13 across the 3 files.
- S3 `grep -rnE "as any|@ts-ignore|@ts-expect-error" apps/api/test | wc -l` is not greater than before (record baseline in Batch 1).
- S4 `cat apps/api/tsconfig.typecheck.json` include equals `["src","prisma/*.ts","test"]`; `git diff apps/api/tsconfig.json` empty.
- S5 `pnpm lint --max-warnings 0` rc=0; `pnpm format:check` rc=0.
- S6 Diff of test files contains only cast changes (+ prettier wrapping of those same lines); no assertion changed.
Empirical (hub-tester; use corepack pnpm shim; run from repo root):
- E1 `pnpm typecheck` rc=0, 0 errors; `cd apps/api && pnpm exec tsc --noEmit -p tsconfig.typecheck.json --listFilesOnly | grep -c "apps/api/test/"` >= 10 and includes `test/support/http.ts`, `test/support/http.e2e-spec.ts`.
- E2 Unit: `pnpm test` -> 10 suites... record exactly 82 tests passing (unchanged).
- E3 WHOLE e2e (never `-- users`): `pnpm --filter api test:e2e` -> 10 suites / 129 tests pass (hub-tester resets dev DB state per #57 practice; restore after).
- E4 Mutation proof, scratch copy only (git worktree or copy of apps/api in scratchpad; never mutate the repo): (M1) in a test file call `startApp(123)` or `http(app).get(5)` -> typecheck rc!=0 with TS2345; (M2) add `const n: number = 'x'` or wrong property on a typed object (`user.nme` on a Prisma row) -> rc!=0 TS2339/TS2322; (M3) revert tsconfig include to `["src","prisma/*.ts"]` with M1 present -> rc=0 (proves the include is what catches it). Each reported with rc and first error line.
- E5 Honest limitation (state in Completion notes): supertest `res.body` is `any`, so `res.body.foo` typos, wrong status or wrong body shape are NOT caught; only argument types, typed helper/Prisma/shared-schema usage, imports and dead identifiers in tests are. The `as unknown as string[]` double-cast is unchecked by design (superagent headers typing gap).
- E6 IMAGE-BUILD: triggered (`apps/api/tsconfig.typecheck.json` matches `^apps/api/tsconfig(\..*)?\.json$` in the hub-tester.md list). Run: `python3 tools/check-dockerfile-stages.py` rc=0 (static, cheap even though Dockerfile untouched); pre-clean `docker rm -f hub-api-gate-58`; from repo root `docker build -f apps/api/Dockerfile -t hub-api-gate:58 .` NO `--target` (timeout 600000/background); boot checks per hub-tester.md (health, login, users, dist layout `dist/main.js` present not `dist/src/`); cleanup container+image. Expected: no behaviour change.
Gatekeeper criteria (zero-context):
- G1 AC satisfied: test/** typechecked (E1, S4) and all 13 TS2352 resolved without suppressions (S2, S3).
- G2 Constraints: tsconfig.json, nest build output, Dockerfile, jest config unchanged (S1, S4, E6).
- G3 No behaviour change: unit 82, e2e 10/129 (E2, E3).
- G4 Gate has teeth: mutation proof (E4) with honest limitation (E5) recorded in task Completion notes + DEC addendum.
- G5 CLAUDE.md minimal-diff discipline: every changed line traces to the 13 casts or the one include line.
Counts: static 6 · empirical 6 · gatekeeper 5.

## 6. Suggested task-file AC text
1. `apps/api/tsconfig.typecheck.json` include = `["src","prisma/*.ts","test"]`; `pnpm typecheck` rc=0 and lists `apps/api/test/**` files.
2. The 13 TS2352 `headers['set-cookie'] as string[]` casts become `as unknown as string[] | undefined` (superagent types headers as string; runtime is string[]); no `any`/`@ts-*` suppressions added.
3. tsconfig.json, nest build output, Dockerfile, jest config unchanged; lint --max-warnings 0, format:check, unit 82, whole e2e 10/129, IMAGE-BUILD pass.
4. Mutation proof in scratch copy: wrong-typed helper call / wrong property in a test file fails `pnpm typecheck`; reverting the include makes it pass. Limitation documented: `res.body` is `any`, untyped.

## 7. Open questions (recommended defaults)
- Q1 Plain `as unknown as` x13 vs `setCookies(res)` helper in support/http.ts? Default: plain cast (4 files, matches task). Helper = future cleanup.
- Q2 Task text says auth.e2e has 8 errors; measured 7 (total still 13 because lockout 1 + users 5 + auth 7). Default: trust re-measure; update task title/AC wording to "auth.e2e 7".
Note: planner's scratch measurement used a scratchpad tsconfig; the require-task hook blocks writes under apps/ until task start, so the mutation proof (E4) was specified, not executed.
