# ADR-0013: Full double-entry general ledger is hub's financial system of record (supersedes ADR-0011)

**Status:** Accepted
**Date:** 2026-09-13
**Source:** DEC-068 (2026-09-10); `planning/BRD.md` v1.3 §6.6 FR-FIN-01..16; `planning/SRS.md` §3.6 FR-FIN-01..16, Appendix B item 1; `planning/ERD.md` §3.18–3.20

## Context

ADR-0011 (2026-09-08) deliberately kept hub's simple `Transaction`/`Account` (IN/OUT direction, computed balance) ledger as sole system of record, adding Chart-of-Accounts-style reporting (trial balance, P&L, balance sheet) only as a **read-only derived view** — explicitly rejecting a full double-entry write path ("Direction A") because the confirmed driver at the time was internal accrual-visibility preference, not an external compliance/audit/lender requirement, and a second ledger system of record would add dual-write risk and rewrite most of Phase 0's 33 already-built screens for a need that didn't seem to require that weight.

Two days later, while drafting `planning/BRD.md` through the agentic-harness planning pipeline's BRD stage — run in parallel to hub's own established `/req` design-intake process, not through it (flagged to the stakeholder at the time as a rigor gap, since ADR-0011 itself took two `hub-solution-architect` review cycles to get right) — the stakeholder stated directly: *"Full double-entry accounting is not out of scope. It is required,"* confirmed on follow-up as *"Replace v1's simple IN/OUT ledger with full double-entry."* This is an explicit reversal of ADR-0011's Decision, made knowingly and with the original tradeoffs re-explained.

`planning/BRD.md` v1.3, `planning/SRS.md` v1.1 (§3.6), and `planning/ERD.md` v1.0 (§3.18–3.20) have since fully elaborated the double-entry model technically and been approved. `TASKS.md` (seeded 2026-09-10, DEC-074) already carries 8 Finance tasks (#24–31) built directly on this model. This ADR is the formal architecture-grade record DEC-068 itself named as still outstanding — "blocking before build starts on Finance" — closing that gap before any of TASKS.md's Finance epic (E-05) work begins.

## Decision

Hub's financial system of record is a **full double-entry general ledger**, not a derived read-model over a single-sided transaction log.

- **`Account`** (chart-of-accounts row): typed `Asset | Liability | Equity | Revenue | Expense`. Money-holding accounts (cash, bank, mobile financial accounts) are ordinary Asset-type `Account` rows — no separate "money account" table. Seeded, admin-manageable (add/deactivate, never hard-delete) via `settings.update` — no hierarchy (`parentId` considered and dropped as speculative, same call ADR-0011 already made and this ADR does not revisit).
- **`JournalEntry`** + **`JournalLine`**: every financial event posts one balanced `JournalEntry` (Σdebits = Σcredits) composed of ≥2 `JournalLine` rows, each one debit or credit leg against exactly one `Account`. This is the GL's atomic unit and the sole write path for money movement.
- **No free-form manual entry.** FR-FIN-16: every `JournalEntry` traces to exactly one system-defined business event — milestone payment, team-member payment, BDS payment, paid project cost, reversal, or the one-time per-`Account` opening-balance event. There is no UI or API path that accepts an arbitrary user-typed debit/credit pair, at any permission level, including Super Admin. This is narrower than ADR-0011's "no general-ledger write path" — that boundary is now crossed by design, but the "no free-form entry" discipline ADR-0011 and DEC-061 both cared about is preserved at the event-type level.
- **Posting patterns** (FR-FIN-04/06/07/08, all inside the same Prisma `$transaction` as the record they back, per CLAUDE.md rule 3):
  - Milestone payment: Debit money `Account`, Credit Revenue/Receivable `Account` as applicable.
  - Team-member payment: Debit "Team Member Payment" Expense, Credit money `Account`.
  - BDS payment: Debit "BDS Payment" Expense, Credit money `Account`.
  - Project cost, paid at creation: Debit cost-category Expense, Credit money `Account`. Unpaid: no `JournalEntry` at creation — a computed Payable line until paid.
  - Account opening balance: posted once at `Account` creation, Debit money `Account` / Credit a system-seeded, non-deletable `Retained Earnings` Equity row — never directly selectable on any payment/cost entry.
- **Reversal only, never edit/delete** (FR-FIN-12, CLAUDE.md rule 4): a posted `JournalEntry` is corrected exclusively by a new `JournalEntry` with `refType='REVERSAL'`/`reversalOfId` pointing at the original, every line's direction flipped (same accounts, same amounts, debit↔credit). No `UPDATE`/`DELETE` path exists against a posted `JournalEntry` or `JournalLine`, at any permission level.
- **Everything computed at query time, never stored** (FR-FIN-03/09/10/14, CLAUDE.md rule 2): account balance, company balance, receivables, payables, trial balance (always balances to zero by FR-FIN-02's construction), P&L, balance sheet — all pure aggregation over posted `JournalLine`s (plus `Milestone`/`ProjectCost`/`BDSCompensation` for the receivables/payables engines). No stored mutable balance field anywhere.
- **Balance Sheet stays as-of-today only in v1** — the same scoping limit ADR-0011 already carried, unchanged: a historical point-in-time Balance Sheet needs the Receivables/Payables engine to gain as-of-date capability first.

## Consequences

- **ADR-0011 is superseded**, not amended — its Decision (derived-only reporting, no second ledger, `LedgerAccount` as a lightweight seeded reference table distinct from money-holding `Account`) is replaced wholesale by a real `JournalEntry`/`JournalLine` write path. ADR-0011's file stays as historical record per this repo's ADR convention (superseded record links back, old Status line updated).
- **ADR-0005** (money as integer poisha) is **unaffected** — every `JournalLine` amount is still integer poisha.
- **ADR-0006** (immutable ledger + reversals) is **reinterpreted at the journal-entry level, not superseded** — "posted financial rows are immutable, corrections are linked reversals" now means `JournalEntry`/`JournalLine`, where it previously meant `Transaction`.
- **CLAUDE.md rules 2–4 updated same session** to describe the `JournalEntry`/`JournalLine`/chart-of-accounts model directly, replacing the `opening + ΣIN − ΣOUT` / "one Transaction per payment" language that described ADR-0011/pre-reversal hub.
- **Phase 0's already-built `design/` screens** (payment-entry.html, accounts.html, receivables.html, payables.html, finance-dashboard.html, reports.html) were built against the simple-ledger model and will need a finance-mockup rework pass before or alongside the Phase 1+/TASKS.md Finance build (E-05/E-06, tasks #24–37) — tracked as `planning/DESIGN.md`'s pending finance screen delta (SRS Appendix B item 3), not newly introduced by this ADR.
- **Real dual-write-risk tradeoff, now accepted rather than avoided**: every payment/cost mutation must atomically write both its own record and a balanced multi-line `JournalEntry` in one `$transaction` — more moving parts per mutation than the single-`Transaction`-row model ADR-0011 chose specifically to avoid. This is the cost the stakeholder explicitly chose to accept when reversing ADR-0011.
- **`requirement-gaps.md` and `TASKS.md` already reflect this model** (DEC-071 fixed the stale out-of-scope citation; TASKS.md #24–31 were seeded directly against it) — this ADR is catching the architecture record up to decisions already operative, not authorizing new scope.

## Alternatives considered

- **Keep ADR-0011's derived-reporting model (status quo):** rejected — directly overridden by explicit, twice-confirmed stakeholder direction (DEC-068), not a technical failing of the derived approach itself.
- **Route this reversal through hub's own `/req` process** (`hub-business-analyst` → `hub-analyst` → `hub-solution-architect` → `hub-gatekeeper`), the same rigor ADR-0011 itself went through: recommended at the time, explicitly declined by the stakeholder in favor of proceeding directly through the agentic-harness BRD/SRS chain (DEC-068). This ADR, plus the already-completed `hub-solution-architect`-equivalent rigor baked into the BRD→SRS→ERD approval chain (business-rule resolutions, versioned re-approvals per DEC-070/071), is the closing step of that alternate path, not a retroactive substitute for skipping it.

## Related

DEC-068, DEC-071, DEC-074; `planning/BRD.md` §6.6; `planning/SRS.md` §3.6, Appendix B item 1; `planning/ERD.md` §3.18–3.20; ADR-0005, ADR-0006, ADR-0011 (superseded by this record); `TASKS.md` #24–37 (Finance epics E-05/E-06)
