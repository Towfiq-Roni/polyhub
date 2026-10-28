# ADR-0004: Auth approach — JWT access(1 day) + refresh(7 days), argon2id

## Status
Accepted

## Context
SRS §3.7/FR-ADMIN-02 requires authenticated access for up to 5 internal users, with admin-mediated password resets and no SMTP dependency (no external IdP, no email-based flows). F-27 (Authentication) is the foundational feature every other write-capable feature depends on.

## Decision
Stateless JWT authentication: a short-lived access token and a longer-lived refresh token, with argon2id password hashing. Access token TTL is **1 day**; refresh token TTL is 7 days; lockout after 10 failed attempts within 15 minutes.

## Consequences
- Argon2id is the current recommended password-hashing standard — resistant to GPU/ASIC cracking better than bcrypt/PBKDF2 at equivalent cost.
- A 1-day access token trades some security margin (a stolen access token is valid up to a full day, vs. a shorter window) for fewer silent token-refresh round trips during a workday — a deliberate usability choice for a small trusted internal user base, not a security-unaware default.
- Stateless access tokens mean no server-side session store for the common case; the refresh token still needs a persisted, revocable record (e.g. for logout-everywhere or a compromised-device response) — access-token revocation before its 1-day expiry is not otherwise possible, a real (accepted) tradeoff of the 1-day TTL.
- **Conflict with `docs/adr/0004-jwt-argon2-auth.md`/DEC-012 resolved (2026-09-10, DEC-073):** that ADR originally specified a 15-minute access token TTL. `docs/adr/0012-jwt-access-token-ttl-1-day.md` now supersedes it on this point — 1 day is confirmed as what actually ships.

## Alternatives considered
- **Server-side session cookies:** simpler revocation (delete the session row instantly), but needs a session store and less naturally fits a decoupled API + PWA client split than bearer tokens do.
- **OAuth-only (Google/Microsoft login):** removes password management entirely, but forces every user to hold a Google/Microsoft account and adds an external dependency — contradicts the self-hosted, $0-external-dependency posture (NFR-COST-01) the rest of the stack maintains.

## Related
FR-ADMIN-02; F-27, F-28; NFR-SEC-01; **conflicts with `docs/adr/0004-jwt-argon2-auth.md`, DEC-012 — reconciliation needed before build**

## Addendum 2026-10-26 (task #52, DEC-115)
- **Consequence discovered:** per-account lockout let anyone who knew an email lock it for 15 minutes, including the sole SUPER_ADMIN, defeating the intent of CLAUDE.md rule 9.
- **Owner decision (DEC-113):** "2 and lockout only the attacker", confirmed as R2: per-IP lockout for every account including SUPER_ADMIN (an admin that never locks was rejected).
- **Rule:** failed attempts and lockout are keyed on (account, client IP) in table `login_attempts` (10 failures / 15 min / IP); client IP = Express `req.ip` behind trust proxy 1; locked, wrong-password, unknown and inactive stay one generic 401; admin unlock via `POST /users/:id/activate` (and reset-password) clears the rows; legacy `users` lockout columns unused, dropped later.
- **Numbers:** ~40 guesses/hour/IP with the per-IP lock vs ~300 without; edge limits nginx `limit_req` 5 r/min/IP burst 5, app throttle 5/60 s per IP, password min 12, argon2id.
- **Residual risks accepted:** attacker sharing the victim's egress IP locks them on that IP for 15 min (recovery via activate); IPv6 /64 rotation (ponytail); distributed botnet ~10 guesses per IP per 15 min.
- Full text: `docs/adr/0004-jwt-argon2-auth.md` addendum.

- **Security invariant (Stage D, task #52):** trusting `req.ip` / `X-Forwarded-For` (trust proxy 1) is safe ONLY because nginx is the sole ingress: in production the api service publishes no host port (`infra/docker-compose.prod.yml` gives it no `ports:`) and nginx overwrites `X-Forwarded-For` with `$remote_addr`. If the API is ever reached directly (dev/test, or a future second ingress) a client can choose its own IP — defeating both the per-IP lockout and the 5/60s throttle. Do not publish the api port in production without revisiting this.

## Addendum 2026-10-28 (task #56, DEC-118)
- **Prune:** the failure-path prune of `login_attempts` is now global (all users' dead rows); no scheduler. Ceiling: stale rows remain if nobody fails again.
- **IPv6:** lockout key uses the /64 prefix (`a:b:c:d::/64`); no migration. Accepted: IPv6 clients locked at deploy become unlocked, hosts in one /64 share a lock budget, throttler and nginx `limit_req` stay on the exact address, hex-form `::ffff:7f00:1` is not unwrapped: the existing `^::ffff:` prefix strip leaves the stable junk key `7f00:1` (pre-existing, harmless, not a regression).
- **Timing:** unknown or inactive email runs one dummy argon2 verify (~27 ms) to remove the enumeration timing oracle; the locked path stays fast (ceiling). Same generic 401.
- Full text: `docs/adr/0004-jwt-argon2-auth.md` addendum.
