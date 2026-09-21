# ADR-0010: Enriched error envelope, single global exception filter

**Status:** Accepted
**Date:** 2026-08-23
**Source:** DEC-034

## Context

A small internal team still needs error messages that are actually
actionable — a bare HTTP 500 or a raw Prisma constraint error tells a user
nothing about what to do next, and inconsistent per-controller error shapes
make the frontend's error handling fragile and duplicated. REQ-32 called for
an "error clarity standard" as part of the same review that produced
ADR-0009.

## Decision

Every error response uses one envelope shape: `{ code, message, nextStep,
fieldErrors }`, produced by a **single** global NestJS exception filter — not
per-controller try/catch blocks. `code` is a stable string from a catalog
defined in `packages/shared` (code ↔ copy mapping); permission denials name
the specific missing capability (the `resource.action` key from ADR-0007)
rather than a generic "forbidden." Internal/unexpected errors are logged
server-side only and never leak internals (stack traces, SQL, file paths) into
the response body.

## Consequences

- The frontend can handle every error response the same way (read `code`,
  look up copy/next-step if needed) instead of parsing differently-shaped
  errors per endpoint.
- Prisma errors (unique constraint violations, foreign key failures) need a
  mapping layer from Prisma's error shape to this envelope's `code` — this
  lives in the global filter, not scattered across services.
- Because permission denials name the missing capability, this filter has a
  direct dependency on ADR-0007's permission-key catalog; a new permission key
  must remain nameable/human-readable, not just an opaque string.
- e2e tests assert the envelope shape itself (not just status codes), so a
  future change that breaks the shape is caught structurally, not just by
  manual review.
