# REQ-33: Derived Chart-of-Accounts Reporting (Trial Balance / P&L / Balance Sheet)

Source: /req "I reuire Chart of Accounts though. Did you remove it?" (clarified: "Real double-entry accounting", then narrowed through business+technical analysis to a read-only reporting layer) · Status: VALIDATED (DEC-064, 2026-09-08)

## Problem & Goal

The stakeholder wants Chart-of-Accounts-style financial reporting — a trial balance, profit & loss, and balance sheet — driven by an internal preference for accrual-basis visibility beyond hub's existing cash IN/OUT ledger view. There is no external compliance, audit, or lender requirement forcing this (confirmed during business analysis).

Earlier the same day, `design/accounting.html` (a full double-entry bookkeeping *write-path* module — Chart of Accounts + Journal Entries + Trial Balance, with manual entry) was removed for contradicting the spec's explicit "not an ERP: no double-entry accounting" non-goal (`analysis/requirements-analysis.md` §2.2, `resources/company_management_system_project_overview.md` §30; DEC-061), and `design/payment-entry.html`'s fake Chart-of-Accounts classifier was replaced with a flat `TransactionCategory` tag (DEC-063). This requirement does **not** reverse either of those decisions. It narrows the non-goal's wording: manual free-form journal-entry *posting* remains permanently out of scope; what's being added here is a **read-only derived report** over data hub already records, with zero new write path.

## Requirement (verbatim)

> "I reuire Chart of Accounts though. Did you remove it?"

Clarified, after two rounds of business/technical analysis and pushback on lighter alternatives, into: real Chart-of-Accounts/trial-balance/P&L/balance-sheet **reports**, computed from the existing ledger — not a second bookkeeping system of record. Full brief: `hub-business-analyst`'s output (2026-09-07) and `hub-analyst`'s two technical analyses (Direction A, then revised for Direction B) — not separately filed, referenced here.

## Design Decisions

1. **Direction B (derived read-model) over Direction A (JournalEntry as system of record) and full-replacement.** `Transaction`/`Account` stay the sole system of record, byte-for-byte unchanged. Chosen because the confirmed business driver is internal preference, not external compliance — a second ledger source of truth (Direction A) would add dual-write consistency risk and rewrite most of Phase 0's 33 already-built screens for no correctness benefit. *Rejected:* Direction A (JournalEntry authoritative, Transaction auto-generated) — too large for the stated MVP timing, no upside once the driver was confirmed as internal-only; full replacement of Transaction everywhere — same rejection, worse.
2. **`JournalEntry`/`JournalLine` are NOT stored tables — computed at query time** from `Transaction` + `TransactionCategory` + `LedgerAccount` + `Account`. Chosen per CLAUDE.md's YAGNI ladder step 1 (does this need to exist?) — a journal row has no independent invariant to protect; it's 100% derivable every time. *Rejected:* materializing journal rows via a background sync job — reintroduces the exact dual-write risk Direction B exists to avoid, for a report with no correctness requirement beyond "matches Transactions at query time."
3. **Category→account mapping is a single nullable FK on the existing `TransactionCategory` table** (`ledgerAccountId`), seeded for the spec §11.2 category list. Chosen because that list is fixed and small (10 categories); the field piggybacks on the TransactionCategory admin screen Phase 5 already plans (gap P-8). *Rejected:* a new admin-configurable mapping matrix screen — overbuild for 10 fixed rows.
4. **Balance Sheet is accrual-scoped**: Assets/Liabilities fold in the existing Receivables/Payables computed reports (Phase 8) as AR/AP lines, not just cash accounts. Chosen because a cash-only balance sheet trivially balances but tells the stakeholder nothing beyond what Accounts already shows. *Rejected:* cash-only scope — technically simpler but defeats the stated purpose (accrual visibility).
5. **A new ADR (0011), not an edit to ADR-0005/0006.** Those two ADRs' rationale (integer poisha, computed balance, immutable+reversal-only ledger) is completely unchanged by this requirement — they were never wrong, and don't need revision. *Rejected:* appending a note to their Consequences sections — would misleadingly suggest their original decisions needed correcting, when in fact a new capability is being layered on top of an unchanged foundation.

## Data Model Changes

> **Amended after hub-solution-architect REVISE (cycle 1, 2026-09-08)** — see Gate Notes. Changes: dropped speculative `parentId` hierarchy; enumerated the full seed list precisely (was "~10-13 rows"); added the type-compatibility validation rule (Finding 2, without it the trial-balance identity is silently forgeable); pinned the enum's home to `packages/shared`.

- **NEW `LedgerAccount`** (seeded reference data, 14 rows exactly, not user-facing CRUD in v1): `id`, `code`, `name`, `type` (enum: Asset/Liability/Equity/Revenue/Expense — lives in `packages/shared`, matching `TransactionCategory.direction`'s existing convention), `active` (bool). **No `parentId`/hierarchy in v1** — dropped per hub-solution-architect's ponytail finding (no AC needs it, contradicts this doc's own YAGNI citation); add later as a trivial additive nullable-FK migration only if hierarchy is ever actually requested. Full seed:
  - 1 **Asset**: `Cash & Bank` — aggregates all `Account` rows for the Cash leg (Cash/Bank/MFS `Account.type` values are not split further in v1; splitting is additive later if ever needed).
  - 2 **Revenue**: `Client Milestone Payment`, `Other Income` — 1:1 with the spec §11.2 Income categories.
  - 8 **Expense**: `Team Member Payment`, `BDS Payment`, `Project Cost`, `Office Expense`, `Software`, `Travel`, `Equipment`, `Other Expense` — 1:1 with the spec §11.2 Expense/Disbursement categories.
  - 1 **Equity**: `Retained Earnings` — the trial-balance plug.
  - 2 **catch-all fallbacks**: `Uncategorized Income` (Revenue type) and `Uncategorized Expense` (Expense type) — for a `TransactionCategory` that transiently has no `ledgerAccountId` (e.g. between an admin adding a custom category and mapping it). Two accounts, not one generic "Uncategorized," so the type-compatibility invariant below still holds even in the fallback case.
- **`TransactionCategory`** (existing, DEC-063): add nullable `ledgerAccountId` FK → `LedgerAccount`. Seeded for all 10 spec §11.2 categories at the same time as `LedgerAccount`'s seed (mapping directly to the 2 Revenue + 8 Expense rows above). **Validation rule (hub-solution-architect Finding 2, MAJOR):** the category admin picker (Phase 5 gap P-8 form) restricts `LedgerAccount` choices to type-compatible targets only — an Income-direction category may only map to a Revenue-type `LedgerAccount` (or `Uncategorized Income`), an Expense-direction category may only map to an Expense-type `LedgerAccount` (or `Uncategorized Expense`). Without this, an admin could map an IN-direction category to a non-Revenue account and silently break the ΔCash = NetIncome identity the whole trial balance depends on (Finding 1's fix). **Enforce at the trust boundary, not merely in the UI form** (hub-gatekeeper Finding 2, design-validation cycle 1): the check lives in the shared `packages/shared` zod schema for the category-update DTO, server-side, the same layer `TransactionCategory.direction` already validates through — not only client-side form validation, which a direct API call would bypass.
- **`Account`, `Transaction`**: byte-for-byte unchanged. No new columns, no new write path, no schema migration risk beyond the two additions above.
- No `JournalEntry`/`JournalLine` tables (Design Decision 2).

## Dataflow

Pure read path, no writes:

1. Request → `GET /finance/reports/trial-balance` (or `/profit-loss`, `/balance-sheet`), query params: period range for Trial Balance/P&L (flow reports, aggregated over the range). **Balance Sheet takes no period-range param in v1 — it is always as-of-today only** (hub-gatekeeper Finding 3, design-validation cycle 1): a Balance Sheet is conventionally a point-in-time snapshot, but the AR/AP figures it folds in (Phase 8's Receivables/Payables engine) only support current-outstanding queries, not as-of-a-past-date — pairing a historical-period Cash/Equity_TB with today's AR/AP would silently break the Assets = Liabilities + Equity_BS identity for any non-current period. Scoping v1 to today-only avoids this; historical point-in-time Balance Sheets are a future feature requiring the Receivables/Payables engine to gain as-of-date capability first, not part of this task delta.
2. Permission check: existing `reports.view` (no new key — nothing new is being posted, only viewed).
3. Query service:
   - Cash leg per `LedgerAccount`: reuse the existing L1 balance-computation service (`opening + ΣIN − ΣOUT`) summed across all `Account` rows, mapped to the single `Cash & Bank` Asset `LedgerAccount`.
   - Category leg per `LedgerAccount`: aggregate `Transaction` amounts grouped by `TransactionCategory.ledgerAccountId`, split Income/Expense per `TransactionCategory.direction`.
   - **Trial Balance / P&L equity** (Design Decision correctness proof, verified by hub-solution-architect): `Equity_TB = Σ(Account.openingBalance) + cumulative(Income − Expense)` from the category legs. Because every `Transaction` moves exactly one `Account` (cash) and exactly one `TransactionCategory` (Income XOR Expense) by construction, `Equity_TB` is always numerically identical to the summed Cash-leg balance — the trial balance and P&L balance to zero **by construction**, not by adjustment.
   - **Balance Sheet equity is a DIFFERENT, distinct formula — do not reuse `Equity_TB` directly** (this was hub-solution-architect REVISE Finding 1, BLOCKER: reusing `Equity_TB` while separately adding AR to Assets and AP to Liabilities breaks Assets = Liabilities + Equity by exactly AR − AP). Balance Sheet only: `Equity_BS = Equity_TB + AR − AP`, where AR/AP are the existing Receivables/Payables computed report totals (Phase 8). Proof: `Assets(Cash + AR) = Liabilities(AP) + Equity_BS(Equity_TB + AR − AP)` → `AP + Equity_TB + AR − AP = Equity_TB + AR = Cash + AR` (since `Equity_TB = Cash` per the identity above) ✓.
4. Response: structured trial-balance/P&L/balance-sheet JSON.
5. Render: `reports.html`'s new "Financial Statements" tab/section.
6. Export path (if the user exports): goes through the existing universal export service (ADR-0009) exactly like every other report — audited, RBAC-scoped identically to on-screen visibility. No new audit event type; this is a read, and exports already have their own audit coverage.

Every hop above is either a pre-existing query pattern (L1 balance service, Receivables/Payables reports) or a pure in-memory aggregation — no new database write anywhere in this feature.

## Permissions & Audit

- No new permission keys. Viewing reuses `reports.view`; exporting reuses `reports.export` (both already scoped and RBAC-gated per the existing reports module).
- No new audit event type — this feature has no write path to audit. Report exports remain covered by the existing export-service audit interceptor (DEC-033/ADR-0009), unchanged.

## UI Affected

- `reports.html` (already-built Phase 0 screen): gains a "Financial Statements" tab/section with Trial Balance / P&L / Balance Sheet sub-views. Trial Balance and P&L get period presets consistent with the rest of the reports suite (§24 conventions); **Balance Sheet gets no period control at all in v1** — it is always as-of-today, no date picker, matching Dataflow's step 1 scoping (hub-gatekeeper Finding 3). Not a new screen.
- The Phase 5 TransactionCategory admin form (gap P-8, already planned, not yet built): gains one additional field — a `LedgerAccount` picker — when an admin adds/edits a category. Not a new screen.
- No changes to `finance-dashboard.html`, `transactions.html`, `accounts.html`, `payment-entry.html`, `receivables.html`, `payables.html`, or `project-costs.html` — none of them read or write anything this feature touches.

## Task Delta

**Phase 5 — Finance Foundation** (insert after the existing TransactionCategory admin UI line):
```
- [ ] LedgerAccount seed (CoA reference data, exactly 14 rows: 1 Asset "Cash & Bank" + 2
      Revenue + 8 Expense category targets + 1 Equity "Retained Earnings" plug + 2
      "Uncategorized Income"/"Uncategorized Expense" fallbacks — no parentId/hierarchy
      in v1) + `TransactionCategory.ledgerAccountId` nullable FK, seeded for all 10 spec
      §11.2 categories, mapped 1:1 to the Revenue/Expense rows above (to be logged as gap F-11 in `analysis/requirement-gaps.md` upon /req step 7 Apply — no F-11 exists yet, cited here only as the anchor this task delta will use)
- [ ] TransactionCategory admin form (gap P-8): LedgerAccount picker restricted to
      type-compatible targets only (Income-direction -> Revenue/Uncategorized-Income,
      Expense-direction -> Expense/Uncategorized-Expense) — enforced server-side in the
      shared `packages/shared` zod schema for the category-update DTO (NOT UI-form-only;
      a direct API call must be rejected same as a form submission), not a post-hoc
      reconciliation check (future gap F-11, hub-solution-architect Finding 2)
```

**Phase 8 — Dashboard & Reports** (insert after the existing company/project/people report suites line):
```
- [ ] Reports: Financial Statements — trial balance / P&L / balance sheet, computed at
      query time from Transaction+TransactionCategory+LedgerAccount+Account (no new
      stored journal rows). Trial Balance/P&L use Equity_TB = Sigma(opening) +
      cumulative(Income-Expense); Balance Sheet uses a DIFFERENT Equity_BS = Equity_TB +
      AR - AP (folding in Receivables/Payables) — these are not the same number, do not
      reuse Equity_TB for the Balance Sheet (future gap F-11, hub-solution-architect Finding 1)
```
Phase 8 AC addition: "Trial Balance and P&L always balance to zero by construction (Equity_TB computed, never hardcoded). Balance Sheet always satisfies Assets = Liabilities + Equity_BS exactly, as a real balance test — not a component-reconciliation test that could hide a gap."

**`docs/adr/`**: add `0011-derived-chart-of-accounts-reporting.md` (Accepted), cross-linking DEC-061 (the removed write-path module, as what this deliberately is not) and confirming ADR-0005/0006 remain unmodified and correct.

**`docs/adr/README.md` index**: add the ADR-0011 row.

## Gate Notes

**hub-solution-architect, cycle 1 (2026-09-08): REVISE.**
1. BLOCKER — Balance Sheet reused Trial-Balance equity while separately adding AR/AP, breaking Assets = Liabilities + Equity by exactly AR − AP (numeric proof: Cash=4200, AR=1500, AP=800 → off by 700). **Amended**: distinct `Equity_BS = Equity_TB + AR − AP` formula, proven algebraically in Dataflow.
2. MAJOR — nothing prevented mapping an Income-direction category to a non-Revenue `LedgerAccount`, silently breaking the trial-balance identity. **Amended**: type-compatible-only validation rule added to Data Model Changes + a new Phase 5 task line.
3. MINOR (ponytail) — `LedgerAccount.parentId` self-relation was speculative, no AC needed it. **Amended**: dropped from v1.
4. MINOR — seed list ("~10-13 rows") didn't reconcile with the separately-mentioned catch-all or the Cash-leg's Asset-type need. **Amended**: exact 14-row seed enumerated.
5. MINOR — `LedgerAccount.type`'s home wasn't stated. **Amended**: `packages/shared`, matching `TransactionCategory.direction`.

**hub-solution-architect, cycle 2 (2026-09-08): APPROVED.** Independently re-derived the Balance-Sheet algebra and re-checked the 14-row seed against spec §11.2 directly (not trusting the doc's own claims) — both confirmed correct. All 5 cycle-1 findings genuinely closed, no new findings. BLUEPRINT NOTE: first "derived report over an immutable ledger + seed reference table" pattern in this codebase — capture via `workflow-blueprint` once built, future accrual-style views should clone this shape. Non-blocking note for the eventual build spec (not a design-doc gap): Finding 2's type-compatibility validation rule should be enforced at the shared zod DTO/schema level (trust-boundary correct), not UI-only — make this explicit in the build spec when this reaches `hub-planner`.

**hub-gatekeeper, design-validation cycle 1 (2026-09-08): REROUTE-design.** Design-only check, no artifacts exist yet — Journey/UX/Design-token sections correctly N/A. Core financial logic (trial-balance-by-construction, distinct Balance-Sheet equity formula, type-compatibility guard) independently re-verified as genuinely correct, not just self-consistent. 3 findings, all textual:
1. Dangling "gap F-11" citation — `requirement-gaps.md` only has F-1..F-10, F-11 doesn't exist yet. **Amended**: reworded all 3 citations to make clear F-11 is logged later (step 7 Apply), not an existing anchor.
2. Trust-boundary validation (type-compatibility rule) was stated as UI-form-only in the normative body, with the real requirement (server-side DTO enforcement) buried only in Gate Notes as a "non-blocking note." **Amended**: moved into Data Model Changes itself as a hard requirement — shared zod schema, not UI-only.
3. Balance Sheet's "period range" param was ambiguous against Phase 8's Receivables/Payables engine, which likely only supports current-outstanding (not as-of-a-past-date) queries — risked silently breaking the balance identity for historical periods. **Amended**: Balance Sheet scoped to as-of-today only in v1; historical point-in-time BS deferred as a future feature needing the Receivables/Payables engine extended first.

**hub-gatekeeper, design-validation cycle 2 (2026-09-08): REROUTE-design.** Fix 1 (F-11 citation) confirmed correctly closed. Fixes 2 and 3 were each applied to the section their finding named but not propagated to a sibling section, producing new contradictions: Task Delta line 78 still said "form validation" while Data Model Changes line 35 now says server-side zod; UI Affected line 63 still implied Balance Sheet gets period presets while Dataflow line 43 scoped it to as-of-today-only. **Amended**: Task Delta's TransactionCategory-picker task now explicitly states server-side `packages/shared` zod enforcement (not UI-only); UI Affected now explicitly states Balance Sheet gets no period control, matching Dataflow. Swept the whole doc for every other "form validation"/"period preset"/"period range" reference to confirm no third sibling section was missed.

_Further notes filled by `hub-gatekeeper` on re-check._
