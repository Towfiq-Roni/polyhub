# Tasks

> Single source of truth for all agentic work in this repo. `/agentic-harness:architect` reads
> this before planning; `/agentic-harness:manager` and `/agentic-harness:epics` append new
> tasks here — every task must cite the business goal (from `planning/BUSINESS_GOALS.md`) it
> serves, and, if it came from the planning phase, its `[E-##/F-##]` trace tag; a task serving
> no goal doesn't get queued without an explicit reason. Any enabled tool-mirror skill (see
> `planning/project.config.yaml`'s `tools:` block, e.g. `/agentic-harness:clickup-log`) mirrors
> every write to the external tracker, scoped to rows dated `tools.<name>.mirror_from_date`
> onward — no backfill.

_Last updated: 2026-09-14 (tasks #41+#42 completed — full quality chain PASS, dev+prod infra live; #39/#40/#43/#44 still open)_

## Status legend
⏳ TODO · 🔄 IN_PROGRESS · ✅ DONE (tests passing) · ⚠ BLOCKED · ❌ FAILED

A task only reaches ✅ DONE once its tests pass — see `architect.md` Phase 3.

## Source convention
`Manager YYYY-MM-DD` (from /agentic-harness:manager) · `Planning YYYY-MM-DD` (seeded by /agentic-harness:epics) · `User YYYY-MM-DD` (direct ask) · `Auto YYYY-MM-DD` (self-queued)

## Priority
🔴 FAIL-level / urgent · 🟡 WARNING-level / soon · 🟢 nice-to-have

## Sprint
Only meaningful if `planning.delivery_mode: sprint_weekly` (see
`planning/project.config.yaml`); a task's epic's assigned sprint number, or
`—` if this project delivers as a whole (`single_batch`) or the row didn't
come from planning. `/agentic-harness:architect` defaults its execution
scope to the active sprint when this column is in use.

| # | Task | Goal | Source | Priority | Sprint | Status | Agent | Started | Completed |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Auth module: login, JWT access(1d)/refresh(7d), argon2id, lockout [E-07/F-27] | Financial traceability | Planning 2026-09-10 | 🔴 | — | ✅ DONE | hub-planner→hub-implementer→hub-reviewer→hub-tester→hub-code-reviewer→hub-gatekeeper | 2026-09-13 | 2026-09-13 |
| 2 | User CRUD + activate/deactivate + admin-mediated reset [E-07/F-28] | Financial traceability | Planning 2026-09-10 | 🔴 | — | ⏳ TODO | — | — | — |
| 3 | Role CRUD + permission catalog (packages/shared) [E-07/F-29] | Financial traceability | Planning 2026-09-10 | 🔴 | — | ⏳ TODO | — | — | — |
| 4 | PermissionsGuard (allow-only union) + sensitive-action permission split [E-07/F-29] | Financial traceability | Planning 2026-09-10 | 🔴 | — | ⏳ TODO | — | — | — |
| 5 | Super Admin invariant enforcement (422 on last-active-removal) [E-07/F-30] | Financial traceability | Planning 2026-09-10 | 🔴 | — | ⏳ TODO | — | — | — |
| 6 | Audit interceptor + AuditLog + audit log screen [E-07/F-31] | Financial traceability | Planning 2026-09-10 | 🔴 | — | ⏳ TODO | — | — | — |
| 7 | Settings screen (chart-of-accounts management surface, system preferences) [E-07/F-32] | Operational visibility | Planning 2026-09-10 | 🟡 | — | ⏳ TODO | — | — | — |
| 8 | Client CRUD + search/filter/sort/pagination [E-01/F-02] | Operational visibility | Planning 2026-09-10 | 🟡 | — | ⏳ TODO | — | — | — |
| 9 | Lead CRUD + server-enforced status flow [E-01/F-03] | Operational visibility | Planning 2026-09-10 | 🟡 | — | ⏳ TODO | — | — | — |
| 10 | Opportunity CRUD + server-enforced stage flow [E-01/F-04] | Operational visibility | Planning 2026-09-10 | 🟡 | — | ⏳ TODO | — | — | — |
| 11 | BDS attribution on Lead/Opportunity, carried forward on conversion [E-01/F-05] | Operational visibility | Planning 2026-09-10 | 🟢 | — | ⏳ TODO | — | — | — |
| 12 | Opportunity→Project conversion (auto-create Client, cross-module transaction) [E-01/F-06] | Operational visibility | Planning 2026-09-10 | 🟡 | — | ⏳ TODO | — | — | — |
| 13 | Team CRUD, teams.* permission-gated [E-03/F-12] | Operational visibility | Planning 2026-09-10 | 🟡 | — | ⏳ TODO | — | — | — |
| 14 | Team Member CRUD (primary + secondary team membership) [E-03/F-13] | Operational visibility | Planning 2026-09-10 | 🟡 | — | ⏳ TODO | — | — | — |
| 15 | Project Assignment (both-direction queries) [E-03/F-14] | Operational visibility | Planning 2026-09-10 | 🟡 | — | ⏳ TODO | — | — | — |
| 16 | BDS Partner CRUD [E-04/F-15] | Operational visibility | Planning 2026-09-10 | 🟡 | — | ⏳ TODO | — | — | — |
| 17 | BDS Compensation (fixed/percentage, lock-after-first-payment) + partner detail rollup [E-04/F-16] | Financial traceability | Planning 2026-09-10 | 🟡 | — | ⏳ TODO | — | — | — |
| 18 | Project CRUD + auto-coding + overview aggregation [E-02/F-07] | Operational visibility | Planning 2026-09-10 | 🟡 | — | ⏳ TODO | — | — | — |
| 19 | Milestone CRUD + reorderable sequence + dual independent status machines (backend) [E-02/F-08] | Operational visibility | Planning 2026-09-10 | 🟡 | — | ⏳ TODO | — | — | — |
| 20 | Milestone frontend screens (list + detail, both status chips) [E-02/F-08] | Operational visibility | Planning 2026-09-10 | 🟡 | — | ⏳ TODO | — | — | — |
| 21 | Deliverable CRUD + submit/review/approve/reject workflow [E-02/F-09] | Operational visibility | Planning 2026-09-10 | 🟡 | — | ⏳ TODO | — | — | — |
| 22 | Milestone completion gating + milestones.complete_override permission [E-02/F-10] | Operational visibility | Planning 2026-09-10 | 🟡 | — | ⏳ TODO | — | — | — |
| 23 | Project/milestone search, filter, sort, pagination [E-02/F-11] | Operational visibility | Planning 2026-09-10 | 🟢 | — | ⏳ TODO | — | — | — |
| 24 | Chart of accounts seed + admin add/deactivate [E-05/F-17] | Financial traceability | Planning 2026-09-10 | 🔴 | — | ⏳ TODO | — | — | — |
| 25 | JournalEntry/JournalLine schema + balanced-posting service [E-05/F-18] | Financial traceability | Planning 2026-09-10 | 🔴 | — | ⏳ TODO | — | — | — |
| 26 | Client milestone payment posting (backend, atomic transaction) [E-05/F-18] | Financial traceability | Planning 2026-09-10 | 🔴 | — | ⏳ TODO | — | — | — |
| 27 | Client milestone payment entry screen [E-05/F-18] | Financial traceability | Planning 2026-09-10 | 🔴 | — | ⏳ TODO | — | — | — |
| 28 | Team-member payment posting (backend + frontend) [E-05/F-19] | Financial traceability | Planning 2026-09-10 | 🔴 | — | ⏳ TODO | — | — | — |
| 29 | BDS payment posting (backend + frontend) [E-05/F-20] | Financial traceability | Planning 2026-09-10 | 🔴 | — | ⏳ TODO | — | — | — |
| 30 | Project cost recording, paid/unpaid (backend + frontend) [E-05/F-21] | Financial traceability | Planning 2026-09-10 | 🔴 | — | ⏳ TODO | — | — | — |
| 31 | Journal entry reversal (backend + frontend) [E-05/F-22] | Financial traceability | Planning 2026-09-10 | 🔴 | — | ⏳ TODO | — | — | — |
| 32 | Receivables & Payables computed engine [E-06/F-23] | Financial traceability | Planning 2026-09-10 | 🔴 | — | ⏳ TODO | — | — | — |
| 33 | Project financial summary view [E-06/F-24] | Financial traceability | Planning 2026-09-10 | 🔴 | — | ⏳ TODO | — | — | — |
| 34 | Trial balance / P&L computation [E-06/F-25] | Financial traceability | Planning 2026-09-10 | 🔴 | — | ⏳ TODO | — | — | — |
| 35 | Balance sheet (distinct equity formula, algebraically verified) [E-06/F-25] | Financial traceability | Planning 2026-09-10 | 🔴 | — | ⏳ TODO | — | — | — |
| 36 | Financial Statements screen (reports.html tab) [E-06/F-25] | Financial traceability | Planning 2026-09-10 | 🔴 | — | ⏳ TODO | — | — | — |
| 37 | Financial list filtering [E-06/F-26] | Financial traceability | Planning 2026-09-10 | 🟡 | — | ⏳ TODO | — | — | — |
| 38 | Dashboard aggregation (financial + operational + attention) + screen [E-08/F-01] | Operational visibility | Planning 2026-09-10 | 🟡 | — | ⏳ TODO | — | — | — |
| 39 | Repo tooling: ESLint+Prettier+husky/lint-staged+commitlint (Phase 1, `analysis/task-breakdown.md`) | Reduced tool sprawl | User 2026-09-13 | 🔴 | — | ⏳ TODO | — | — | — |
| 40 | `apps/web` bootstrap: Next.js App Router shell, Serwist PWA (manifest/SW/install), Tailwind+shadcn base, tokens.css→Tailwind theme (Phase 1) | Reduced tool sprawl | User 2026-09-13 | 🔴 | — | ⏳ TODO | — | — | — |
| 41 | Dev infra: `infra/docker-compose.dev.yml` full containerized parity — `api`+`nginx`+`postgres` (dev stage w/ hot-reload, self-signed dev cert), not just Postgres (Phase 1, scope expanded per DEC-086) | Reduced tool sprawl | User 2026-09-14 | 🔴 | — | 🔄 IN_PROGRESS | hub-planner→hub-implementer | 2026-09-14 | — |
| 42 | Prod infra: multi-stage Dockerfiles (api/web, arm64+amd64) + multi-level docker-compose (base+dev+prod overlays) + nginx conf + Makefile prod targets (Phase 1) | Reduced tool sprawl | User 2026-09-13 | 🔴 | — | ✅ DONE | hub-planner→hub-implementer→hub-reviewer→hub-tester→hub-code-reviewer→hub-gatekeeper | 2026-09-13 | 2026-09-14 |
| 43 | CI/CD: GitHub Actions `ci.yml` (lint→typecheck→unit→e2e) + `deploy.yml` (GHCR push→SSH deploy→smoke→rollback) (Phase 1) | Reduced tool sprawl | User 2026-09-13 | 🟡 | — | ⏳ TODO | — | — | — |
| 44 | Oracle VM live deploy: sslip.io HTTPS, backups→B2 cron, keepalive workflow (Phase 1) — needs stakeholder's real Oracle Cloud/B2/DNS access + explicit go-ahead before starting, separate from repo-side config | Reduced tool sprawl | User 2026-09-13 | 🟡 | — | ⏳ TODO | — | — | — |

## Completed Tasks

| # | Task | Completed | Notes |
|---|---|---|---|
| 1 | Auth module: login, JWT access(1d)/refresh(7d), argon2id, lockout [E-07/F-27] | 2026-09-13 | Full quality chain (Plan→Build→Review→Test→CodeReview→Gate), all PASS/CLEAN. Grew beyond the original scope during Build: per-device session revocation (DEC-078, supersedes the build spec's original stateless-refresh design), rate-limiting on login (spec-mandated, initially dropped then caught by Stage B), a lost-update race condition in the lockout counter (found by Stage C, fixed via atomic SQL), Swagger docs + logging/index cleanup (Stage D BLOCKERs). See `docs/agentic/build-specs/2026-09-13-auth-module.md` and DEC-076..080. |
| 41+42 | Dev+prod infra: multi-level docker-compose (base+dev+prod), Makefile, apps/api Dockerfile, nginx, deploy/smoke scripts | 2026-09-14 | Full quality chain, 3 rule-audit cycles + 3 gatekeeper cycles (all the REROUTEs were documentation-only — real deviations reasoned correctly at build time but not logged in DECISIONS.md until caught; no re-BUILD needed for any of them). Real bugs found+fixed during Stage C: nginx missing `networks: [hub-net]` (whole stack broken), `env_file`/Makefile convention mismatch, Prisma CLI stripped from the prod runtime image by `--prod` install, and argon2's prebuilt binary segfaulting under Node 20.x (root-caused via direct experiment after an initial DNS-order fix proved a no-op — fixed by bumping to `node:22-alpine`, verified 5/5 cold builds twice). See `docs/agentic/build-specs/2026-09-13-infra-dev-prod.md` and DEC-081..084. Restored to the backlog after DEC-081 found the harness-seeded epics never carried an infra epic at all. |

## Manager Run History

_(none yet)_
