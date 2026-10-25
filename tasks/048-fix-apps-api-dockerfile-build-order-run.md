---
id: 48
title: "Fix apps/api/Dockerfile build order: run prisma generate BEFORE nest build (docker build --target runtime fails TS2694 Prisma.UserSelect since #2; found by #47 Stage C)"
goal: "Reduced tool sprawl"
source: "Auto 2026-10-25"
priority: 1
status: "DONE"
trace: ""
sprint: "—"
deps: []
build_spec: "docs/agentic/build-specs/2026-10-25-dockerfile-prisma-generate-order.md"
started: "2026-10-25"
completed: "2026-10-25"
agents: ""
---
# #48 Fix apps/api/Dockerfile build order: run prisma generate BEFORE nest build (docker build --target runtime fails TS2694 Prisma.UserSelect since #2; found by #47 Stage C)

## Description / AC
Goal: Reduced tool sprawl. AC: (1) `docker build -f apps/api/Dockerfile .` (no --target) succeeds from a clean checkout and produces the runtime image (CMD `node dist/main.js`, dist present, no source); (2) the HEAD Dockerfile fails with TS2694 (mutation proof); (3) `--target dev` still builds with its dev CMD; (4) argon2 loads, Prisma CLI works as deploy.sh invokes it, container boots healthy and serves /health, login, /users without hash; (5) runtime-stage lines byte-identical; (6) deviations logged (DEC-107/108).

## Build spec
- docs/agentic/build-specs/2026-10-25-dockerfile-prisma-generate-order.md

## Changelog
- 2026-10-25 [new] created
- 2026-10-25 [start] focus -> #48, status IN_PROGRESS (spec docs/agentic/build-specs/2026-10-25-dockerfile-prisma-generate-order.md)
- 2026-10-25 Dockerfile fixed (generate before build; dev stage above runtime); E1-E8 evidence per implementer; DEC-108 addendum; next Stage B
- 2026-10-25 Stage B PASS (0 violations; consumers of stage order checked); next Stage C
- 2026-10-25 Stage C PASS: E1-E5,E7,E8 + compose render (prod overlay no target -> runtime); HEAD no-target build exits 0 = dev image (original prod bug confirmed); E6 not run (needs .env.prod/TLS); next Stage D
- 2026-10-25 Stage D PASS (0 BLOCKER/0 MAJOR, 2 SUGGESTION: keep-runtime-last note skipped; image-build gate filed as new task); next Stage E
- 2026-10-25 [done] gatekeeper PASS

## Completion notes
Full chain PASS 2026-10-25: reviewer (0 violations), tester (E1-E5,E7,E8 + compose render; HEAD no-target build = dev image confirmed), code-reviewer (0 BLOCKER/0 MAJOR), gatekeeper PASS. Fix: prisma generate before nest build; dev stage moved above runtime so runtime is the default final stage (DEC-107/108). Not run: make prod-build, smoke.sh, deploy.sh, docker compose config on real overlays (need infra/.env.dev/.env.prod + TLS); prisma migrate status verdict unverified by gatekeeper (verified by tester). Follow-up #50 image-build gate.
