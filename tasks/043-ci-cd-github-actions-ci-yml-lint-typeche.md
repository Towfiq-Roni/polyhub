---
id: 43
title: "CI/CD: GitHub Actions `ci.yml` (lint→typecheck→unit→e2e) + `deploy.yml` (GHCR push→SSH deploy→smoke→rollback) (Phase 1)"
goal: "Reduced tool sprawl"
source: "User 2026-09-13"
priority: 2
status: "TODO"
trace: ""
sprint: "—"
deps: []
build_spec: ""
started: ""
completed: ""
agents: ""
---
# #43 CI/CD: GitHub Actions `ci.yml` (lint→typecheck→unit→e2e) + `deploy.yml` (GHCR push→SSH deploy→smoke→rollback) (Phase 1)

## Description / AC
CI/CD: GitHub Actions `ci.yml` (lint→typecheck→unit→e2e) + `deploy.yml` (GHCR push→SSH deploy→smoke→rollback) (Phase 1) — NOTE: CI must run `pnpm --filter @hub/shared build` before `test:e2e` (or add root `pretest:e2e`), per #39 Stage D

## Build spec
- none yet

## Changelog
- 2026-10-25 [migration] migrated from TASKS.md row #43 (archive: docs/agentic/archive/TASKS-2026-10-25.md)

## Completion notes
—
