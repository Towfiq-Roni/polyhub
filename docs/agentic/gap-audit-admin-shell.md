# Gap Audit — Admin, Shell & Cross-Cutting Screens

**Scope:** `design/app-shell.html`, `design/dashboard.html`, `design/users.html`, `design/roles.html`,
`design/audit-logs.html`, `design/settings.html`, `design/profile.html`, `design/index.html`, `design/shell.js`.

**Method:** read each file in full; cross-checked against `analysis/requirements-analysis.md` §7.5
(RBAC/audit invariants), `analysis/requirement-gaps.md`, `analysis/task-breakdown.md` Phase 0/2 AC,
CLAUDE.md Rules 7/8/9, `docs/memory/DECISIONS.md`, and
`docs/designs/phase0-redesign-claude-handoff-plan.md` §1 mapping table against the corresponding
`docs/designs/claude-design-handoff/screens/*.dc.html` files. Verified zero dead internal `href`s
across all 8 files (scripted check). This is a read-only audit; no `design/*.html` or `analysis/*.md`
files were modified.

Read-only note: `analysis/*.md` and `design/*.html` were only read, never edited, per task instructions.

---

## H — High Severity

### H-1 · `settings.html` lost its entire organization-settings scope, undocumented
The pre-handoff `settings.html` (commit `fd744e8`, "Admin settings (6 tabs)") had 6 tabs: **General,
Company, Finance, Notifications, Security, Integrations** — covering gap **P-7**'s recommended default
(company name/logo, fiscal year start, category/CoA management entry point) plus finance-posture
fields (payment terms, decimal/rounding rules). The current rebuilt `settings.html` is **100%
personal-user scope only** (Account / Appearance / Notifications / Security cards) — no Company tab,
no Finance tab, no fiscal-year-start field, no Integrations tab, nothing organization-wide at all.

This isn't just a P-7 regression — it directly contradicts the rebuild's own plan
(`docs/designs/phase0-redesign-claude-handoff-plan.md` §1 mapping row: *"Settings.dc.html → settings.html:
Merge: **keep old's fuller sections**, add new's Appearance switch UI"*). The fuller sections were
not kept. No `DECISIONS.md` entry logs this narrowing as an adopted deviation, so per CLAUDE.md's
"spec deviations are only legitimate if logged" guardrail this is currently an **unlogged scope
regression**, not a deliberate simplification.
- **Recommended fix:** restore an organization-settings section (tabs or a second page,
  `Company`/`Finance`/`General` at minimum) carrying gap P-7's fields, or explicitly log a
  DECISIONS.md entry deferring org-settings to a later phase with a `ponytail:` marker if the
  stakeholder wants personal-settings-only for now.

---

## M — Medium Severity

### M-1 · `roles.html`'s permission catalog collapses A4's required separately-keyed finance permissions
Rule **A4** (`requirements-analysis.md` §7.5) mandates finance actions be **separately keyed** per
entity: `milestone_payments.create/update/reverse`, `team_payments.create/update/reverse`,
`bds_payments.create/update/reverse`, distinct from `transactions.create/reverse/view` — precisely
because gap **F-8**/DEC-010 hinges on this granularity (posted-financial immutability enforced
per-entity-type). `roles.html`'s `CATALOG` array instead has one generic `payments.create` (Finance
module, "Record client/milestone payments") and one `payables.manage` ("Record team/BDS/vendor
payments") — collapsing three distinct payment entities into two generic keys. There's also no
`transactions.view` distinct from `finance.read`. This is a mockup-only sample (not all ~60 Phase 2
keys are expected here), but the *shape* shown — coarse, not per-entity — risks seeding the wrong
granularity into the Phase 2 permission seeder if copied literally.
- **Recommended fix:** before Phase 2, replace the 2 generic payment keys with the A4-mandated
  per-entity set (`milestone_payments.create/update/reverse`, `team_payments.*`, `bds_payments.*`),
  even if the *mockup* only samples a subset of the eventual ~60-key catalog.

### M-2 · Audit Logs' Action filter and sample data have no "Reverse" action, and show a hard "Delete" on a posted Transaction
`audit-logs.html`'s `actionFilter` dropdown only offers **Create / Update / Delete / Login** — there
is no **Reverse** option, despite `transactions.reverse` being a first-class, separately-permissioned,
heavily-audited action (L3, A4, Phase 5 AC "Reversal flow... audited"). Worse, the seed `LOGS` array
includes a row: `{action: 'Delete', entity: 'Transaction', target: 'TXN-2026-0817', before: 'amount:
৳120,000.00', after: null}` — a hard delete of a posted financial transaction. This directly
contradicts CLAUDE.md Rule 4 ("Posted financial rows are immutable... No edit/delete paths") and L3
("posted transactions are never hard-deleted or edited... correction = linked reversal"). As sample
data on the one screen whose entire job is to demonstrate the audit trail's shape, this risks
normalizing "Transaction: Delete" as a sanctioned action pattern for whoever builds Phase 2's audit
interceptor.
- **Recommended fix:** replace the Transaction row with a `Reverse` action example (e.g. `before:
  'status: Posted', after: 'status: Reversed, ref: TXN-2026-0817-REV'`), and add `Reverse` to the
  Action filter's option list.

### M-3 · `dashboard.html`'s Recent Activity CSV/table uses non-canonical status/type labels
The Recent Activity table/CSV shows `Type: Invoice` (status `Processing`) and `Type: Adjustment`,
`Type: Commission Payout` — none of these are canonical per the shared status vocabulary
`app-shell.html` itself documents ("Status Chips: Dual Anatomy": payment states are
Unpaid/Partial/Paid/Overdue only) or the entity model's transaction/payment types. `Processing` in
particular renders with `chip-pay--neutral` (the same class the legend uses for "Unpaid"), so the
label drifts from the canonical vocabulary shown one click away on the shell reference page.
- **Recommended fix:** relabel rows to the canonical payment-status vocabulary (Unpaid/Partial/
  Paid/Overdue) and canonical transaction categories, for internal consistency with `app-shell.html`.

---

## L — Low Severity

### L-1 · `roles.html` role cards have no visual "protected/built-in" marker for Super Admin
Rule A1 says `SUPER_ADMIN` is a protected built-in role (can't be deleted/deactivated below ≥1
active). `roles.html`'s role cards render Super Admin identically to Admin/Manager/Member (no
delete affordance exists yet at all, so nothing is actually unsafe today) — but there's also no
visual cue (badge/lock icon) distinguishing it as protected, which `users.html` does provide via a
disabled-with-tooltip Deactivate button. Low severity since no delete action exists yet to guard
against.
- **Recommended default:** add a small "Built-in" or lock-icon badge to the Super Admin role card
  when Phase 2 adds role deletion.

### L-2 · `audit-logs.html`'s Account opening-balance edit sample isn't obviously guarded
One `LOGS` row shows an `Update` on `Account` changing `openingBalance` from ৳500,000 to ৳750,000
post-creation. Nothing in `requirements-analysis.md` explicitly forbids editing `openingBalance`
(it's a stored *input* field, not the derived balance itself — unlike the DEC-055-fixed "editable
Balance field" violations), but retroactively changing it after transactions have posted against the
account would silently rewrite every historical computed balance. Not a confirmed Rule 1/2 violation
since `accounts.html` (out of this audit's scope) owns the actual edit UI, but worth flagging as a
cross-reference for whoever audits `accounts.html`.
- **Recommended default:** confirm in `accounts.html`'s own review whether `openingBalance` edits are
  blocked once ≥1 transaction exists against that account.

---

## Confirmed correct (no new finding — verified positively)

- **Rule 9 (≥1 active SUPER_ADMIN)** — `users.html` implements this correctly and visibly:
  `isLastActiveSuperAdmin()` guards both the row-level Deactivate button (disabled + tooltip) and the
  Edit-modal save path (blocks role/status changes that would drop the last active Super Admin below
  1), with an inline `error-text` explaining why. This matches DEC-055's explicit requirement ("preserve
  last-active-SUPER_ADMIN deactivate guard (not in script — must add)") — it was correctly added.
- **Rule 8 (audit actor + before/after)** — `audit-logs.html` shows Timestamp/Actor/Action/Entity and
  a dedicated "Change (before → after)" column, correctly rendering `-` for actions with no field
  mutation (Login). Filters (entity, action, date range, search) all present and functional.
- **Rule 7 (allow-only union RBAC, `resource.action` lowercase keys)** — `roles.html`'s permission
  matrix is a per-role **grant list** (checkbox = "Granted"), not a deny-list; every key in `CATALOG`
  is lowercase `resource.action` format. This is the correct pattern even though the catalog's
  *granularity* has the M-1 gap above.
- **Canonical shell consistency** — `app-shell.html` and `shell.js` are internally consistent: every
  sidebar nav item in `app-shell.html` (21 items across 6 groups) has a matching route handled by
  `shell.js`'s SPA router; `profile.html` is intentionally reached only via the user-menu dropdown,
  not the sidebar (consistent with DEC-062's adoption as a legitimate non-sidebar screen).
  `sidebarCollapse`/`.collapsed` auto-rail-below-900px behavior matches the documented DEC-055
  intentional design (explicitly out of scope per task brief).
- **Handoff mapping fidelity** — `Users.dc.html`, `Roles.dc.html`, `AuditLogs.dc.html` dispositions
  from `phase0-redesign-claude-handoff-plan.md` §1 are all faithfully executed as specified (SUPER_ADMIN
  guard added, Permissions folded as roles.html sub-view with the real catalog ported in, old filters/
  export bar kept and new Action filter layered on). `Sidebar.dc.html`/`Topbar.dc.html`/`Footer.dc.html`
  correctly compose into every screen's inline shell markup (not standalone pages) as the plan specifies.
  `Login.dc.html`'s mapping into `login.html` was not re-audited here (explicitly out of this task's
  file list per instructions — only the mapping was checked, and it maps sensibly).
- **Dead links** — 0 missing internal `href="*.html"` targets found across all 8 audited files
  (scripted check).
- **Empty/loading states** — `users.html`, `roles.html`, `audit-logs.html` all have `empty-state`
  blocks; `dashboard.html` has skeleton/loader states for KPIs, My Projects, and Attention Required.

---

## Severity Summary
| ID | Severity | Screen(s) |
|---|---|---|
| H-1 | H | settings.html |
| M-1 | M | roles.html |
| M-2 | M | audit-logs.html |
| M-3 | M | dashboard.html |
| L-1 | L | roles.html |
| L-2 | L | audit-logs.html (cross-ref accounts.html) |
