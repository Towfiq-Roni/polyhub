# Gap Audit — Finance Module Screens

**Scope:** design/finance-dashboard.html, accounts.html, transactions.html, receivables.html,
payables.html, payment-entry.html, project-costs.html, reports.html
**Method:** read-only cross-check against analysis/requirements-analysis.md,
analysis/requirement-gaps.md, analysis/task-breakdown.md, CLAUDE.md Non-Negotiable Rules 1–4,
ADR-0011, docs/designs/REQ-33-derived-chart-of-accounts-reporting.md, DEC-064, and
docs/designs/phase0-redesign-claude-handoff-plan.md §1.
**Date:** 2026-09-08 · **Author:** hub-analyst (independent audit)

---

## Finding 1 — REQ-33 Financial Statements reporting is NOT built (lead finding)

**Severity: H**
**Screens:** `reports.html`, `finance-dashboard.html`

ADR-0011 / REQ-33 / DEC-064 / gap F-11 (all dated same-day, 2026-09-08) authorize a derived
Chart-of-Accounts reporting layer — Trial Balance, P&L, Balance Sheet — computed at query time
from `Transaction`+`Account`+`TransactionCategory`+new `LedgerAccount`, reusing
`reports.view`/`reports.export`, Balance Sheet as-of-today only. `task-breakdown.md` already
carries the Phase 5 (`LedgerAccount` seed + FK + type-compatible picker) and Phase 8
("Reports: Financial Statements...") task lines for this.

Checked both candidate screens directly:
- `reports.html`'s tab-nav (line 196-201) has exactly 4 tabs: Profitability, Cash Flow Forecast,
  Aging Analysis, Export. No "Financial Statements" tab/section exists anywhere in the file.
- `finance-dashboard.html` has KPI grid + Balance/Receivables/Payables-by-method + aging +
  income-vs-expense chart + top-projects + recent-transactions. No Trial Balance/P&L/Balance
  Sheet UI. (REQ-33 §"UI Affected" explicitly says finance-dashboard.html gets NO changes, so
  this is expected there — reports.html is the one place it's missing.)

**What's concretely missing** (per REQ-33 §UI Affected + §Dataflow):
1. A "Financial Statements" tab/section on `reports.html`, sibling to the existing 4 tabs.
2. Sub-views for Trial Balance and P&L, each with the existing period-preset control
   (This Month/This Quarter/This Year, matching the screen's existing `periodSelect` pattern) —
   grouped by `LedgerAccount` (Cash & Bank / 2 Revenue / 8 Expense / Retained Earnings /
   2 Uncategorized fallbacks), each row showing a computed debit/credit-style balance, with a
   footer proving `Equity_TB = Σopening + cumulative(Income−Expense)` balances to zero.
3. A Balance Sheet sub-view with **no period control at all** (as-of-today only, no date
   picker — a deliberate v1 scope cut per ADR-0011) showing Assets (Cash & Bank + AR) /
   Liabilities (AP) / Equity (`Equity_BS = Equity_TB + AR − AP`, a distinct formula from
   Trial Balance's equity — do not reuse `Equity_TB` directly).
4. Export wiring for the new sub-views through the existing Export tab/service (`reports.export`),
   consistent with the rest of the screen — no new permission key needed.

This is not a surprise regression — REQ-33 was authorized the same day as this audit, so the
Phase 0 screens (built before it) cannot reflect it yet. Flagging as the confirmed, current,
real gap it is: the design is behind an already-authorized decision, and no other finding in
this audit should be read as higher priority than closing this one before Phase 0 sign-off
(if Phase 0 gate requires all authorized decisions reflected) or as the first Phase 8 task if
gated to build.

**Recommended default:** build the "Financial Statements" tab per REQ-33 §UI Affected exactly
as specified (already fully designed and architect-approved — nothing further to decide here,
only to build). No new options to weigh; REQ-33 already resolved Direction A vs B, hierarchy vs
flat, and Balance-Sheet scope in its Gate Notes.

---

## Finding 2 — project-costs.html has no itemized cost entry point (reconciled, not a gap)

**Severity: — (informational, not filed as a gap)**

Checked whether `project-costs.html`'s aggregate "budget vs. actual by category" view (per
phase0-redesign-claude-handoff-plan.md §1 item 10, a deliberate DECIDED replacement of the old
profitability rollup) satisfies Phase 6's "Project costs CRUD: paid ⇒ immediate OUT txn; unpaid
⇒ payable; later 'Record Payment' flips paid + OUT txn (F-9)". The screen itself has no Add/Edit
modal and no per-row paid/unpaid state — but neither do `receivables.html` or `payables.html`
(both also lack an "Add" affordance; rows there are system-generated from milestones/costs/BDS
agreements, and `payment-entry.html` is the sole manual-entry surface, consistent with Rule 3).
Unpaid project costs surface itemized in `payables.html` (vendor rows like "AWS Bangladesh",
"City Office Supplies" already appear there with Due/Overdue/Paid status and a "Mark Paid"
action). `project-costs.html` is correctly scoped as a pure aggregate analytics view, not the
itemized workflow surface. No fix recommended — noting only so it's not silently re-flagged
later.

---

## Finding 3 — Rule 2 / Rule 4 / Rule 3 checks: no violations found

**Severity: — (clean)**

Explicitly checked every screen for stored/editable-looking balances, edit/delete on posted
rows, and CoA-classifier leakage:
- `accounts.html`: Balance column has a `ponytail:` comment confirming Phase 0 display-only →
  Phase 2+ compute live `opening + ΣIN − ΣOUT` (Rule 2); Edit-Account modal shows Balance as
  read-only text with the same note; Add-Account modal only accepts opening balance (correct —
  opening balance is legitimately settable once, at creation).
- `transactions.html`: page subtitle states "Posted rows can be viewed but never edited or
  deleted... only linked reversals" (Rule 4); row actions are View-only, no Edit/Delete.
- `receivables.html` / `payables.html`: Received/Paid + Outstanding are computed-and-displayed
  only (ponytail-annotated), Edit modal only touches invoice/bill metadata (invoice #, due date,
  invoiced amount) — Received/Paid fields in the modal are non-editable displays, matching the
  handoff-plan's documented §3 fix. "Mark Paid" on payables is a script-local status flip,
  already noted acceptable in the handoff plan (not a build-representative persistence path).
- `payment-entry.html`: uses the real flat `TransactionCategory{name, direction}` tag (a
  code comment explicitly disclaims "not a chart of accounts: hub's ledger has no
  debit/credit/account-type concept" — consistent with DEC-063, correctly not reintroducing a
  fake classifier that REQ-33 would now make doubly wrong to have).
- `project-costs.html`: read-only aggregate, no mutation paths at all.

No re-reportable Rule violations found in this batch.

---

## Finding 4 — Money formatting: consistent, no issues

**Severity: — (clean)**

All 8 screens use the same `fmt(n)` pattern: `'৳' + n.toLocaleString('en-US', {
minimumFractionDigits: 2 })`, applied only at render (source data held as plain numbers in the
mock `DATA`/`ROWS`/`PERIODS` arrays — acceptable for a static Phase 0 mockup since there's no
real poisha-integer backing store yet; Rule 1's "never floats end-to-end" applies from Phase 2's
real integer-poisha columns onward, not to Phase 0 sample JS literals). `.num.data` cells are
right-aligned per the shared table CSS convention (spec §23). No hardcoded currency symbols
outside `fmt()`, no screen mixes raw numbers into the DOM unformatted.

---

## Finding 5 — Canonical shell + link integrity: clean

**Severity: — (clean)**

All 8 screens carry `.app-shell` / `.sidebar` / one `.nav-item.active` with `aria-current="page"`
correctly pointing at themselves; every internal `href="*.html"` across all 8 files resolves to
an existing file in `design/`. No dead links, no divergent shell markup.

---

## Summary

| # | Finding | Severity | Screens | Status |
|---|---|---|---|---|
| 1 | Financial Statements (Trial Balance/P&L/Balance Sheet) tab missing per REQ-33/ADR-0011/F-11 | **H** | reports.html (finance-dashboard.html correctly untouched per REQ-33 spec) | OPEN — needs build |
| 2 | project-costs.html itemization vs Phase 6 CRUD wording | — | project-costs.html | Reconciled, not a gap |
| 3 | Rule 2/3/4 (computed balance, immutable rows, real category tag) | — | accounts, transactions, receivables, payables, payment-entry, project-costs | Clean |
| 4 | Money formatting (poisha-at-render, tabular right-align) | — | all 8 | Clean |
| 5 | Canonical shell + link integrity | — | all 8 | Clean |
