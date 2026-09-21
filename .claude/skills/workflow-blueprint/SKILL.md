---
name: workflow-blueprint
description: Use after the first stable module of a pattern-type exists (CRUD module, financial mutation flow, resource/file flow) to document 1–3 representative end-to-end workflows from THIS codebase as implementation-ready blueprints — entry point → validation → service → data access → transactions → response → errors → tests — so future features clone the house pattern instead of inventing one. Adapted from github/awesome-copilot project-workflow-analysis-blueprint-generator.
license: MIT
---

# Hub Workflow Blueprint Generator

Distills real, working flows from `apps/api` + `apps/web` into blueprint documents under `docs/blueprints/`. Future implementers read the matching blueprint BEFORE coding a similar feature (`hub-implementer` gets it linked in its task brief).

> Adapted from [github/awesome-copilot](https://github.com/awesome-copilot) `project-workflow-analysis-blueprint-generator` — its technology-agnostic conditional template instantiated here with hub's fixed stack: NestJS feature modules + Next.js App Router + Prisma/PostgreSQL, API entry points, layered architecture.

## Fixed configuration (no auto-detect needed)

| Variable | Hub value |
|---|---|
| Project type | Node.js — NestJS 11 api + Next.js 15 web |
| Entry points | REST controller (`apps/api/src/modules/*/`) + server/client UI (`apps/web/features/*/`) |
| Persistence | SQL via Prisma (`$transaction` for money paths) |
| Architecture | Layered vertical-slice feature modules |

## Blueprint structure (each document covers)

1. **Workflow overview** — name, business purpose, triggering action, every file/class involved
2. **Entry point** — controller method signature + DTO + zod schema + permission decorator(s); UI side: initiating component/hook + api-client call
3. **Service layer** — method signatures, business logic highlights, DI notes
4. **Data mapping** — DTO ⇄ domain mapping, validation during mapping
5. **Data access** — Prisma calls incl. exact `$transaction([...])` shape where money moves; entity fields touched
6. **Response construction** — envelope `{ data, meta? }`, status codes, error shapes
7. **Error handling** — exception types, filter behavior, what is logged
8. **Audit & permissions** — audit events emitted, permission keys enforced at each hop
9. **Testing approach** — the unit + e2e specs covering this flow and what they assert
10. **Sequence diagram** — Mermaid, happy path + error paths
11. **Naming conventions observed** — as actually written, per `hub-codebase`
12. **Implementation template** — skeleton a developer copies for the next similar feature

## When to generate

| Trigger | Blueprint |
|---|---|
| Phase 2 done (first CRUD + auth module stable) | `crud-module.md`, `auth-flow.md` |
| Phase 5 done (ledger writes stable) | `financial-mutation.md` (payment ⇒ transaction atomicity pattern) |
| Phase 4 resources merged | `file-resource.md` (upload → X-Accel download) |
| Any time a reviewer says two modules diverged | regenerate the affected blueprint |

## Rules

- Blueprints are **derived from code that passed all gates** — never aspirational.
- Store as `docs/blueprints/<name>.md`; reference them from task briefs (`/do`) whenever the task matches an existing blueprint's pattern.
- Regeneration overwrites only with newer gated truth; note the commit SHA the blueprint was captured at.
- Keep each blueprint ≤ ~150 lines — it's a template, not a tutorial.
