---
id: 47
title: "Dependency security upgrade: clear pnpm audit critical/high findings (express/proxy-addr/multer/body-parser via @nestjs/platform-express, zod, handlebars via ts-jest, deepmerge-ts via prisma, brace-expansion, fast-uri)"
goal: "Financial traceability"
source: "User 2026-10-25"
priority: 1
status: "DONE"
trace: ""
sprint: "—"
deps: []
build_spec: "docs/agentic/build-specs/2026-10-25-dependency-security-upgrade.md"
started: "2026-10-25"
completed: "2026-10-25"
agents: ""
---
# #47 Dependency security upgrade: clear pnpm audit critical/high findings (express/proxy-addr/multer/body-parser via @nestjs/platform-express, zod, handlebars via ts-jest, deepmerge-ts via prisma, brace-expansion, fast-uri)

## Description / AC
Goal: Financial traceability. (add description + acceptance criteria)

## Build spec
- docs/agentic/build-specs/2026-10-25-dependency-security-upgrade.md

## Changelog
- 2026-10-25 [new] created
- 2026-10-25 [start] focus -> #47, status IN_PROGRESS (spec docs/agentic/build-specs/2026-10-25-dependency-security-upgrade.md)
- 2026-10-25 Batch 1 built: bumps + overrides, audit 3/13/9/3 -> 0 (prod too), e2e 84/84, DEC-106 addendum; next Stage B
- 2026-10-25 Stage B PASS (MINOR: js-yaml/argparse blast radius logged, DEC-106 addendum 2); next Stage C (docker build/boot, argon2, live probes)
- 2026-10-25 Stage C: all gates PASS except E7-literal (pre-existing Dockerfile order defect, DEC-107, filed #48; verified via scratch Dockerfile). Next: Stage D
- 2026-10-25 Stage D: 0 BLOCKER/0 MAJOR, 3 SUGGESTION logged (DEC-106 addendum 3), pitfall docker-build-order written, #49 filed; next Stage E
- 2026-10-25 [done] gatekeeper PASS

## Completion notes
Full chain PASS 2026-10-25: reviewer PASS (MINOR logged), tester PASS except E7-literal (pre-existing Dockerfile order defect -> #48, DEC-107), code-reviewer 0 BLOCKER/0 MAJOR, gatekeeper PASS. pnpm audit 3/13/9/3 -> 0 (prod too); locked majors kept; overrides multer/js-yaml/deepmerge-ts with ponytail removal conditions; e2e 84/84, unit 58.
