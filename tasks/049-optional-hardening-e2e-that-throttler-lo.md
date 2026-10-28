---
id: 49
title: "Optional hardening: e2e that throttler + lockout key on the forwarded client IP behind trust proxy 1 (X-Forwarded-For), catches express/proxy-addr regressions (from #47 Stage D)"
goal: "Financial traceability"
source: "Auto 2026-10-25"
priority: 3
status: "DONE"
trace: "E-07/F-27"
sprint: "—"
deps: []
build_spec: "docs/agentic/build-specs/2026-10-25-xff-throttler-e2e.md"
started: "2026-10-25"
completed: "2026-10-25"
agents: ""
---
# #49 Optional hardening: e2e that throttler + lockout key on the forwarded client IP behind trust proxy 1 (X-Forwarded-For), catches express/proxy-addr regressions (from #47 Stage D)

## Description / AC
Goal: Financial traceability. AC: (1) login throttle is keyed per forwarded client IP behind trust proxy 1 (A exhausted, B unaffected; same XFF shared; successful logins count; no XFF falls back to the socket peer); (2) multi-hop XFF keys on the rightmost trusted hop; (3) negative control with trust proxy off; (4) lockout is per account across rotating IPs and locked/wrong-password 401 are indistinguishable; (5) main.ts parity guard; (6) every test self-contained (-t / --randomize safe); mutation-proven (DEC-111).

## Build spec
- docs/agentic/build-specs/2026-10-25-xff-throttler-e2e.md

## Changelog
- 2026-10-25 [new] created
- 2026-10-25 [start] focus -> #49, status IN_PROGRESS (spec docs/agentic/build-specs/2026-10-25-xff-throttler-e2e.md)
- 2026-10-25 DEC-111 logged; start focus=49; single build batch next
- 2026-10-25 Build done: auth-throttle.e2e-spec.ts 11 tests, full e2e 108/108, 4 mutation proofs; DEC-111 addendum; next Stage B
- 2026-10-25 Stage B PASS (1 MINOR), Stage C PASS (5x flake runs, 6 mutations, live probe 401x5->429); DEC-111 addendum 2; next Stage D
- 2026-10-25 Stage D: 0 BLOCKER/1 MAJOR (T4.3 order coupling, reproduced under --randomize) -> re-BUILD; DEC-111 addendum 3; backlog tasks filed (lockout DoS ADR+owner decision, configureApp)
- 2026-10-25 Stage D MAJOR fixed (self-contained T4.3, regex from constant); randomize x6 + -t x11 green; DEC-111 addendum 4; next Stage E
- 2026-10-25 [done] gatekeeper PASS

## Completion notes
Full chain PASS 2026-10-25: reviewer PASS (1 MINOR), tester PASS (5x flake runs, 6 mutations, live probe 401x5->429), code-reviewer 0 BLOCKER/1 MAJOR fixed (T4.3 order coupling, regex from constant; DEC-111 add. 3/4), gatekeeper PASS. New file apps/api/test/auth-throttle.e2e-spec.ts (11 tests, 6 describes, all [F-27]); e2e 7 suites/108, unit 60. Account-DoS by per-account lockout is by design: owner decision filed as #52; configureApp extraction #53.
