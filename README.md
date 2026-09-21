# Hub — Small Company Management System

Internal tool connecting **CRM → Projects/Milestones → ledger-driven Finance** with RBAC and audit trails, for a small company (≤5 users). One consistent operational and financial view — deliberately not an ERP.

> **Status:** planning & UI-design phase. No application code yet.

## Modules

- **CRM / Sales** — clients, leads, opportunities → conversion to projects
- **Projects** — ordered milestones, dual work/payment statuses, deliverables, resource files
- **Organization** — teams, team members, org roles, project assignments
- **BDS Partners** — external business developers: attribution, fixed compensation, payouts
- **Finance** — accounts, transaction ledger (balances always computed), receivables, payables, project costs
- **Administration** — users, roles, granular permissions, audit logs

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router) + PWA (Serwist), Tailwind + shadcn/ui |
| Backend | NestJS 11 REST API |
| Database | PostgreSQL 16 via Prisma 6 |
| Auth | JWT (access + refresh), argon2id |
| Hosting | Docker Compose on Oracle Always Free ARM VM behind nginx · `$0` recurring cost |
| CI/CD | GitHub Actions → GHCR → SSH deploy |

## Repository Layout

```text
resources/    original project spec (source of truth for WHAT)
analysis/     requirements analysis, gaps, dev & deployment plans, task breakdown
docs/
  memory/     PROGRESS.md (live phase status) · DECISIONS.md (append-only log)
  designs/    requirement design documents (design-first intake)
  blueprints/ implementation patterns distilled from gated code
  agentic/    agent development procedures
.claude/      agents, commands, skills powering the agentic workflow
```

## Documentation

Start with `CLAUDE.md`, then:

1. [`analysis/requirements-analysis.md`](analysis/requirements-analysis.md) — what we're building and why
2. [`analysis/task-breakdown.md`](analysis/task-breakdown.md) — phased plan with acceptance criteria
3. [`docs/memory/PROGRESS.md`](docs/memory/PROGRESS.md) — where we currently are

## Core Principles

1. Finance is ledger-driven — balances are computed (`opening + ΣIN − ΣOUT`), never stored
2. Work status and payment status are independent — payment never blocks the next milestone
3. All payments are manual, each creating exactly one immutable transaction (corrections = reversals)
4. Access is allow-only RBAC; every sensitive write is audited
