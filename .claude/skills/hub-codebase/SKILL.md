---
name: hub-codebase
description: Use when creating any new file, module, component, endpoint, test, or package in this monorepo — NestJS modules, Next.js routes/features, packages/shared schemas, DTOs, permission keys. Dictates placement, naming, and structure conventions so the codebase stays uniform. Load BEFORE scaffolding anything new.
---

# Hub Codebase Conventions

## Placement decision tree
```
New domain concept (entity + endpoints)?
  → apps/api/src/modules/<domain>/        controller+service+DTOs, vertical slice
New UI surface?
  → apps/web/app/(dashboard)/<route>/     server components by default
  → apps/web/features/<domain>/           client components, hooks, api clients
New type/enum/zod schema/permission key/money helper?
  → packages/shared/src/...               NEVER duplicate in an app
New infra/docker/nginx/workflow file?
  → infra/ or .github/workflows/          load hub-deploy skill first
```

## Rules
- Apps never import across `apps/*`; shared code goes through `packages/shared` only.
- **Permission keys live only in `packages/shared`** — format `resource.action`, lowercase, matching spec §21.4 catalog. API guards AND UI gating consume the same constants.
- Enums/status values UPPER_SNAKE matching spec wording (`PARTIALLY_PAID`, `PROPOSAL_SENT`).
- Files kebab-case; classes/components PascalCase; DB fields snake_case via Prisma `@map`.
- Controllers contain zero business logic — validate, delegate, return.
- Response envelope `{ data, meta? }`; errors via global filter; pagination `?page&limit&sort&q`.
- Money: integer poisha helpers from `packages/shared` (see hub-ledger skill).
- Every new module wires: permissions guard decorators, audit interceptor coverage, Swagger tags, e2e test folder.
- No comments unless explaining a non-obvious *why*; no TODOs without a PROGRESS.md task reference.

## Testing placement
- Unit: colocated `*.spec.ts` (api) / `*.test.ts` (web, shared).
- API e2e: `apps/api/test/<flow>.e2e-spec.ts` — one per acceptance criterion in `analysis/task-breakdown.md`.

## Before declaring done
`pnpm lint && pnpm typecheck && pnpm test` all green; OpenAPI diff clean vs `packages/shared` schemas.
