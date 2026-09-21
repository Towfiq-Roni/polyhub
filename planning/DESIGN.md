# Design Context

> Consistency reference for implementers. This is a distillation, not a design asset — the real files are the canonical source (see bottom).
>
> **Two design lineages exist and are reconciled here:**
> 1. **Repo `design/*.html`** (33 screens + `tokens.css`/`styles.css`/`shell.js`/`theme.js`) — canonical, current, gatekept PASS as of 2026-09-08 (DEC-055 through DEC-067). Root `DESIGN.md` already documents this in full `create-design-md` format — **that file, not this one, is the token/component source of truth**. This file adds only what changed for the double-entry reversal (DEC-068).
> 2. **Claude Design canvas** `2c01e490-74e3-491c-8cdb-4f0c3e3ca5f8` (imported via `DesignSync` MCP, 2026-09-10) — a parallel lineage, `github.md` reports **last synced 2026-08-31**, i.e. it predates DEC-055 through DEC-068 entirely. Confirmed stale in at least one spot: its `PaymentEntry.dc.html` still carries the `CHART_OF_ACCOUNTS` classifier DEC-063 already removed from the repo. **Do not copy canvas files into `design/` verbatim.** Treat it as reference material for one thing only: it already contains a fully-formed Chart-of-Accounts/Journal-Entries/Trial-Balance/Ledger UI (`Accounting.dc.html`) that the repo's `design/` folder has never had (its own `accounting.html` was removed by DEC-061 for violating the pre-reversal no-double-entry non-goal). That non-goal no longer holds (DEC-068) — this pattern is now genuinely useful, adapted per the deltas below.

## What's new since root DESIGN.md (double-entry reversal, DEC-068)

Root `DESIGN.md` and the built `design/` folder predate the BRD v1.2/SRS v1.0 double-entry decision. Nothing in the existing tokens, type scale, spacing, or component inventory changes — only new screen content is needed:

| Screen | Status | Delta needed |
|---|---|---|
| `finance-dashboard.html` | exists | No structural change — KPIs/breakdowns already fit a cash-basis model. Canvas's `FinanceDashboard.dc.html` has a richer "by method" + aging breakdown worth adopting (Cash/Bank/MFS split per KPI, not just totals) — optional enhancement, not required by any FR. |
| `transactions.html` | exists | No change — a flat list of postings still works under double-entry (each row = one JournalEntry's user-facing side, not its individual debit/credit lines). |
| `payment-entry.html` | exists | **Do not reintroduce** the canvas's `CHART_OF_ACCOUNTS`/`chartAccountCode` classifier (that's the exact thing DEC-063 removed) — the "Other" category path stays on the already-adopted `TransactionCategory` tag. No new UI needed; the journal-entry posting is invisible to the user by design (FR-FIN-16). |
| `accounts.html` | exists | Reframe as the `isMoneyAccount=true` filtered view over the chart of accounts (SRS §FR-FIN-01), not a separate table. Canvas's `BankAccounts.dc.html` (method/bank-name/account-number/balance/status, Add/Edit/View modals) is directly adoptable as its visual pattern — same shape, just backed by COA rows instead of a standalone `BankAccount` entity (per the "keep unified" decision). |
| **NEW: a Chart of Accounts / Journal / Trial Balance screen** | does not exist in `design/` | **Adopt canvas's `Accounting.dc.html` shell** (4-tab pattern: Chart of Accounts table, Journal Entries as cards with debit/credit line tables, Trial Balance with balance-check footer note, per-account Ledger with running balance) as the starting point — **with two required adaptations, not a verbatim port:** (1) drop `1100 Accounts Receivable`/`2000 Accounts Payable`/`2200 Unearned Revenue` and any accrual-implying seed journal lines — cash-basis has no AR/AP ledger accounts (SRS §3.6); (2) the "Add Accounting Code" modal (picking from a master list) should be reframed as `settings.html`'s COA management (FR-FIN-13), not a separate page — this screen itself is read-only reporting (`reports.view`), matching FR-FIN-14/FR-ADMIN-05's create/reverse-vs-view permission split. Likely lands as a new tab/section in `reports.html` ("Financial Statements") rather than a standalone nav item — consistent with the sidebar's existing information architecture (one Finance section, not two). |
| `receivables.html` / `payables.html` | exist | No change — still computed reports per FR-FIN-09/10, unaffected by the ledger's internal double-entry mechanics. |

**Not adopted from the canvas:** its `CHART_OF_ACCOUNTS`'s numbered-code convention (`1000`-`5500`) — SRS §3.6/§FR-FIN-01 specifies a flat, small, named COA (no hierarchy, no numbering scheme) for a 5-user shop; the canvas's more elaborate 19-row numbered scheme is closer to a textbook chart than what hub needs. Reuse its visual/interaction pattern, not its literal seed data.

## Tokens, Component inventory, Layout/grid, Accessibility, Do-nots

Unchanged from root `DESIGN.md` — see that file. Not duplicated here to avoid drift between two token sources.

## Canonical source

- **Tokens/components/screens (current, built):** `design/` folder + root `DESIGN.md`, this repo.
- **Reference only, not canonical, confirmed partially stale (pre-dates DEC-055–068):** Claude Design canvas `2c01e490-74e3-491c-8cdb-4f0c3e3ca5f8` ("Design consistency and functionality"), readable via the `DesignSync` MCP tool (`get_project`/`list_files`/`get_file`). Useful specifically for `Accounting.dc.html`'s UI shell (adapted per the table above) and `BankAccounts.dc.html`'s visual pattern for `accounts.html`. Do not treat any other file in it as ahead of the repo's own `design/` folder without diffing first — most of it (Dashboard, Clients, Projects, Teams, BDS, Admin) is the same or an earlier version of what's already built and gatekept.

## Build tracking

Turning this into actual `design/` file changes is Phase 0 mockup rework — already flagged as SRS Appendix B item 3 and not done inline here (per CLAUDE.md's orchestrator discipline: the main agent never writes product code/mockups directly; this goes through hub's own Plan→Build→Review→Test→CodeReview→Gate chain in ≤3-file batches once scheduled). This document is what that future build task should read.
