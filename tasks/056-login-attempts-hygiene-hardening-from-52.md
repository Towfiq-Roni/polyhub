---
id: 56
title: "login_attempts hygiene + hardening (from #52 Stage D): periodic DELETE of expired rows; IPv6 /64 bucketing of the client-IP key (first 4 hextets via node:net isIPv6, no dep); optionally an argon2 dummy-hash verify for unknown/inactive emails to equalise timing"
goal: "Financial traceability"
source: "Auto 2026-10-26"
priority: 3
status: "DONE"
trace: "E-07/F-27"
sprint: "—"
deps: []
build_spec: "docs/agentic/build-specs/2026-10-28-login-attempts-hardening.md"
started: "2026-10-28"
completed: "2026-10-28"
agents: ""
---
# #56 login_attempts hygiene + hardening (from #52 Stage D): periodic DELETE of expired rows; IPv6 /64 bucketing of the client-IP key (first 4 hextets via node:net isIPv6, no dep); optionally an argon2 dummy-hash verify for unknown/inactive emails to equalise timing

## Description / AC
Goal: Financial traceability (auth hardening, F-27/E-07). Spec: docs/agentic/build-specs/2026-10-28-login-attempts-hardening.md
AC1 [A] Failure-path prune sweeps every user's dead login_attempts rows (stale window AND no live lock); live locks and fresh rows survive; no timer, no new dependency (proof: e2e L18).
AC2 [B] IPv6 client IPs are keyed on their /64 (a:b:c:d::/64); IPv4, ::ffff: mapped, 'unknown' and the 45-char cap behave as before; two addresses in one /64 share a lock, an adjacent /64 does not; no migration (proof: unit rows + e2e L16, L17).
AC3 [C] Unknown and INACTIVE emails run one dummy argon2 verify so median latency is >= 0.5x the wrong-password path; response body/status identical (proof: e2e L19).
AC4 DEC-113/115 semantics unchanged: per-(account, client IP), one generic 401 for locked/wrong/unknown/inactive, no audit regression; unit 80, e2e 10 suites/129, lint/format/typecheck clean, ADR-0004 addenda (both copies) + DEC-118.

## Build spec
- docs/agentic/build-specs/2026-10-28-login-attempts-hardening.md

## Changelog
- 2026-10-26 [new] created
- 2026-10-28 [start] focus -> #56, status IN_PROGRESS (spec docs/agentic/build-specs/2026-10-28-login-attempts-hardening.md)
- 2026-10-28 Plan done (hub-planner); defaults adopted in DEC-118; Build batch 1 next.
- 2026-10-28 Build batch 1 done (hub-implementer): A global prune, B IPv6 /64, C dummy argon2; unit 79, e2e 125 green; one unrequested unit-test edit (prune no longer userId-scoped). Batch 2 (e2e L16-L19) next. Review watch: getDummyHash rejection is cached and sits outside .catch.
- 2026-10-28 Build batch 2 done (hub-implementer): e2e L16-L19 in auth-lockout.e2e-spec.ts; e2e 10/129 x2, unit 79; mutations m1-m5,m7 each caught (mapping inferred from failure counts, not titles). L19 timing-based (ratio only). Scratch users from killed run cleaned; dev DB users=admin only. Batch 3 (ADR addenda) next.
- 2026-10-28 Build batch 3 done: ADR-0004 addenda in docs/adr + planning/adr (planning copy condensed to 4 bullets vs spec's 6; Stage B to judge). Stage B next.
- 2026-10-28 Stage B PASS w/ 1 MINOR + nits (hub-reviewer): MINOR getDummyHash rejected promise memoized and awaited outside .catch -> 500 until restart; nits: '::ffff:7f00:1 not unwrapped' wording inaccurate (prefix stripped, junk key 7f00:1), no unit for rejection path, OR-guard has no unit assert (e2e L18 only). Re-build delegated (batch 4). ADR 4-vs-6 bullets judged not material. normalizeClientIp edge cases all OK.
- 2026-10-28 Build batch 4/4b done: dummy-hash memo reset on rejection (whole path inside catch), wording fixed in code + both ADRs, unit +1 (rejection path, uses one jest.spyOn on argon2.hash - flag for Stage D vs no-mocks rule) and OR-guard assertion. Unit 80, e2e 10/129, lint/format/typecheck green. Stage C next.
- 2026-10-28 Stage C PASS (hub-tester): unit 80, e2e 129 x10, L19 x15 stable, randomized ok, live probe /64 + timing (unknown 28.8ms ~ wrong 35.1ms; m5 2.0ms), mutations m1-m7 caught, IMAGE-BUILD full gate pass. See DEC-118 addendum 2. Stage D next.
- 2026-10-28 Stage D PASS (0 blockers, 4 suggestions): simplify normalizeClientIp, add embedded-IPv4 unit row, wrap ponytail, L19 failure message. Spyon judged legitimate. AC4 count fixed to 80. Batch 5 re-build, then reduced Stage C, then gate. See DEC-118 addendum 3.
- 2026-10-28 Build batch 5 done: normalizeClientIp simplified (closure + bit math removed), 2 new IPv4-tail unit rows (written first, pass old+new impl; scratch mutation 'tail counts as 1 group' caught), ponytail wrapped, L19 labelled failure output. Implementer corrected reviewer's expected value for 1::2:3:4:5:1.2.3.4 to 1:0:2:3::/64 (tail = 2 groups, fill 8-1-6=1). Unit 82, e2e 10/129 x2. Reduced Stage C next.
- 2026-10-28 Reduced Stage C PASS: unit 82, e2e 129 x5, equivalence 20046 inputs 0 diffs (old = reconstruction), mutations a/b/c caught. Stage E next.
- 2026-10-28 [done] gatekeeper PASS

## Completion notes
Stage E PASS (hub-gatekeeper): lint/format/typecheck clean, unit 82, e2e 10/129, no new dep, all 401s use INVALID_CREDENTIALS, normalizeClientIp probe OK. B/C/D passed, reduced C after batch 5. Accepted limits: locked path fast (ceiling), stale rows remain if no one fails again, hex-form ::ffff:7f00:1 not unwrapped, throttler/nginx on exact IPv6 address, L19 timing-based (ratio, low flake risk).
