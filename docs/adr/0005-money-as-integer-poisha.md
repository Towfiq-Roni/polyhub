# ADR-0005: Money as integer poisha, computed balances

**Status:** Accepted
**Date:** 2026-08-22
**Source:** DEC-013; CLAUDE.md non-negotiable rules 1–2

## Context

Hub's ledger core needs to be accounting-correct: no rounding drift across
thousands of small entries, no stored value that can silently diverge from
what the entries actually sum to. Floating-point currency arithmetic is a
well-known correctness hazard (0.1 + 0.2 problems compounded over years of
transactions); a stored "balance" column is a second hazard, because it can be
mutated out of sync with the transactions that are supposed to justify it.

## Decision

- All money is represented as an **integer count of poisha** (1 taka = 100
  poisha) end-to-end — in the database, in API payloads, in business logic.
  Floats are never used for money at any layer.
- The ৳ symbol and decimal formatting are applied **only at render time**
  (UI display, export files) — never stored, never used in comparisons.
- **Balances are always computed**, never stored as a mutable field:
  `balance = opening + ΣIN − ΣOUT`, recomputed from the transaction log on
  every read. No schema may ever have a `balance` column that isn't derived.

## Consequences

- Every money-bearing computation must aggregate transactions rather than
  read a cached number — this is what `postgres-ledger` skill's guidance on
  grouped ledger aggregates (vs. N+1 per-row lookups) exists to make
  performant at read time.
- No reconciliation bugs between "the balance says X" and "the transactions
  sum to Y" are structurally possible, because there is only one source of
  truth (the transaction log) — this is also why ADR-0006 (immutable ledger,
  reversal-only corrections) is the natural partner decision.
- Every finance-path change must be tested for this invariant specifically;
  `finance-integrity` skill's I1 check (balance recomputation SQL) exists to
  make this a runnable, not just a reviewed, guarantee.
- Display code (web app, exports) carries the sole responsibility for
  correct ৳ formatting and must never be the place money math happens.
