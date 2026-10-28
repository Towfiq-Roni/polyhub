---
id: 57
title: "Typecheck apps/api/prisma/seed.ts (outside tsconfig include [src]) so stale schema refs fail pnpm typecheck, not only at seed runtime; found in #54 Stage C"
goal: "Reduced tool sprawl"
source: "#54 Stage C"
priority: 3
status: "DONE"
trace: "E-07/F-27"
sprint: "—"
deps: []
build_spec: "docs/agentic/build-specs/2026-10-28-typecheck-seed.md"
started: "2026-10-28"
completed: "2026-10-28"
agents: ""
---
# #57 Typecheck apps/api/prisma/seed.ts (outside tsconfig include [src]) so stale schema refs fail pnpm typecheck, not only at seed runtime; found in #54 Stage C

## Description / AC
**AC1** `pnpm typecheck` (root and `--filter @hub/api`) typechecks `apps/api/src`, `apps/api/prisma/seed.ts` and `apps/api/prisma/seed.e2e-spec.ts` via a new `apps/api/tsconfig.typecheck.json` (extends `tsconfig.json`, `noEmit`, `rootDir "."`, include `src` + `prisma/*.ts`).
**AC2** A stale schema key that is the SOLE key of a Prisma `where` (or a wrong model/method name) in seed.ts or seed.e2e-spec.ts makes `pnpm typecheck` exit non-zero (mutation-proved, reverted). A stale key mixed with a valid key in a `where` (incl. upsert/updateMany) is NOT caught.
**AC3** The `tx.user.create` data in seed.ts is wrapped with `satisfies Prisma.UserCreateInput` so a stale scalar key in seed user creation also fails typecheck (mutation-proved); limits documented: plain `create.data`, `select` and mixed-key `where` unknown keys are not caught by tsc alone; `satisfies` covers only `tx.user.create` (`role.upsert`, `userRole.create` unprotected).
**AC4** `tsconfig.json`, `nest build` output (`dist/main.js`), Dockerfile, jest configs and eslint config unchanged; IMAGE-BUILD gate passes; lint `--max-warnings 0`, `format:check`, typecheck clean; unit 82; whole e2e 10 suites / 129 tests green.
**AC5** Follow-up task filed for `apps/api/test/**` typecheck (13 pre-existing TS2352 errors, 3 files).

## Build spec
- docs/agentic/build-specs/2026-10-28-typecheck-seed.md

## Changelog
- 2026-10-28 [new] created
- 2026-10-28 [start] focus -> #57, status IN_PROGRESS (spec docs/agentic/build-specs/2026-10-28-typecheck-seed.md)
- 2026-10-28 Plan done (hub-planner), DEC-119 logged, follow-up #58 filed (test/** typecheck). Build next (1 batch, 3 files).
- 2026-10-28 Build done (hub-implementer): tsconfig.typecheck.json + typecheck script + seed satisfies; gates green, unit 82, e2e 129, dist unchanged. Spec corrected (sole-key where only; mixed-key/create.data/select not caught) - spec §8, DEC-119 add.1. Stage B next.
- 2026-10-28 Stage B PASS (hub-reviewer): config/script/seed match spec, untouched files verified, seed runs on scratch DB, mutations M1-M3 caught, N1/N2 not caught (documented). Nit: sole-key where error is TS2353 not TS2561 (cosmetic). Stage C next (IMAGE-BUILD required).
- 2026-10-28 Stage C PASS (hub-tester, redone after restart): typecheck covers seed files, e2e 129 x3, dist identical, seed twice OK, M1-M3 caught, N1/N2 not (documented), IMAGE-BUILD pass. Tester also deleted all dev sessions (scope overshoot, noted in DEC-119 add.2). Stage D next.
- 2026-10-28 Stage D PASS (0 blockers, 3 doc suggestions): AC2/AC3 amended to honest limits, DEC-119 add.3 corrects 'only way' wording, seed.ts #46 hunks to attribute at commit. Stage E next.
- 2026-10-28 [done] gatekeeper PASS

## Completion notes
Stage E PASS (hub-gatekeeper): typecheck covers prisma seed files (tsconfig.typecheck.json), lint/format clean, unit 82, e2e 10/129, sole-key where mutation rc=2, IMAGE-BUILD pass. LIMITS: NOT caught by tsc: mixed-key where (incl. upsert/updateMany), plain create.data unknown keys, select unknown keys; caught: sole-key where, wrong model/method, keys in a satisfies literal; satisfies covers only tx.user.create (role.upsert, userRole.create unprotected); test/** excluded until #58 (13 TS2352). Runtime seed + e2e remain the backstop: scope gain, not full schema-drift protection.
