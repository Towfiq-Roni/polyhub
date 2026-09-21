# ADR-0002: Backend framework — NestJS 11 + TypeScript monolith

## Status
Accepted

## Context
SRS §5.2 requires a REST API serving CRUD across ~26 ERD entities (§4) plus atomic financial posting logic (F-18 through F-22) that must never leave a partial write. DFD §3.1 decomposes the system into 7 processes (P1-P7), one of which (P5, Finance) further decomposes into 5 sub-processes — a real module boundary, not a flat script collection.

## Decision
Use NestJS 11 with TypeScript, structured as a single monolithic API service (not microservices).

## Consequences
- NestJS's module/DI system gives each DFD process (P1-P7) a natural home as a NestJS module, without inventing project-specific structure.
- A TypeScript monorepo (`packages/shared`) can share zod schemas, enums, and permission keys between this backend and the Next.js frontend (ADR-0001) — one source of truth for the RBAC permission catalog (F-29).
- A monolith avoids distributed-transaction complexity that atomic ledger postings (F-18-F-22) would otherwise need to solve across service boundaries — confirmed unnecessary by DFD §8 (no async/queueing need).
- Ties the whole backend to Node.js's single-threaded event loop — acceptable at NFR-SCALE-01's ≤5-user scale, would need revisiting far past this project's current scope.

## Alternatives considered
- **Express + TypeScript, minimal:** less framework overhead, but no built-in DI/module structure — the team would re-invent NestJS's conventions ad hoc across 7 modules, with more risk of inconsistency at this entity count.
- **Django + Python:** batteries-included admin/ORM, but splits the stack across two languages, forfeiting the shared-types benefit with the Next.js frontend for no offsetting advantage given the project's actual requirements.

## Related
NFR-SCALE-01; DFD §3.1 (P1-P7 process inventory); F-18 through F-22 (atomic posting)
