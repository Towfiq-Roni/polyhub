---
id: 50
title: "Image-build gate: add an unmodified apps/api docker build step to hub-tester/spec template for Prisma-touching tasks + CI default-stage assertion (last FROM is runtime, dist/main.js present) (from #48 Stage D)"
goal: "Reduced tool sprawl"
source: "Auto 2026-10-25"
priority: 2
status: "DONE"
trace: ""
sprint: "—"
deps: []
build_spec: "docs/agentic/build-specs/2026-10-25-image-build-gate.md"
started: "2026-10-25"
completed: "2026-10-25"
agents: ""
---
# #50 Image-build gate: add an unmodified apps/api docker build step to hub-tester/spec template for Prisma-touching tasks + CI default-stage assertion (last FROM is runtime, dist/main.js present) (from #48 Stage D)

## Description / AC
Goal: Reduced tool sprawl. AC: (1) tools/check-dockerfile-stages.py asserts last FROM = runtime, prisma generate before build in the build stage, runtime CMD runs dist/main.js (exit 0/1/2) with mutation tests; (2) hub-tester carries ONE mechanically-triggered IMAGE-BUILD gate (path trigger list incl. prisma/, Dockerfile, manifests, tsconfig, shared src) with unconditional cleanup, hub-planner/hub-gatekeeper point to it; (3) harness 0.2.0 + CHANGELOG; (4) drilled cold incl. failure paths (DEC-109).

## Build spec
- docs/agentic/build-specs/2026-10-25-image-build-gate.md

## Changelog
- 2026-10-25 [new] created
- 2026-10-25 [start] focus -> #50, status IN_PROGRESS (spec docs/agentic/build-specs/2026-10-25-image-build-gate.md)
- 2026-10-25 DEC-109 applied; start focus=50; Batch 1 next
- 2026-10-25 Batch 1 (checker + 9 tests) and Batch 2 (IMAGE-BUILD gate in tester/planner/gatekeeper) built; gatekeeper heading renamed to IMAGE-BUILD gate (orchestrator); next Batch 3
- 2026-10-25 Batch 3 built (VERSION 0.2.0, CHANGELOG, pitfall pointer); test-session-start hardcoded version fixed (DEC-109 addendum); all 6 suites green; next Stage B
- 2026-10-25 Stage B PASS (2 MINOR applied: prisma prefix trigger, explicit env names; DEC-109 addendum 2); next Stage C incl. running the IMAGE-BUILD procedure once (spec E6)
- 2026-10-25 Stage C PASS (E1-E8 + IMAGE-BUILD drill); findings F2-F5 applied (DEC-109 addendum 3), F1 ponytail-noted; next Stage D
- 2026-10-25 Stage D: 3 MAJOR (cleanup not unconditional, tsconfig + shared/src triggers missing) -> re-BUILD (DEC-109 addendum 4)
- 2026-10-25 Stage D MAJORs fixed (DEC-109 addendum 4/5); suites green (checker 12); next: Stage C re-drill cold from final text, then Stage E
- 2026-10-25 Stage C cold re-drill PASS (happy + 3 failure paths); 3 text findings applied (DEC-109 addendum 6); next Stage E
- 2026-10-25 [done] gatekeeper PASS

## Completion notes
Full chain PASS 2026-10-25: reviewer PASS (2 MINOR applied), tester PASS + cold re-drill incl. 3 failure paths, code-reviewer 0 BLOCKER/3 MAJOR fixed (cleanup trap, tsconfig/shared triggers; DEC-109 addenda 4-6), gatekeeper PASS. Harness 0.2.0. Accepted: nothing runs tools tests automatically until #43 CI; checker fail-closed false-FAIL limits ponytail-noted.
