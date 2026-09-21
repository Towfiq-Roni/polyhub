# ADR-0004: JWT access/refresh auth with argon2id, no SMTP

**Status:** Superseded by [ADR-0012](0012-jwt-access-token-ttl-1-day.md) (access-token TTL only — every other facet below is unchanged and still accurate)
**Date:** 2026-08-22
**Source:** DEC-012

## Context

Auth needs to be self-hosted (ADR-0003 rules out managed auth providers as a
recurring cost) for ≤5 known users, all internally provisioned — there's no
public sign-up flow, and standing up transactional email (SMTP) purely for
password-reset links is disproportionate infra for 5 accounts.

## Decision

JWT access tokens (15 min) + refresh tokens (7 days), password hashing with
argon2id, lockout after 10 failed attempts per 15 minutes, and password resets
mediated by a SUPER_ADMIN (who resets a user's password directly) instead of
an email-based reset flow.

## Consequences

- No SMTP dependency, no third-party email service, no cost or deliverability
  risk for a feature (self-service reset) that isn't worth it at 5 users.
- Short-lived access tokens limit the damage window of a leaked token; the
  refresh token carries the re-auth burden and must be stored/rotated
  carefully (httpOnly cookie, not localStorage).
- A SUPER_ADMIN must always exist to mediate resets and deactivations —
  this is why CLAUDE.md rule 9 (≥1 active SUPER_ADMIN invariant) exists; the
  auth model and that invariant are two halves of the same decision.
- argon2id over bcrypt: memory-hard, resists GPU cracking better, and is the
  current OWASP recommendation; no migration path needed since this is a
  greenfield system with no legacy bcrypt hashes to support.
