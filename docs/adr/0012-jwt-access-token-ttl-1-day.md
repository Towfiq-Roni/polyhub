# ADR-0012: JWT access-token TTL changed to 1 day (supersedes ADR-0004 on this point)

**Status:** Accepted
**Date:** 2026-09-10
**Source:** DEC-073; `planning/adr/ADR-0004-auth-approach.md` (agentic-harness planning pipeline)

## Context

While running the agentic-harness planning pipeline's ADR stage (a separate, parallel ADR history authored in `planning/adr/` per stakeholder choice — see `planning/adr/README.md`), the stakeholder chose a 1-day JWT access-token TTL over ADR-0004's original 15-minute TTL, when asked to pick between real tradeoffs. Presented with the conflict against the existing ADR-0004/DEC-012, the stakeholder explicitly confirmed 1 day should be the one that actually ships.

## Decision

The JWT access-token TTL is **1 day** (was 15 minutes in ADR-0004). Every other facet of ADR-0004's decision is unchanged and restated here for completeness: refresh token TTL 7 days, argon2id password hashing, lockout after 10 failed attempts per 15 minutes, SUPER_ADMIN-mediated password resets (no SMTP dependency).

## Consequences

- Fewer silent token-refresh round trips during a workday for a small (≤5-user), trusted internal team — a deliberate usability tradeoff, not an oversight.
- A stolen/leaked access token is valid for up to a full day instead of 15 minutes — a real, accepted increase in blast-radius window. Mitigated only by the refresh-token-rotation/revocation mechanism ADR-0004 already established (httpOnly cookie storage, not localStorage) — access-token revocation before its 1-day expiry is still not otherwise possible, same limitation ADR-0004 already carried, just larger in absolute terms now.
- CLAUDE.md rule 9's ≥1-active-SUPER_ADMIN invariant, and every other consequence ADR-0004 recorded, are unaffected — this ADR changes exactly one number.

## Alternatives considered

- **Keep 15 minutes (ADR-0004's original choice):** tighter security window, considered and available as the other real option when this was decided — not chosen, per explicit stakeholder direction.

## Related

`planning/adr/ADR-0004-auth-approach.md`; DEC-073
