---
name: make-dev-up-needs-infra-env-dev
description: Copy infra/.env.dev.example to infra/.env.dev before running `make dev-up`; the target fails without it.
type: pitfall
---
During the #39 Stage D verification (2026-10-25) the dev stack could not start because `infra/.env.dev` did not exist. The Makefile passes `--env-file infra/.env.dev` and `infra/docker-compose.dev.yml` sets `env_file: infra/.env.dev`; only `infra/.env.dev.example` is committed. The note is recorded in tasks/041-dev-infra-infra-docker-compose-dev-yml-f.md ("`make dev-up` needs `cp infra/.env.dev.example infra/.env.dev` first").

**Why:** the real env file is gitignored by design, and nothing creates it automatically, so a fresh checkout or agent worktree has the example file only.

**How to apply:** before `make dev-up` (or any dev compose command) check `test -f infra/.env.dev || cp infra/.env.dev.example infra/.env.dev`. Tester and implementer agents running Stage D checks do this first.
