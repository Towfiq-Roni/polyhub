---
name: postgres-ledger
description: Use when writing or reviewing Prisma schemas, raw SQL, migrations, indexes, or aggregate queries in this repo — especially ledger sums (ΣIN/ΣOUT), receivables/payables rollups, dashboard aggregates, and filtered/paginated lists. Adapted from github/awesome-copilot postgresql-optimization; trimmed to what applies to hub's PostgreSQL 16 + Prisma stack.
---

# Postgres for the Hub Ledger

PostgreSQL 16 behind Prisma 6 on a small VM. Data volume is tiny (≤5 users), so the risks here are *wrong-shape* queries and missing FK indexes — not scale tuning. Curated from [github/awesome-copilot](https://github.com/github/awesome-copilot) `postgresql-optimization` (MIT).

## Non-negotiables
- All queries through Prisma (`prisma.$queryRaw` allowed for hand-tuned aggregates only, always parameterized).
- Money columns are `Int` poisha — never `Float`/`Decimal` math in SQL either.

## Index strategy (apply at schema design time)
- Every FK column used in a relation filter gets an index: `@@index([projectId])`, `@@index([milestoneId])`, etc.
- Ledger hot path: `Transaction @@index([accountId, date])`, `@@index([direction])`, plus each optional ref FK (`projectId`, `teamMemberId`, `bdsPartnerId`, `milestoneId`).
- Partial indexes where a status filter dominates: e.g. unpaid costs `@@index([projectId])` + query `where paid = false`.
- Composite order matters: equality columns first, then range/sort (`date`) last.
- Audit unused indexes post-MVP: `pg_stat_user_indexes WHERE idx_scan = 0`.

## Aggregates & rollups
- Prefer single grouped queries over N+1 per-entity sums: balance rollup =
  `groupBy(['accountId'])` with `_sum` on amount filtered by direction, or one `$queryRaw` with `FILTER (WHERE direction = 'IN')`.
- Derived balances/receivables are computed per request (invariant L1) — keep them in ONE shared service function; never scatter ad-hoc sums across controllers.
- Window functions via `$queryRaw` when needed (running totals in reports): `SUM(amount) OVER (PARTITION BY accountId ORDER BY date)`.

## Pagination & filtering (spec §23)
- Offset pagination (`skip/take`) is fine at this scale; switch to cursor (`cursor: { id }`, ordered by unique `id`) only if a list ever exceeds ~10k rows. Mark such a choice with a `ponytail:` comment.
- Text search: case-insensitive `contains` (Prisma → `ILIKE '%q%'`) is acceptable now; `pg_trgm` GIN index is the upgrade path if search ever feels slow.

## Prisma pitfalls checklist
- [ ] No N+1: relations fetched via `include`/`select` in the same call, verified against query logs
- [ ] Financial mutations wrapped in one `prisma.$transaction([...])` (hub-ledger L2)
- [ ] Migrations forward-only; no destructive column drops without DEC entry
- [ ] `EXPLAIN (ANALYZE, BUFFERS)` run on any hand-written aggregate before merge
- [ ] Connection count stays tiny: default pool size fine; do NOT add pgbouncer at this scale (ponytail: unnecessary)

## Maintenance (deployment-plan alignment)
- Nightly backup already dumps DB; monthly restore drill validates it.
- Autovacuum defaults suffice at this volume; check `pg_stat_user_tables` dead tuples if reports ever lag.
