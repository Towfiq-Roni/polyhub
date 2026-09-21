# Gap Audit — Teams & BDS Partners screens

> Scope: `design/teams.html`, `design/team-members.html`, `design/team-member-detail.html`,
> `design/bds-partners.html`, `design/bds-partner-detail.html`.
> Cross-checked against `analysis/requirements-analysis.md` §5/§7, `analysis/requirement-gaps.md`
> gaps F-1/F-2, `analysis/task-breakdown.md` Phase 0 AC, CLAUDE.md's 9 non-negotiable rules, and
> the original handoff at `docs/designs/claude-design-handoff/screens/{Teams,TeamMembers,
> TeamMemberDetail,BdsPartners,BdsPartnerDetail}.dc.html` via the mapping in
> `docs/designs/phase0-redesign-claude-handoff-plan.md` §1.
> Read-only audit — no `design/*.html` or `analysis/*.md` files modified.
>
> **Severity scale** (same as `requirement-gaps.md`): H = blocks correct build / risks financial
> rework · M = must decide before the phase that touches it · L = safe to default, revisit later.

---

## G-1 · Team-member screens imply automatic hourly-rate payroll, contradicting gap F-1's adopted default — **H**

**Screens:** `team-members.html`, `team-member-detail.html`

`requirement-gaps.md` F-1 (High severity, DEC-007) locks the model: team-member payables accrue
**only** via manual `TeamMemberPayable` entries (amount, note, date) — "zero automation, matches
manual payments philosophy." Spec §30 / requirement-gaps.md §F Scope Confirmations also explicitly
excludes **time tracking** and a **payroll engine** from MVP.

Both screens instead build a full hourly-rate payroll/timesheet UI:
- `team-members.html`: table column **Rate** (৳/hr) + Add-Member modal field "Hourly rate (৳)".
- `team-member-detail.html`: Employment Details card has an editable **Rate** field (৳/hr);
  Performance Summary KPIs show **"Hours Logged (YTD)"** (1,240) and **"Amount Earned (YTD)"**
  (৳3,100,000.00 — a computed rate×hours figure); the Payments tab lists rows with **Period**
  (e.g. "Jul 2026") and **Hours** columns feeding a computed **Amount**.

None of `hours`, `period`, or `rate` exist on the `TeamMember`/`TeamMemberPayment` entities in
`requirements-analysis.md` §5 (`TeamMemberPayment`: `teamMemberId, projectId?, amount, paidDate, …`
only). This is carried verbatim from the external handoff (`TeamMembers.dc.html`/
`TeamMemberDetail.dc.html` both have the identical `rate`/Hourly-rate fields) and was not
reconciled against F-1 during the DEC-055 rebuild (that pass only caught two unrelated
balance-editability violations).

**Recommended fix:** drop `Rate`/`Hours`/`Period` entirely. Replace the Payments tab with a
manual "Payable Entries" list (amount, note, date, recorded-by) gated behind a
`team_payments`-authorized "Record Payable" / "Record Payment" action, per F-1's default. Replace
"Hours Logged (YTD)" KPI (out of scope) and "Amount Earned (YTD)" (implies computed accrual) with
KPIs that are honestly derived: `Total Payable` (Σ payable entries), `Total Paid` (Σ
TeamMemberPayments), `Outstanding` (difference) — same shape as the Compensation Summary already
built correctly on `bds-partner-detail.html` if G-2 below is also fixed.

## G-2 · BDS partner screens imply percentage commission, contradicting gap F-2 and the explicit v1 scope exclusion — **H**

**Screens:** `bds-partners.html`, `bds-partner-detail.html`

`requirement-gaps.md` F-2 (High severity, DEC-008) locks BDS payable to a **fixed agreed amount
per project** (`BDSCompensation{partnerId, projectId, agreedAmount, paymentDueDate?, status}`),
activating when the project turns Active. `requirements-analysis.md` §5 explicitly notes
`BDSCompensation` is "**Fixed-amount v1; percentage later**." `requirement-gaps.md` §F Scope
Confirmations lists **"percentage-based BDS commission (post-v1 candidate)"** as explicitly out of
MVP scope.

Both screens instead model BDS pay as a partner-level percentage commission:
- `bds-partners.html`: table column **Commission** (%) + Add-Partner modal "Commission rate (%)".
- `bds-partner-detail.html`: editable **Commission Rate (%)** field in Overview; page subtitle
  reads "BDS Partner · 5% commission · 12 leads attributed"; the Compensation tab has a row type
  **"Lead Conversion"** (e.g. ৳30,000/৳40,000 tied to a lead code, not a project) — a compensation
  source that doesn't exist anywhere in the entity model at all (`BDSCompensation` is
  project-scoped only, no lead-linked variant).

Same root cause as G-1: verbatim from the handoff (`BdsPartners.dc.html`/
`BdsPartnerDetail.dc.html` carry the identical `commission`/`%` fields and "Lead Conversion" seed
row) and never reconciled against F-2 or the scope-confirmation table during DEC-055.

**Recommended fix:** remove the partner-level `Commission Rate (%)` field entirely. Compensation
tab should list per-project `BDSCompensation` rows (project name, agreedAmount, optional
paymentDueDate, status) keyed off project-Active activation, not a % computation; drop the "Lead
Conversion" compensation type. List screen's "Commission" column becomes N/A (partners don't carry
a rate) — replace with something like "Active Compensations" count if a summary column is wanted.

## G-3 · Team entity gains an undocumented "Budget" field — **M**

**Screen:** `teams.html`

Every team card shows a **Budget** field (e.g. ৳4,500,000.00) and the Create-Team flow seeds new
teams with `budget: 0`. `requirements-analysis.md` §5 `Team` entity is `name, description,
leadMemberId?, status` only — no budget concept anywhere in the entity model, business rules, or
`requirement-gaps.md`. Nothing else in `design/` (dashboard, finance-dashboard, reports) reads or
rolls this figure up — it's an isolated, unlogged addition (present in the handoff's
`Teams.dc.html` too, so also not introduced by the rebuild, just never reconciled).

**Recommended fix:** either log a new decision entry adding `Team.budget` to the entity model (if
the stakeholder actually wants team-level budgeting, and specify what consumes it), or drop the
field/row before Phase 1 build.

## G-4 · Role/Lead captured as free text instead of the modeled lookup/FK — **M**

**Screens:** `teams.html`, `team-members.html`

`requirements-analysis.md` §5 models `OrgRole` as a **centrally-managed lookup entity** ("Label
only: Developer, Designer, PM, Sales… centrally managed"), and `Team.leadMemberId` as a
`TeamMember` FK. Both Add-Member's "Role" field and Create-Team's "Lead" field are plain free-text
inputs (`placeholder="e.g. Developer"` / `"e.g. Karim Ali"`) with no dropdown sourced from the org
roster/lookup. Same class of issue as DEC-060/063's payment-entry classifier fix (free-form field
where a real backing entity already exists) — not yet caught here.

**Recommended fix:** Role → `<select>` sourced from the `OrgRole` seed list; Lead → `<select>`
sourced from the team's member roster (or org-wide roster), storing `leadMemberId`.

## G-5 · team-members.html list table is at/over the ≤7-primary-column congestion gate — **L**

**Screen:** `team-members.html`

Columns: Member, Team, Role, Email, Rate, Joined, Status (= 7 primary) + an unlabeled action
column (= 8 total). Phase 0 AC (REQ-32 D1) requires ≤7 primary columns above the fold, verified
elsewhere per `PROGRESS.md` (transactions/receivables/project-detail) but this screen wasn't
called out in that pass. Coupled to G-1: removing the `Rate` column as part of the F-1 fix also
resolves this without further trimming.

## G-6 · Teams/Team Members list screens lack the `.export-bar`/pagination pattern used elsewhere — **L**

**Screens:** `teams.html`, `team-members.html`

`bds-partners.html` (in scope) and most other CRM/Finance list screens (clients, leads,
opportunities, receivables, payables, reports) carry an `.export-bar` + `.pagination` block per
DEC-055 plan §5 item 15 ("retain the existing `.export-bar` demo pattern everywhere it exists
today, for cross-screen consistency"). Teams/Team Members aren't named in that item's explicit
retained-screen list, so this may be an intentional distinction (roster/card views vs. exportable
reports) rather than an oversight — flagging for confirmation, not asserting as a defect.

---

## Handoff-fidelity check (task item 3)

No new deviations found beyond what's already logged (DEC-055/060/061/062/063). The rebuilt
screens track the handoff scripts closely for these 5 screens — canonical `.app-shell`/`.sidebar`/
`.nav-item.active` structure, hrefs, and modal/tab wiring all match. **G-1 and G-2's root fields
(`rate`, `commission`) are present verbatim in the handoff's own `.dc.html` scripts** — they were
not introduced by the rebuild; they simply were never reconciled against F-1/F-2 during the
DEC-055 business-rule pass (which only caught two unrelated balance-editability issues). No
handoff screen for this scope is unreflected in `design/`; no unlogged rebuild-vs-handoff
deviation found.

## Checked and clean

- Canonical shell (`.app-shell`/`.sidebar`/`.nav-item.active`/`aria-current`) consistent across all
  5 screens.
- All internal hrefs resolve to existing files (`dashboard.html`, `team-member-detail.html?id=`,
  `bds-partner-detail.html?id=`, etc.).
- Empty states present on both list screens (`teamsEmpty`, `membersEmpty`,
  `partnersEmpty` — the latter already existed pre-scope).
- Money formatting (৳, tabular numerals via `.num.data`) consistent with the rest of `design/`;
  not a new defect (whole-repo mockup convention, already reviewed).
- No skeleton/loading state on any of the 5 screens — consistent with every other list/detail
  screen in `design/` (static mockups, no async fetch to skeleton), not a scope-specific gap.

## Not re-reported

DEC-060/061/062/063 (accounting.html removal, payment-entry.html's Chart-of-Accounts classifier
replacement) are out of this scope and already resolved — not touched here.
