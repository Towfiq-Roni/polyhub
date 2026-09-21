# ADR-0005: API style — REST

## Status
Accepted

## Context
DFD §2.1 confirms exactly one external-entity type (EXT-01, the browser) needs full CRUD/read access across all 8 data stores through a single channel; no third-party API consumer exists in scope. DFD §6's read patterns are direct, not deeply nested client-driven queries.

## Decision
Expose a REST API from the NestJS backend (ADR-0002).

## Consequences
- Maps directly onto NestJS's native controller/DTO model — no extra schema layer to maintain.
- Simple to reason about, test (Supertest, ADR-0009), and document (Swagger, already planned per `task-breakdown.md` Phase 1).
- Every new read shape (e.g. a new dashboard aggregate) needs its own endpoint or query params, rather than a client composing an arbitrary query — acceptable since there's exactly one first-party client (ADR-0001) that the backend team also owns.

## Alternatives considered
- **GraphQL:** flexible client-driven queries and reduced over/under-fetching, but adds real schema/resolver/N+1-mitigation complexity that has no offsetting benefit when there's exactly one client type with no need for ad hoc query shapes.
- **tRPC:** end-to-end type safety without a schema layer, but couples frontend and backend more tightly than REST and is a less-established pattern specifically for a NestJS backend.

## Related
DFD §2.1, §6; F-01 through F-32 (all API-consuming features)
