---
id: 52
title: "Lockout account-DoS risk: ADR-0004 addendum / SRS risk note + OWNER decision — exempt the SUPER_ADMIN, or lock per account+IP (today: anyone knowing an email can lock it for 15 min; pinned by #49 tests, DEC-111)"
goal: "Financial traceability"
source: "Auto 2026-10-25"
priority: 2
status: "DONE"
trace: "E-07/F-27"
sprint: "—"
deps: []
build_spec: "docs/agentic/build-specs/2026-10-26-lockout-per-ip-admin-exempt.md"
started: "2026-10-26"
completed: "2026-10-26"
agents: ""
---
# #52 Lockout account-DoS risk: ADR-0004 addendum / SRS risk note + OWNER decision — exempt the SUPER_ADMIN, or lock per account+IP (today: anyone knowing an email can lock it for 15 min; pinned by #49 tests, DEC-111)

## Description / AC
Goal: Financial traceability. AC: (1) ADR-0004 addendum / SRS F-27 risk note records the account-DoS consequence of per-account lockout (anyone who knows an email can lock it for 15 min — incl. the sole SUPER_ADMIN, which touches the intent of CLAUDE.md rule 9); (2) OWNER decides: keep as is + rely on nginx limit_req, exempt the SUPER_ADMIN from lockout, or lock per account+IP; (3) if behaviour changes: build spec, e2e (auth-throttle.e2e-spec.ts D5 pins today's behaviour and must be updated deliberately), DEC. Context: DEC-111, tasks/049.

## Build spec
- docs/agentic/build-specs/2026-10-26-lockout-per-ip-admin-exempt.md

## Changelog
- 2026-10-25 [new] created
- 2026-10-26 [start] focus -> #52, status IN_PROGRESS (spec docs/agentic/build-specs/2026-10-26-lockout-per-ip-admin-exempt.md)
- 2026-10-26 Batch 1 built: login_attempts model + migration 20261026104357; status up to date, no drift, e2e 108/unit 63; DEC-115 addendum; next Batch 2 auth service/controller
- 2026-10-26 Batch 2 built (auth.service per-(user,ip) lockout, controller req.ip, unit 74); exactly the 9 expected e2e failures; DEC-115 addendum 2; next Batch 3 admin unlock
- 2026-10-26 Batch 3 built (admin unlock via login_attempts; users e2e 56/56); remaining 8 e2e failures = Batch 4 set; DEC-115 addendum 3; next Batch 4 e2e files
- 2026-10-26 Batch 4 built (auth-lockout e2e L1-L15, auth.e2e + throttle rewritten; e2e 121); 2 unexplained flakes noted for Stage C; DEC-115 addendum 4; next Batch 5 docs
- 2026-10-26 Batch 5 docs built (ADR-0004 x2 addenda + SRS F-27 clause); legacy-column drop task filed; DEC-115 addendum 5; next Stage B
- 2026-10-26 Stage B PASS; Stage C PASS (E1-E12, IMAGE-BUILD, 7 mutations); flake root-caused (IntelliJ port 63343 vs supertest listen(0)) -> task filed; L12 too weak (19/20) -> strengthen in-task; DEC-115 addendum 6
- 2026-10-26 L12 strengthened (L12a/L12b, gap-free mutation 30/30); e2e 122; one more unexplained full-run failure noted (likely IntelliJ 404, #55); DEC-115 addendum 7; next Stage D
- 2026-10-26 Stage D: 0 BLOCKER/0 MAJOR/6 SUGGESTION; ADR invariant line added; race tests moving to a max-10 file (flake-proof), L13 tightened; follow-up task filed; DEC-115 addendum 8
- 2026-10-26 Stage D test fixes applied (race tests in max-10 file, L13 tightened; mutation 29/30 + 30/30); e2e 9 suites/122; DEC-115 addendum 9; next Stage E
- 2026-10-26 [done] gatekeeper PASS

## Completion notes
Full chain PASS 2026-10-26: reviewer 0 violations, tester E1-E12 + IMAGE-BUILD incl. migrate deploy in image + 7 mutations + live probe (flake root-caused: IntelliJ 127.0.0.1:63343 vs supertest listen(0) -> #55), code-reviewer 0 BLOCKER/0 MAJOR (L12 race tests moved to a max-10 file, deterministic, mutation 29/30+30/30; L13 tightened; nginx sole-ingress invariant documented; DEC-115 add. 6-9), gatekeeper PASS (re-ran image gate itself). Owner decision (DEC-113): per-(account, client IP) lockout for EVERY account incl. SUPER_ADMIN (R2). New table login_attempts (migration 20261026104357); legacy users lockout columns unused (drop = #54). e2e 9 suites/122, unit 10/74. Follow-ups: #54 drop legacy columns, #55 e2e loopback-bind flake, #56 login_attempts hygiene + IPv6 /64 + timing. Accepted: shared-egress-IP residual, IPv6 /64 rotation (ponytail), triple CASE SQL, JS vs DB clock in lock check/prune, lockoutCleared on any deleted row.
