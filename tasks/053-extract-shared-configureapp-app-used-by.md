---
id: 53
title: "Extract shared configureApp(app) used by main.ts and the e2e harnesses (auth, users, auth-throttle hand-copy trust proxy / pipes / filters); removes the main.ts text-parity guard; touches main.ts so IMAGE-BUILD gate applies (from #49 Stage D)"
goal: "Reduced tool sprawl"
source: "Auto 2026-10-25"
priority: 3
status: "DONE"
trace: "E-07/F-27"
sprint: "—"
deps: []
build_spec: "docs/agentic/build-specs/2026-10-26-configure-app.md"
started: "2026-10-26"
completed: "2026-10-26"
agents: ""
---
# #53 Extract shared configureApp(app) used by main.ts and the e2e harnesses (auth, users, auth-throttle hand-copy trust proxy / pipes / filters); removes the main.ts text-parity guard; touches main.ts so IMAGE-BUILD gate applies (from #49 Stage D)

## Description / AC
Goal: Reduced tool sprawl. AC: (1) one `configureApp(app)` (trust proxy 1, cookie-parser, ValidationPipe, TransformInterceptor, HttpExceptionFilter, global prefix) used by main.ts and the e2e harnesses (auth, users, auth-throttle); (2) the main.ts text-parity guard (auth-throttle D6) becomes unnecessary and is removed or replaced; (3) behaviour unchanged (e2e 108+ green); (4) touches main.ts => IMAGE-BUILD gate required (hub-tester). Context: DEC-111 addendum 3.

## Build spec
- docs/agentic/build-specs/2026-10-26-configure-app.md

## Changelog
- 2026-10-25 [new] created
- 2026-10-26 [start] focus -> #53, status IN_PROGRESS (spec docs/agentic/build-specs/2026-10-26-configure-app.md)
- 2026-10-26 Batch 1 built (app.setup.ts + main.ts; OpenAPI hash identical, throttle/cookie probes equal); D6 fails as predicted, deleted in Batch 2; DEC-114 addendum
- 2026-10-26 Batch 2 built (auth/users/auth-throttle adopt configureApp, D6 deleted); e2e 108/108; DEC-114 addendum 2; next Batch 3 health+swagger
- 2026-10-26 Batch 3 built (health/swagger adopt configureApp; e2e 108/108); FAIL FINDING: ValidationPipe whitelist untested -> Batch 4 (options const + unit test); DEC-114 addendum 3
- 2026-10-26 Batch 4 built (VALIDATION_PIPE_OPTIONS + app.setup.spec.ts, 3 tests); unit 63, e2e 108, OpenAPI hash unchanged; DEC-114 addendum 4; next Stage B
- 2026-10-26 Stage B PASS; Stage C PASS (old-vs-new boot identical, 5 mutations, IMAGE-BUILD ok); Docker host crash recovered, DB verified clean; DEC-114 addendum 5; next Stage D
- 2026-10-26 Stage D: 0 BLOCKER/0 MAJOR/6 SUGGESTION; small re-BUILD (drop export, wording, ponytail) + mutation check of useGlobalPipes/Filters/Interceptors removal; DEC-114 addendum 6
- 2026-10-26 Stage D polish applied; useGlobalPipes/Filters/Interceptors removals fail 17/32/63 e2e (claim refuted); DEC-114 addendum 7; next Stage E
- 2026-10-26 [done] gatekeeper PASS

## Completion notes
Full chain PASS 2026-10-26: reviewer 0 violations, tester (old-vs-new boot identical incl. OpenAPI hash/throttle/cookie/CORS/errors, 5 mutations, IMAGE-BUILD incl. dist/app.setup.js), code-reviewer 0 BLOCKER/0 MAJOR (polish applied; removals of useGlobalPipes/Filters/Interceptors fail 17/32/63 e2e — claim refuted; DEC-114 add. 6/7), gatekeeper PASS. e2e 7 suites/108, unit 10 suites/63. Accepted: whitelist/transform guarded only by app.setup.spec.ts (no endpoint reads an unknown prop); CORS/Swagger have no e2e (pre-existing). Host incident: Docker crash recovered, DB verified.
