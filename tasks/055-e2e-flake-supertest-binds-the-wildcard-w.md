---
id: 55
title: "E2E flake: supertest binds the wildcard :: with listen(0) while IntelliJ's built-in web server holds 127.0.0.1:63343, so ~1 in 20000 requests hits IDEA's 404 instead of the app (found by #52 Stage C: auth-lockout L8 'expected 201, received 404'); fix: app.listen(0,'127.0.0.1') once and point supertest at that URL in ALL e2e harnesses (auth, users, auth-throttle, auth-lockout, health, swagger), or a shared test helper"
goal: "Reduced tool sprawl"
source: "Auto 2026-10-26"
priority: 3
status: "DONE"
trace: ""
sprint: "—"
deps: []
build_spec: "docs/agentic/build-specs/2026-10-26-e2e-localhost-bind.md"
started: "2026-10-26"
completed: "2026-10-26"
agents: ""
---
# #55 E2E flake: supertest binds the wildcard :: with listen(0) while IntelliJ's built-in web server holds 127.0.0.1:63343, so ~1 in 20000 requests hits IDEA's 404 instead of the app (found by #52 Stage C: auth-lockout L8 'expected 201, received 404'); fix: app.listen(0,'127.0.0.1') once and point supertest at that URL in ALL e2e harnesses (auth, users, auth-throttle, auth-lockout, health, swagger), or a shared test helper

## Description / AC
Goal: Reduced tool sprawl. ACs: see build spec docs/agentic/build-specs/2026-10-26-e2e-localhost-bind.md §4 gates and DEC-116 (+ addenda 1-5) in docs/memory/DECISIONS.md.

## Build spec
- docs/agentic/build-specs/2026-10-26-e2e-localhost-bind.md

## Changelog
- 2026-10-26 [new] created
- 2026-10-26 [start] focus -> #55, status IN_PROGRESS (spec docs/agentic/build-specs/2026-10-26-e2e-localhost-bind.md)
- 2026-10-26 Batch 1 built (http helper + helper spec; e2e 10 suites/125); H2 cannot detect old pattern (honest finding); plan adjusted for auth-lockout-race; DEC-116 addendum; next Batch 2
- 2026-10-26 Batch 2 built (auth/users/health via helper; users alias httpApp); e2e 10/125 x2; grep gate empty; DEC-116 addendum 2; next Batch 3
- 2026-10-26 Batch 3 built (throttle/lockout/race via helper; e2e 10/125 x3; grep: supertest only in support/http.ts); listen-order is convention only; DEC-116 addendum 3; next Batch 4 lint rule + pitfall
- 2026-10-26 Batch 4 built (ESLint no-restricted-syntax for supertest + pitfall + INDEX); lint 0 warnings; DEC-116 addendum 4; next Stage B
- 2026-10-26 Stage C PASS (hub-tester): 15/15 full e2e 10 suites/125, helper 3/3 x10 + randomized, decoy repro + 180k new-path requests 0 foreign, mutations M1/M3 caught, M2 not (H2 honest limit). See DEC-116 addendum 5.
- 2026-10-26 Stage D PASS (hub-code-reviewer): 2 SUGGESTIONs - H2 title overclaim (re-build delegated to hub-implementer), task AC placeholder (filled with spec/DEC pointer).
- 2026-10-26 [done] gatekeeper PASS

## Completion notes
Stage E PASS (hub-gatekeeper): lint/format/typecheck clean, unit 74, e2e 10 suites/125, greps clean; B/C/D passed earlier, H2 nit fixed
