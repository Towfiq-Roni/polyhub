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

## Addendum 2026-10-26 (task #52, DEC-115)

**Consequence discovered.** The original lockout counted failures per account, so anyone who knew an email could lock that account for 15 minutes, including the sole SUPER_ADMIN. That defeats the intent of CLAUDE.md rule 9 (at least one usable active SUPER_ADMIN).

**Owner decision (DEC-113).** "2 and lockout only the attacker", then confirmed R2 when asked: per-IP lockout for every account including SUPER_ADMIN (R1, an admin that never locks, was rejected).

**Resulting rule.**
- Failed attempts and lockout are keyed on (account, client IP) in table `login_attempts`: 10 failures within 15 minutes lock that account on that IP for 15 minutes. Failing from IP X never affects the real user on IP Y, and SUPER_ADMIN follows the same per-IP rule (no special case).
- Client IP is Express `req.ip` behind `trust proxy 1`, never `X-Forwarded-For` read directly.
- Locked, wrong password, unknown email and inactive account all stay one generic 401 (no enumeration; no row is written for unknown or inactive emails).
- Admin unlock: `POST /users/:id/activate`, and `resetPassword`, delete the user's `login_attempts` rows. The legacy `users` lockout columns were dropped in migration `20261028000000_drop_legacy_user_lockout_columns` (task #54).

**Decision table (attacker IP X, victim IP Y).**

| Case | Before | Now |
|---|---|---|
| Attacker fails 10x from X, user (incl. SUPER_ADMIN) logs in from Y | user locked 15 min | user OK, X locked |
| Attacker and user share one egress IP | user locked | user locked on that IP up to 15 min; recovery via activate |
| Distributed attacker, many IPs | account locked | each IP capped at ~10 guesses / 15 min; account never locked |

**Numbers.** With the per-IP lock about 40 guesses/hour/IP, versus about 300/hour/IP (the throttle ceiling) if the admin had no lockout. Edge limits: nginx `limit_req` 5 r/min/IP burst 5, app throttle 5 per 60 s per IP, password minimum 12 characters, argon2id.

**Residual risks accepted.** An attacker on the victim's egress IP locks them on that IP for 15 minutes (recovery via activate); IPv6 /64 address rotation (ponytail: exact-address key, upgrade to /64 prefix); a distributed botnet gets about 10 guesses per IP per 15 minutes, bounded by the edge limits, the 12-character policy and argon2id. Status line unchanged.

- **Security invariant (Stage D, task #52):** trusting `req.ip` / `X-Forwarded-For` (trust proxy 1) is safe ONLY because nginx is the sole ingress: in production the api service publishes no host port (`infra/docker-compose.prod.yml` gives it no `ports:`) and nginx overwrites `X-Forwarded-For` with `$remote_addr`. If the API is ever reached directly (dev/test, or a future second ingress) a client can choose its own IP — defeating both the per-IP lockout and the 5/60s throttle. Do not publish the api port in production without revisiting this.

## Addendum 2026-10-28 (task #56, DEC-118)

Hardening of the per-(account, client IP) lockout from the 2026-10-26 addendum. Status line unchanged.

- **Global prune on failure.** The prune that runs when a failed attempt is recorded now sweeps dead `login_attempts` rows for all users, not only the failing user. No timer or scheduler is added. Ceiling: if nobody fails again, stale rows stay in the table. They are bounded and harmless. Upgrade path: a scheduled delete if volume ever matters.
- **IPv6 keyed on /64.** An IPv6 client IP is stored in the lockout key as its /64 prefix (`a:b:c:d::/64`), computed with `node:net` `isIPv6` (no new dependency). `login_attempts.ip` is TEXT, so no migration is needed. Old exact-address IPv6 rows are orphaned and swept by the prune. This closes the residual risk "IPv6 /64 rotation" accepted in the earlier addendum.
- **Accepted behaviour changes.** IPv6 clients locked at deploy time become unlocked. Hosts sharing one /64 share a single lock budget (the same class as the accepted shared-egress-IP limit). The app throttler and nginx `limit_req` stay on the exact address. Rate limiting by /64 is a follow-up if ever wanted. The hex form of a mapped address (`::ffff:7f00:1`) is not unwrapped: the existing `^::ffff:` prefix strip leaves the stable junk key `7f00:1` (pre-existing, harmless, not a regression).
- **Enumeration timing oracle removed.** Login for an unknown or inactive email now runs one dummy argon2 verify (a lazily created, memoized hash made with the normal hashing parameters, about 27 ms measured versus about 1-3 ms without). The throttle alone did not remove the oracle. The response is still the same generic 401, and nothing is logged on this path. Ceiling: the locked path still returns fast, because it never reaches a password check.
