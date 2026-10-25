---
id: 42
title: "Prod infra: multi-stage Dockerfiles (api/web, arm64+amd64) + multi-level docker-compose (base+dev+prod overlays) + nginx conf + Makefile prod targets (Phase 1)"
goal: "Reduced tool sprawl"
source: "User 2026-09-13"
priority: 1
status: "DONE"
trace: ""
sprint: "—"
deps: []
build_spec: "docs/agentic/build-specs/2026-09-13-infra-dev-prod.md"
started: "2026-09-13"
completed: "2026-09-14"
agents: "hub-planner→hub-implementer→hub-reviewer→hub-tester→hub-code-reviewer→hub-gatekeeper"
---
# #42 Prod infra: multi-stage Dockerfiles (api/web, arm64+amd64) + multi-level docker-compose (base+dev+prod overlays) + nginx conf + Makefile prod targets (Phase 1)

## Description / AC
Prod infra: multi-stage Dockerfiles (api/web, arm64+amd64) + multi-level docker-compose (base+dev+prod overlays) + nginx conf + Makefile prod targets (Phase 1)

## Build spec
- docs/agentic/build-specs/2026-09-13-infra-dev-prod.md

## Changelog
- 2026-09-13 started (migrated from TASKS.md)
- 2026-09-14 DONE (migrated from TASKS.md)
- 2026-10-25 [migration] migrated from TASKS.md row #42 (archive: docs/agentic/archive/TASKS-2026-10-25.md)

## Completion notes
Full quality chain, 3 rule-audit cycles + 3 gatekeeper cycles (all the REROUTEs were documentation-only — real deviations reasoned correctly at build time but not logged in DECISIONS.md until caught; no re-BUILD needed for any of them). Real bugs found+fixed during Stage C: nginx missing `networks: [hub-net]` (whole stack broken), `env_file`/Makefile convention mismatch, Prisma CLI stripped from the prod runtime image by `--prod` install, and argon2's prebuilt binary segfaulting under Node 20.x (root-caused via direct experiment after an initial DNS-order fix proved a no-op — fixed by bumping to `node:22-alpine`, verified 5/5 cold builds twice). See `docs/agentic/build-specs/2026-09-13-infra-dev-prod.md` and DEC-081..084. Restored to the backlog after DEC-081 found the harness-seeded epics never carried an infra epic at all.
