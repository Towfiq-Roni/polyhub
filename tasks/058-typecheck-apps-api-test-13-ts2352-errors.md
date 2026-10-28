---
id: 58
title: "Typecheck apps/api/test/** (13 TS2352 errors on 'as string[]' casts: auth.e2e 7, users.e2e 5, auth-lockout 1; fix = 'as unknown as string[]') by adding test to tsconfig.typecheck.json include; follow-up of #57"
goal: "Reduced tool sprawl"
source: "#57 plan"
priority: 3
status: "DONE"
trace: "E-07/F-27"
sprint: "—"
deps: []
build_spec: "docs/agentic/build-specs/2026-10-28-typecheck-test-dir.md"
started: "2026-10-28"
completed: "2026-10-28"
agents: ""
---
# #58 Typecheck apps/api/test/** (13 TS2352 errors on 'as string[]' casts: auth.e2e 7, users.e2e 5, auth-lockout 1; fix = 'as unknown as string[]') by adding test to tsconfig.typecheck.json include; follow-up of #57

## Description / AC
Spec: docs/agentic/build-specs/2026-10-28-typecheck-test-dir.md. AC1 `apps/api/tsconfig.typecheck.json` include = ["src","prisma/*.ts","test"]; `pnpm typecheck` rc=0 and lists `apps/api/test/**` files. AC2 The 13 TS2352 `headers['set-cookie'] as string[]` casts (auth.e2e 7, users.e2e 5, auth-lockout.e2e 1 - re-measured; the title's 8 was wrong) become `as unknown as string[] | undefined` (superagent types headers as string; runtime is string[]); no `any`/`@ts-*` added. AC3 tsconfig.json, nest build output, Dockerfile, jest config unchanged; lint --max-warnings 0, format:check, unit 82, whole e2e 10/129, IMAGE-BUILD pass. AC4 Mutation proof in scratch copy: wrong-typed helper call / wrong property in a test file fails `pnpm typecheck`; reverting the include makes it pass. Limitation documented: `res.body` is `any`, untyped.

## Build spec
- docs/agentic/build-specs/2026-10-28-typecheck-test-dir.md

## Changelog
- 2026-10-28 [new] created
- 2026-10-28 [start] focus -> #58, status IN_PROGRESS (spec docs/agentic/build-specs/2026-10-28-typecheck-test-dir.md)
- 2026-10-28 Plan done (hub-planner), DEC-120 logged. Build batch 1 next.
- 2026-10-28 Build batch 1 done: 12 casts (auth.e2e 7, users.e2e 5) -> as unknown as string[] | undefined; prettier --write re-wrapped cast lines only (claimed); gates green, unit 82, e2e 129; scratch tsc shows 1 remaining error (auth-lockout.e2e:135). Batch 2 next.
- 2026-10-28 Build batch 2 done: last cast + include [src,prisma/*.ts,test]; typecheck lists 10 test files; gates green, e2e 129 x2, dist identical (37 files); mutations m1 (startApp(123) rc=2), m2, m3 (revert include -> rc=0), res.body any limit shown. No residue (orchestrator grep). Stage B next.
- 2026-10-28 Stage B PASS (hub-reviewer): prettier re-wrap only at cast sites (scratch proof), no any/@ts-* in test/, untouched configs, mutations re-proved, unit 82, e2e 129. Nit: task title says 8 (is 7). Stage C next (IMAGE-BUILD).
- 2026-10-28 Stage C PASS (hub-tester): typecheck lists 10 test files, e2e 129 x3, dist identical, mutations (wrong call, include revert, cast revert) behave, IMAGE-BUILD pass. See DEC-120 add.1. Stage D next.
- 2026-10-28 Stage D PASS (0 blockers, 2 suggestions): 13 repeated casts acceptable (helper setCookies deferred, optional future); casts do not hide bugs; task title corrected auth.e2e 8->7. Stage E next.
- 2026-10-28 [done] gatekeeper PASS

## Completion notes
Stage E PASS (hub-gatekeeper): typecheck covers apps/api/test/** (10 files), 13 casts as unknown as string[] | undefined (superagent header typing), lint/format clean, unit 82, e2e 10/129, no any/@ts-*, configs unchanged, IMAGE-BUILD pass. MUTATIONS (Stage C): wrong-typed call TS2322 rc=2; include reverted -> rc=0; cast reverted -> TS2352. LIMITS: supertest res.body is any (body-shape typos not caught); no pre-#58 baseline exists for test titles/assertions (earlier uncommitted edits), evidence = whitespace changes only at cast sites.
