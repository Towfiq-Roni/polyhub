# ADR-0003: Datastore — PostgreSQL 16

## Status
Accepted

## Context
ERD §4 defines ~26 relational entities with 30+ foreign-key relationships, all using a RESTRICT-everywhere delete convention (ERD §1.4) that depends on real referential integrity being enforced by the database, not just application code. The double-entry ledger's core invariant — `Σdebit = Σcredit` per JournalEntry, and every payment/cost write being atomic (F-18 through F-22) — needs real multi-statement transactions.

## Decision
Use PostgreSQL 16 as the sole datastore.

## Consequences
- Real FK constraints enforce ERD §4's cardinality/on-delete rules at the database level, not just in application code that could be bypassed by a direct query or a future bug.
- ACID transactions directly support CLAUDE.md's non-negotiable rule 3 (one payment ⇒ exactly one transaction, same DB transaction) and F-18-F-22's atomicity requirements.
- Integer columns hold money as poisha (CLAUDE.md rule 1) — no native decimal/float type is ever used for money, sidestepping floating-point drift entirely.
- Requires running and backing up a separate database process (addressed by ADR-0007's deployment decision), rather than a zero-process embedded option.

## Alternatives considered
- **SQLite (single file):** zero-ops simplicity, but weaker concurrent-write guarantees under Node's connection-pooling patterns, and no separate process to isolate database crashes from the API process — a meaningfully higher risk for a system whose entire value proposition is financial-ledger correctness.
- **MongoDB (document store):** no native FK/relational integrity — a poor fit for ERD's dense RESTRICT-everywhere FK graph and the ledger's referential-correctness requirements; would require re-implementing referential integrity in application code that PostgreSQL gives for free.

## Related
ERD §4 (entity/FK model), §1.4 (delete convention); CLAUDE.md non-negotiable rules 1, 3; F-18 through F-22
