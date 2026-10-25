---
id: 41
title: "Dev infra: `infra/docker-compose.dev.yml` full containerized parity"
goal: "Reduced tool sprawl"
source: "User 2026-09-14"
priority: 1
status: "IN_PROGRESS"
trace: ""
sprint: "—"
deps: []
build_spec: "docs/agentic/build-specs/2026-09-14-dev-infra-full-parity.md"
started: "2026-09-14"
completed: ""
agents: "hub-planner→hub-implementer"
---
# #41 Dev infra: `infra/docker-compose.dev.yml` full containerized parity

## Description / AC
Dev infra: `infra/docker-compose.dev.yml` full containerized parity — `api`+`nginx`+`postgres` (dev stage w/ hot-reload, self-signed dev cert), not just Postgres (Phase 1, scope expanded per DEC-086)

## Build spec
- docs/agentic/build-specs/2026-09-14-dev-infra-full-parity.md
- docs/agentic/build-specs/2026-09-13-infra-dev-prod.md

## Changelog
- 2026-09-14 started (migrated from TASKS.md)
- 2026-10-25 [migration] status cell verbatim: 🔄 IN_PROGRESS (reopened DEC-086; build + regression verified per RUNLOG 2026-09-14T14:20, awaiting reviewer→tester→code-review→gatekeeper closure; also: `make dev-up` needs `cp infra/.env.dev.example infra/.env.dev` first — make it automatic or document, per #39 Stage D)
- 2026-10-25 [migration] original #41+#42 completion note lives in #42 Completion notes; #41 reopened per DEC-086
- 2026-10-25 [migration] migrated from TASKS.md row #41 (archive: docs/agentic/archive/TASKS-2026-10-25.md)

## Completion notes
—
