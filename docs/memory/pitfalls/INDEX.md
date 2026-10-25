# Pitfalls index
Purpose: recurring traps seen in this repo, each with root cause and a concrete check. Read before starting a task.
Add a pitfall via a new file in this folder plus one index line below.
These are raw .md files, not vault-ingested (no wikilinks, plain relative links only).

- [deviation-reasoned-but-not-logged](deviation-reasoned-but-not-logged.md) — Log every deviation from a build spec in DECISIONS.md before the reviewer stage, not only in RUNLOG.
- [pnpm-not-on-path-in-agent-shells](pnpm-not-on-path-in-agent-shells.md) — Run pnpm as `corepack pnpm` (or a PATH shim) in agent shells; bare `pnpm` may be missing.
- [make-dev-up-needs-infra-env-dev](make-dev-up-needs-infra-env-dev.md) — Copy infra/.env.dev.example to infra/.env.dev before running `make dev-up`; the target fails without it.
- [e2e-needs-shared-build-first](e2e-needs-shared-build-first.md) — Run `pnpm --filter @hub/shared build` before `pnpm --filter @hub/api test:e2e`; the shared dist is not built by default.
- [async-agent-calls-break-sync-hooks](async-agent-calls-break-sync-hooks.md) — Never write a hook that assumes the Agent tool call has finished; Agent calls run async, so PostToolUse fires before the subagent works.
- [Optional DTO field null → 500](optional-dto-field-null-500.md) — `@IsOptional()` skips null; use `@ValidateIf((_, v) => v !== undefined)` on PATCH DTOs.
- [Docker build order vs prisma generate](docker-build-order-prisma-generate.md) — image build fails on Prisma.* types; make an unmodified docker build a gate (fix: #48).
