# ADR-0006: Immutable posted financials, corrections via reversal

**Status:** Accepted
**Date:** 2026-08-22
**Source:** DEC-010 (gap F-8); CLAUDE.md non-negotiable rules 3–4

## Context

The original spec contradicted itself: §21.7 implied posted financial records
could be edited/deleted (permission list included `.update`/`.delete` on
transactions), while §21.4 required an audit-safe, tamper-evident ledger.
Gap F-8 in `requirement-gaps.md` names this directly: "Permission list
contradicts reversal-only principle." A real accounting ledger cannot allow
silent edits to posted entries — that's the property that makes an audit
trail meaningful in the first place.

## Decision

Posted financial rows (transactions, and by extension anything derived from
them) are **immutable** once created — no edit or delete code path exists for
them at all, not even behind a permission check. `.update`/`.delete`
permissions on financial resources apply only to draft/unposted state where
one exists. Corrections happen via a **linked reversal**: a new transaction
record with `refType = 'REVERSAL'` pointing at the original, netting its
effect through the same computed-balance mechanism (ADR-0005) rather than
mutating history.

Additionally, one payment record always produces **exactly one** Transaction,
created in the same Prisma `$transaction` block — the payment and its ledger
effect can never exist independently of each other (no orphaned payment
without a transaction, no transaction claiming to represent a payment that
doesn't exist).

## Consequences

- There is no "edit transaction" or "delete transaction" endpoint, ever —
  this must be enforced in the module/controller design itself, not just
  documented, so a future contributor can't reintroduce one by habit.
- Every correction is visible in the ledger as two entries (original +
  reversal), which is exactly the audit-trail property gap F-8 required —
  nothing about a mistake is ever invisible.
- `finance-integrity` skill's I2/I3 checks (payment⇄transaction orphan
  pairing, reversal integrity) exist specifically to catch violations of this
  ADR at test time; a finance mutation without an e2e atomicity test is a
  gate failure per CLAUDE.md guardrails, not a style preference.
- This resolves the spec contradiction in favor of audit integrity over the
  literal permission list in §21.7 — a deliberate spec deviation, logged here
  and in `requirement-gaps.md` per CLAUDE.md's "spec deviations are only
  legitimate if logged" rule.
