# Development Plan

> Companion to `requirements-analysis.md`. Covers *how* we build: architecture, standards, tooling, testing, Dockerization, CI/CD. Deployment target specifics live in `deployment-plan.md`.

---

## 1. Locked Stack

| Layer | Choice | Version baseline | Rationale |
|---|---|---|---|
| Language | TypeScript (strict) everywhere | TS 5.x | One language across stack; `packages/shared` shares types/schemas |
| Frontend | Next.js (App Router, RSC) + TailwindCSS + shadcn/ui + Serwist PWA | Next 15.x | SSR-by-default per requirement; PWA installable on mobile |
| State/data | TanStack Query + server components/fetch | v5 | Minimal client state; forms via react-hook-form + zod |
| Backend | NestJS REST API | Nest 11 | Structured modules/DI/guards; mature auth patterns |
| ORM/DB | Prisma → PostgreSQL | Prisma 6 / PG 16 | Typed data access, first-class migrations |
| Auth | JWT access+refresh, argon2id hashes | @nestjs/jwt, argon2 | No external auth dependency (self-hosted posture) |
| Validation | Zod schemas in `packages/shared`, class-validator DTOs at edge | zod 3 | Single source of truth for contract types |
| Docs | OpenAPI (Swagger) auto from Nest | — | Feeds typed frontend client |
| Runtime | Node 22 LTS inside Docker (node:22-alpine base) | — | Matches ARM64 images |

## 2. System Architecture

```text
                    ┌──────────────── Oracle Always Free VM ────────────────┐
Browser ──HTTPS──►  │ nginx :443                                            │
   │                │  ├── /          → web   (Next.js container :3000)     │
   │                │  ├── /api/*      → api   (NestJS container :4000)     │
   │  PWA assets    │  ├── /files/*    → volume (X-Accel-Redirect internal) │
   │  cached by SW  │  └──────────────── postgres (internal net only :5432) │
   ▼                └───────────────────────────────────────────────────────┘
Service Worker (serwist): app-shell + static cache; API calls network-first w/ offline banner
```

- **Single origin** — no CORS anywhere.
- File downloads: browser → `/api/v1/resources/:id/download` → NestJS RBAC check → `X-Accel-Redirect: /files/<path>` → nginx streams bytes. Files never publicly reachable.
- All inter-container traffic on a private Docker network; only nginx publishes ports.

## 3. Monorepo Layout

```text
hub/
├── apps/
│   ├── api/                      # NestJS
│   │   ├── src/
│   │   │   ├── main.ts           # bootstrap, global pipes, swagger
│   │   │   ├── app.module.ts
│   │   │   ├── common/           # guards, interceptors, filters, decorators
│   │   │   ├── modules/
│   │   │   │   ├── auth/         # login, refresh, logout, me
│   │   │   │   ├── users/ roles/ permissions/
│   │   │   │   ├── teams/ team-members/
│   │   │   │   ├── clients/ leads/ opportunities/
│   │   │   │   ├── bds-partners/
│   │   │   │   ├── projects/ milestones/ deliverables/ resources/
│   │   │   │   ├── finance/      # accounts, transactions, categories
│   │   │   │   ├── payments/     # client, team-member, bds payments
│   │   │   │   ├── dashboard/ reports/ audit/ settings/
│   │   │   └── prisma/           # PrismaService, seeds
│   │   ├── prisma/schema.prisma  # single source of DB truth
│   │   ├── test/                 # e2e (supertest)
│   │   └── Dockerfile
│   └── web/                      # Next.js
│       ├── app/                  # (dashboard)/... route groups per module
│       ├── features/             # module-scoped components/hooks/api-clients
│       ├── lib/                  # fetcher, auth context, permissions hook
│       ├── public/manifest.*     
│       └── Dockerfile
├── packages/
│   └── shared/                   # zod schemas, enums/status maps, permission keys,
│                                  # money helpers (BDT formatting), API route constants
├── infra/
│   ├── docker-compose.prod.yml   # nginx + web + api + postgres (+backup cron)
│   ├── docker-compose.dev.yml    # postgres only for local dev
│   ├── nginx/nginx.conf
│   └── scripts/deploy.sh
├── .github/workflows/            # ci.yml · deploy.yml · keepalive.yml
├── pnpm-workspace.yaml
├── package.json                  # root scripts: dev, lint, typecheck, test, build
└── .env.example
```

**Rules:** apps never import across `apps/*`; everything shared goes through `packages/shared`. Permission keys and status enums are defined once there and consumed by both UI (hide/disable) and API (enforce).

## 4. API Design Conventions

- Base path `/api/v1`; resources plural kebab-case (`/team-members/:id/payments`).
- Response envelope: `{ data, meta? }`; errors: `{ statusCode, message, error }` via global exception filter.
- Pagination: `?page=&limit=&sort=&q=` standard params; `meta { total, page, limit }`.
- Money: integers (poisha ×100) end-to-end; formatted only at render.
- Mutating endpoints return the fresh entity; side-effecting payment endpoints also return created transaction id.
- Every write endpoint declares required permission(s); guard denies by default.

### AuthN/AuthZ flow
1. `POST /auth/login` → `{accessToken(15m), refreshToken(httpOnly cookie,7d)}`.
2. Global `JwtAuthGuard`; `@RequirePermissions('projects.create')` → `PermissionsGuard` loads union of active-role keys (cached per token).
3. SUPER_ADMIN bypasses checks but is still audit-logged.
4. Refresh rotation + revocation on logout/password change.

## 5. Coding Standards

- **TypeScript strict**, no `any` without eslint-disable justification; `unknown` + narrowing preferred.
- **ESLint** (typescript-eslint, next/core-web-vitals, prettier as arbiter) — zero warnings policy in CI.
- Naming: files kebab-case; classes PascalCase; DB snake_case via Prisma `@map`; enums UPPER_SNAKE values matching spec text (`PARTIALLY_PAID`).
- Modules vertical-sliced (module folder owns controller/service/dto/tests).
- No business logic in controllers or raw SQL outside Prisma except hand-tuned aggregates.
- Financial mutations **must** run inside one Prisma `$transaction` — enforced by code review checklist + e2e test per flow (L2 invariant).
- Comments only where *why* is non-obvious; ADRs (short markdown in `docs/adr/`) for decisions like F-8 immutability.

## 6. Testing Strategy

| Level | Tool | Scope | Gate |
|---|---|---|---|
| Unit | Jest (api), Vitest (web/shared) | Services, money math, status transitions, permission unions | ≥80% lines on finance & milestone logic; others best-effort |
| API e2e | Supertest + ephemeral PG (testcontainers) | Full request→DB flows incl. atomicity: partial payments, reversals, RBAC denials | Must pass on PR |
| Web e2e smoke | Playwright | Login → dashboard → record milestone payment happy path | Nightly + pre-deploy |
| Contract | OpenAPI diff check | Breaking-change detection vs `packages/shared` schemas | PR gate |

Test-data rule: fixtures mirror spec §20 worked example (Project A ৳500,000 / M1–M4) so financial outputs are assertable against documented numbers.

## 7. Git Workflow

- **GitHub Flow**: trunk = `main`, short-lived feature branches (`feat/milestone-payment-entry`), squash-merge via PR.
- Branch protection: PR required, CI green required, no force-push.
- Conventional Commits (`feat:`, `fix:`, `chore:`…); changelog generated from history.
- Migrations: Prisma `migrate dev` locally → committed migration files applied by deploy pipeline (`migrate deploy`) — never auto-migrate on boot.

## 8. Dockerization Standards

Per-app multi-stage Dockerfiles:

```dockerfile
# stage 1 deps (pnpm fetch) → stage 2 build (pnpm --filter build)
# stage 3 runner: node:22-alpine, non-root user, NODE_ENV=production,
# HEALTHCHECK curl /health, dumb-init entrypoint
```

- Images published multi-arch (**linux/arm64** primary, amd64 fallback) to GHCR: `ghcr.io/<org>/hub-api`, `hub-web`.
- Postgres uses official `postgres:16-alpine` with tuned shared_buffers (256MB) for the small VM.
- Compose services have healthchecks + `depends_on: condition: service_healthy`.
- Volumes: `pgdata`, `resources` (files), `certbot-etc`, `certbot-var`.
- Secrets enter containers via `.env` rendered at deploy time (see deployment plan §5); `.env` gitignored, `.env.example` documents every key.

## 9. CI/CD Design (GitHub Actions)

```text
ci.yml   (every PR)      lint → typecheck → unit tests → api e2e → build check
deploy.yml (push main)   ci steps → docker buildx (arm64/amd64) → push GHCR tags
                         :sha + :latest → SSH to VM → ./infra/scripts/deploy.sh
keepalive.yml (cron */3d) GET https://<host>/api/v1/health  (Oracle idle-reclaim guard)
```

`deploy.sh`: compose pull → `prisma migrate deploy` (via one-shot api container) → compose up -d → healthcheck poll → rollback to previous image tag on failure (documented in deployment plan).

## 10. Definition of Done (per task)

1. Code + tests merged behind its permission keys
2. Migration (if any) reviewed & reversible plan noted
3. Audit events emitted for sensitive writes
4. OpenAPI updated; shared schemas synced
5. Screens keyboard-accessible, mobile-usable, BDT-formatted amounts
6. CI fully green; e2e covers the acceptance criterion from `task-breakdown.md`
