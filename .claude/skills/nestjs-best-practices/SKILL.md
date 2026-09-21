---
name: nestjs-best-practices
description: Use when writing, reviewing, or refactoring NestJS code in apps/api — module architecture, dependency injection, guards, interceptors, exception filters, DTO validation, config, graceful shutdown. Rule index adapted from kadajett/agent-nestjs-skills with hub precedence overrides.
license: MIT
---

> Vendored from [kadajett/agent-nestjs-skills](https://github.com/kadajett/agent-nestjs-skills) `skills/nestjs-best-practices/SKILL.md` (MIT, v1.2.0). This is the rule *index*; per-rule details live upstream in that repo's `rules/*.md`. Hub overrides at bottom win on conflict.

# NestJS Best Practices (hub edition)

40 rules across 10 categories, prioritized by impact.

## Priority Index

| # | Category | Impact | Rules |
|---|----------|--------|-------|
| 1 | Architecture | CRITICAL | `arch-avoid-circular-deps` · `arch-feature-modules` · `arch-module-sharing` · `arch-single-responsibility` · `arch-use-repository-pattern` · `arch-use-events` |
| 2 | Dependency Injection | CRITICAL | `di-avoid-service-locator` · `di-interface-segregation` · `di-liskov-substitution` · `di-prefer-constructor-injection` · `di-scope-awareness` · `di-use-interfaces-tokens` |
| 3 | Error Handling | HIGH | `error-use-exception-filters` · `error-throw-http-exceptions` · `error-handle-async-errors` |
| 4 | Security | HIGH | `security-auth-jwt` · `security-validate-all-input` · `security-use-guards` · `security-sanitize-output` · `security-rate-limiting` |
| 5 | Performance | HIGH | `perf-async-hooks` · `perf-use-caching` · `perf-optimize-database` · `perf-lazy-loading` |
| 6 | Testing | MED-HIGH | `test-use-testing-module` · `test-e2e-supertest` · `test-mock-external-services` |
| 7 | Database & ORM | MED-HIGH | `db-use-transactions` · `db-avoid-n-plus-one` · `db-use-migrations` |
| 8 | API Design | MEDIUM | `api-use-dto-serialization` · `api-use-interceptors` · `api-versioning` · `api-use-pipes` |
| 9 | Microservices | MEDIUM | `micro-use-patterns` · `micro-use-health-checks` · `micro-use-queues` |
| 10 | DevOps | LOW-MED | `devops-use-config-module` · `devops-use-logging` · `devops-graceful-shutdown` |

Deep-dive any rule: `https://github.com/kadajett/agent-nestjs-skills/blob/main/rules/<rule>.md`

## How to apply
1. Identify which categories your current task touches.
2. Apply CRITICAL/HIGH categories as hard requirements; consult upstream rule file if a rule is unclear.
3. Run the checklist against new modules before reporting done.

---

# Hub Precedence Overrides (win on conflict)

| Upstream rule | Hub position |
|---|---|
| `arch-use-repository-pattern` | PrismaService **is** the data layer; no extra repository classes unless a module needs query reuse (ponytail: don't wrap Prisma in wrappers) |
| `db-use-transactions` | Mandatory per hub-ledger L2: financial mutations in ONE `prisma.$transaction([...])` with e2e atomicity test |
| `db-avoid-n-plus-one` + `perf-optimize-database` | Follow `postgres-ledger` skill (FK/composite indexes, grouped aggregates) |
| `security-validate-all-input` | class-validator DTOs AND shared zod schemas stay in sync (`packages/shared` is source of truth) |
| `security-rate-limiting` | Lives at nginx (primary) + ThrottlerGuard on auth routes; see deployment-plan §9 |
| `security-auth-jwt` | Exact design fixed: access 15m / refresh 7d httpOnly cookie, argon2id, lockout — see CLAUDE.md stack |
| `api-versioning` | Single `/api/v1` prefix; no version negotiation machinery |
| `api-use-pipes` / `dto-serialization` | Global ValidationPipe + interceptor-based envelope `{ data, meta? }`; controllers return entities/DTOs only |
| `micro-*` category | Not applicable — single deployable monolith; health check exists (`/api/v1/health`); skip queues/patterns unless a DEC entry adds them |
| `devops-use-config-module` | ConfigModule + `.env.example` contract mandatory; secrets via GitHub Environments → VM `.env` (never committed) |
| `devops-graceful-shutdown` | `app.enableShutdownHooks()` so compose stop drains in-flight $transactions |
| `devops-use-logging` | Structured JSON logging; no console.log in committed code |
| `test-*` rules | Subordinate to `test-driven-development` skill (failing test first) and task-breakdown AC coverage |

Anything not overridden follows upstream as written. When a rule and CLAUDE.md non-negotiables collide, CLAUDE.md wins — log it via `/req` if the collision is non-obvious.
