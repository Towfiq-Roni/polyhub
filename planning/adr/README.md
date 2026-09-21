# Architecture Decision Records (planning/adr/)

> This is a **separate ADR history from `docs/adr/`** (the repo's existing, real ADR set — 12 records as of DEC-068's reversal). By explicit stakeholder choice (2026-09-10), this `planning/` pass authored its own ADR set from the SRS/Features/DFD/ERD rather than adopting `docs/adr/` as canonical — see DEC-072. The two sets largely reach the same conclusions (same real constraints), with **one confirmed conflict** flagged below that needs reconciliation before build.

| ADR | Title | Status |
|---|---|---|
| [0001](ADR-0001-frontend-framework.md) | Frontend framework — Next.js 15 App Router + Serwist PWA | Accepted |
| [0002](ADR-0002-backend-framework.md) | Backend framework — NestJS 11 + TypeScript monolith | Accepted |
| [0003](ADR-0003-datastore.md) | Datastore — PostgreSQL 16 | Accepted |
| [0004](ADR-0004-auth-approach.md) | Auth approach — JWT access(1 day)+refresh(7 days), argon2id | Accepted |
| [0005](ADR-0005-api-style.md) | API style — REST | Accepted |
| [0006](ADR-0006-async-queueing.md) | Async / queueing — none | Accepted |
| [0007](ADR-0007-deployment-target.md) | Deployment / hosting target — self-hosted Docker Compose on Oracle Always Free VM | Accepted |
| [0008](ADR-0008-multi-tenancy.md) | Multi-tenancy model — single-tenant | Accepted |
| [0009](ADR-0009-testing-strategy.md) | Testing strategy — Jest/Supertest + Playwright | Accepted |
| [0010](ADR-0010-observability.md) | Observability — structured logging + health checks + Sentry (free tier) | Accepted |

## Resolved conflict (was: reconciliation needed before Phase 2 build)

**ADR-0004 (this set) vs. `docs/adr/0004-jwt-argon2-auth.md`/DEC-012 (existing repo history):** the access-token TTL differed — 1 day here, 15 minutes there. Resolved 2026-09-10 (DEC-073): 1 day wins. `docs/adr/0012-jwt-access-token-ttl-1-day.md` now supersedes `docs/adr/0004` on this point; `docs/adr/README.md`'s index updated accordingly.

## Everything else — no real conflict

ADR-0001/0002/0003/0005/0006/0007/0008/0009/0010 reach the same conclusions as the corresponding decisions already in `docs/adr/`/`CLAUDE.md`'s Locked Stack (Next.js+Serwist, NestJS+Prisma+PostgreSQL, REST, single Oracle VM, single-tenant) — independently re-derived here from the SRS/Features/DFD/ERD chain rather than copied, landing in the same place because the underlying constraints didn't change. `docs/adr/0009` (universal export architecture), `0006` (immutable-ledger-reversals), `0007` (allow-only RBAC), `0008` (unified resource model), `0010` (enriched error envelope), and `0011` (now-superseded derived-CoA-reporting) have no direct counterpart in this set — they're narrower/lower-level decisions than this stage's category list covers, not a gap.
