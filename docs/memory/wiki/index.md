---
type: meta
title: Wiki Index
status: evergreen
created: 2026-09-07
updated: 2026-09-07
tags:
  - meta
  - index
---

# Wiki Index

This catalog is updated by completed knowledge operations.

## Sources

Captured 2026-09-07 from the live repo (`capture-repo-docs-tranche1`), one
immutable copy each under `.raw/captured/`. Source of truth for edits stays
the real repo path shown after each link — re-capture on drift, never edit
the captured copy.

### Requirements & Analysis

- [Deployment Plan](.raw/captured/fdfcbff6957e3e5a6e04e995eaabbfceca6c80231164be0d31eb78d923e3debc.md) — Oracle VM, sslip.io, TLS, backups, hardening runbooks. (repo: `analysis/deployment-plan.md`)
- [Development Plan](.raw/captured/2a8f1a47eab1f801b5068cff9483711a08f443bbae63309bd660ec2981375ee1.md) — Stack, architecture, conventions, testing, CI/CD design. (repo: `analysis/development-plan.md`)
- [Requirement Gaps](.raw/captured/25e6676185952b65af8621c4af6fba60a49d7f2ae40e04f6a9b451997a44ae1f.md) — All spec gaps + adopted defaults; Decision Checklist at bottom. (repo: `analysis/requirement-gaps.md`)
- [Requirements Analysis](.raw/captured/1122ec17c08e43e44aeafbd5559a35005542de93ed622b2e3b7afddb9ed393fd.md) — Distilled requirements, entity model, ERD, business rules §6–§7. (repo: `analysis/requirements-analysis.md`)
- [Task Breakdown](.raw/captured/f31c48c9ffbcabc06033311283e61fd9e12dbbdbb10c15101600094ac36a6e15.md) — Phase 0–8 task checklists (0 = HTML UI design) + acceptance criteria. (repo: `analysis/task-breakdown.md`)
- [Original Client Spec](.raw/captured/1e1859a698275301090c9d9e09f1bb4b36e76fc62d214fccbb177d921e084d3d.md) — Source-of-truth client spec for WHAT hub must do. (repo: `resources/company_management_system_project_overview.md`)

### Architecture Decision Records

- [ADR-0000: Record Architecture Decisions](.raw/captured/52d81259e54b2cf259f1d98d8472c2240e74960e5af03613691d9ac9e874f870.md) — Why hub keeps ADRs at all. (repo: `docs/adr/0000-record-architecture-decisions.md`)
- [ADR-0001: Frontend Stack](.raw/captured/fc398adcc4900ddc59829db215afce36c8e99fe8937a148e680e14a9d0975437.md) — Next.js App Router + Serwist PWA, self-hosted. (repo: `docs/adr/0001-frontend-stack.md`)
- [ADR-0002: Backend Stack](.raw/captured/b7f85699580ae9f9224751ba88e50f44e1743234d391ca47e5fc6d94427c1ba9.md) — NestJS + Prisma + PostgreSQL. (repo: `docs/adr/0002-backend-stack.md`)
- [ADR-0003: Single-VM Deployment Topology](.raw/captured/67036bf37fc2d38494a75ca091f65a9f9eded7701474c43e16d3adf233106a86.md) — Single free-tier VM deployment topology. (repo: `docs/adr/0003-single-vm-deployment-topology.md`)
- [ADR-0004: JWT + Argon2id Auth](.raw/captured/4e1f523d8f5537b3c653711c47e654e389fcceca4c5440e44b013f755558caf9.md) — JWT access/refresh auth with argon2id, no SMTP. (repo: `docs/adr/0004-jwt-argon2-auth.md`)
- [ADR-0005: Money as Integer Poisha](.raw/captured/1f348d758470c74cf078390c5940325f371ca21264c7ee36c0e6186751e12885.md) — Money as integer poisha, computed balances. (repo: `docs/adr/0005-money-as-integer-poisha.md`)
- [ADR-0006: Immutable Ledger, Reversals](.raw/captured/dd98a2da584b38e6d035302ddd5798cfe56aef14893ceac86a1bbe7e49a17f72.md) — Immutable posted financials, corrections via reversal. (repo: `docs/adr/0006-immutable-ledger-reversals.md`)
- [ADR-0007: Allow-Only RBAC](.raw/captured/8b0e2c3c9f252086ace960cbd8d910d0c1b01bcfa64a424d3f8770a5f521c5c7.md) — Allow-only RBAC, permission union over active roles. (repo: `docs/adr/0007-allow-only-rbac.md`)
- [ADR-0008: Unified Resource Model](.raw/captured/20d435d43eed23ee0a042073d455eed83ba5cfdf3ab5473a4868e33310b8568d.md) — Unified Resource table for uploads + deliverable attachments. (repo: `docs/adr/0008-unified-resource-model.md`)
- [ADR-0009: Universal Export Architecture](.raw/captured/12aafb8d9508f57b7c891d01e82ed90f386e996aaca0d6ed446a9f97480b36fa.md) — Universal list-export architecture (Excel/CSV/PDF). (repo: `docs/adr/0009-universal-export-architecture.md`)
- [ADR-0010: Enriched Error Envelope](.raw/captured/4167f2ddf4f70fc7354e64061197027b98eef2de2bc403ded03ee23d32eeed90.md) — Enriched error envelope, single global exception filter. (repo: `docs/adr/0010-enriched-error-envelope.md`)
- [ADR-0011: Derived Chart-of-Accounts Reporting](.raw/captured/844bed22b462bbc97503e869ef3759603528ebf0e2b108815a4760458cbf081a.md) — Derived Chart-of-Accounts reporting (trial balance/P&L/balance sheet), no second ledger. (repo: `docs/adr/0011-derived-chart-of-accounts-reporting.md`)
- [ADR Index](.raw/captured/5303501bf787bbcd4c1f0d8b5ea94d687889c2dda5a31d2702075ba733e7aaf8.md) — Index and scope rules for hub's Nygard-format ADRs vs. DECISIONS.md. (repo: `docs/adr/README.md`)

### Design Documents

- [Design Docs Index](.raw/captured/f1bfdf410df4b8f4c35d08df7cef10a25268bf012d70d3af533bd0b11c898212.md) — Design-first workflow rules: no build starts until design is validated + recorded. (repo: `docs/designs/README.md`)
- [REQ-32: Design Restrictions, Exports, Errors, Loop-Guardian](.raw/captured/06ef31dc078614b9b1ecd7c3cb3f487fbce5937901bea271d9642537d6757c2a.md) — VALIDATED design doc: design restrictions, universal export, error clarity, loop-guardian. (repo: `docs/designs/REQ-32-design-restrictions-exports-errors-guardian.md`)
- [REQ-33: Derived Chart-of-Accounts Reporting](.raw/captured/9a19de648cf41007fd478b27e072899fc17b73127de0012c2668b54c268bdbca.md) — VALIDATED design doc behind DEC-064 / ADR-0011. (repo: `docs/designs/REQ-33-derived-chart-of-accounts-reporting.md`)
- [Merged Design Skill Workflow](.raw/captured/1c85b23d7835dc8aa77f9ee7a7ef51042a5a7f647e6f339b4172de523964da0a.md) — How ui-ux-pro-max × design-taste-frontend × frontend-design combine for hub UI work. (repo: `docs/designs/design-skills-merge.md`)
- [Hub Design System (SUPERSEDED)](.raw/captured/a299d98429a8107973002944048e08798870b42c4d8e5ec4aa90288e19401d51.md) — Superseded by root DESIGN.md (DEC-031). (repo: `docs/designs/hub-design-system.md`)
- [Phase 0 Redesign Handoff Plan](.raw/captured/1acb3a3a4161b6f46889a91e2fc8022fe266d7ee999f9904bb925e16b4300a56.md) — Claude Design handoff → design/ rebuild plan (planning only). (repo: `docs/designs/phase0-redesign-claude-handoff-plan.md`)

### Process & Workflow

- [Hub Design System (living)](.raw/captured/44205e2a62ccb96f19797fcea08d6bd9772f9e32ef4836e61f9701e609b0170d.md) — Living design-continuity record generated from tokens.css/styles.css (DEC-031). (repo: `DESIGN.md`)
- [Hub README](.raw/captured/89b49a2fc14a76e55dd4317613788f1ac6a7f81949c185154f8a1653e2ab940b.md) — Project overview: CRM → Projects/Milestones → ledger-driven Finance. (repo: `README.md`)
- [Tasks](.raw/captured/2d02f38446a95d61175056423a28ef31255d47489fc2081ae3330b1c9f0eb5d7.md) — Single source of truth for agentic-harness work tracked in this repo. (repo: `TASKS.md`)
- [Hub Development Pipeline](.raw/captured/e378785e4a9ed48f71ef7b6e39f0ad796d1004ef03a2ba010cbeade1f4162dff.md) — Single source of truth for WHO does WHAT, in WHICH order, with WHICH skills. (repo: `Workflow.md`)
- [Agentic Development Procedures](.raw/captured/b703f85246928ff2f56ca249f8cb182398c65becf36e74a57ab644f1ba0e9edf.md) — How this repo is developed: memory-driven, invariant-gated agent loop. (repo: `docs/agentic/PROCEDURES.md`)

## Concepts

- No concepts indexed yet.

## Entities

- No entities indexed yet.

## Questions

- No questions indexed yet.
