# ADR-0002: Backend stack — NestJS + Prisma + PostgreSQL

**Status:** Accepted
**Date:** 2026-08-22
**Source:** DEC-002

## Context

Hub's backend needs to serve a REST API with RBAC, an accounting-grade ledger,
and audit trails, sharing types with the frontend inside one TypeScript
monorepo. Django (Python) was the other option seriously considered by the
user; the monorepo's existing choice of TypeScript for the frontend (ADR-0001)
made a same-language backend attractive for shared validation schemas and
lower cognitive overhead for a small team.

## Decision

NestJS 11 for the REST API (modules, DI, guards, interceptors, exception
filters), Prisma 6 as the ORM/query layer, PostgreSQL 16 as the database —
over Django/DRF.

## Consequences

- `packages/shared` (zod schemas, enums, permission keys) is usable from both
  `apps/api` and `apps/web` without a second schema definition — no
  cross-language DTO duplication.
- NestJS's guard/interceptor pipeline is the natural home for the
  PermissionsGuard (ADR-0007) and the audit interceptor (CLAUDE.md rule 8);
  Prisma's `$transaction` is the mechanism behind the one-payment-one-transaction
  invariant (ADR-0006, CLAUDE.md rule 3).
- Team loses any existing Django expertise as a fallback; NestJS's
  batteries-included structure is judged worth that trade at this project
  size (small, single-team, TS-first already for the frontend).
- Prisma's raw-SQL escape hatch (`$queryRaw`) is expected to be needed for
  ledger aggregate sums (ΣIN/ΣOUT) — tracked in `postgres-ledger` skill
  guidance, not a blocker to this choice.
