# Phase 0 Redesign — Claude Design Handoff → `design/` Rebuild Plan

**Status:** planning only — no product/design files touched to produce this document.
**Sources read:** `design_handoff_hub/README.md`; all 33 `screens/*.dc.html` files including their
`data-dc-script` logic sections (read directly, or via dispatched research agents whose full
reports are folded into §2 below); `design/shell.js`, `design/theme.js`, `design/styles.css`,
`design/tokens.css`, `design/app-shell.html`, `design/index.html`, `design/permissions.html`,
`design/login.html`, `design/settings.html`, `design/project-detail.html`, `design/projects.html`,
plus targeted greps across the rest of `design/*.html`; `docs/designs/hub-design-system.md`
(superseded pointer → `DESIGN.md`); `DESIGN.md` (brand mark / letter-reveal loader / chip system);
`analysis/task-breakdown.md` Phase 0 AC; `CLAUDE.md` non-negotiables.

**Token/color diff (confirmed myself):** `design/tokens.css` dark+light values are byte-identical
to the README's "Design Tokens" section (bg/surface/border/ink tiers/accent/accent-soft/all five
status colors, both themes). **No color changes to `tokens.css`.**

**Wordmark finding (corrects the task brief):** there is no `logo.svg` file referenced anywhere in
`design/*.html` or `styles.css` today — grepped, zero hits. The current "brand mark" is a
hardcoded 3-span letter animation (`<span class="dea-loading"><span>D</span><span>E</span><span>A</span></span>`)
used in the sidebar brand row, **and** the same class name is reused, unrelated, for the full-page
splash loader (`body > .dea-loading`, animated via `shell.js`'s `splitLetters()`, which only
targets *direct children of `body`* — the sidebar's nested span is untouched by that JS; its
letter styling is pure hardcoded markup). DESIGN.md documents the splash loader's letter-reveal as
a deliberate motion signature — **that stays untouched.** The user-approved change is narrower:
replace the sidebar-brand's 3 letter-spans + separate "Hub" span with plain static text matching
`Sidebar.dc.html`'s actual markup (`<span>DEA</span><span>Hub</span>`, no animation, no per-letter
markup). This is a per-screen markup edit (every screen duplicates the shell inline — there is no
include mechanism), not a token or asset change.

---

## 1. Screen mapping table

35 handoff files → 33 target HTML screens (permissions.html retired/merged; login/settings/etc.
merged not duplicated; +3 new screens) + 3 shared files touched (`shell.js`, `styles.css`,
`theme.js`; `tokens.css` unchanged). **36 files total, 12 batches of ≤3.**

| Handoff file | Target file | Disposition |
|---|---|---|
| `Sidebar.dc.html` | *(inline shell markup, all screens)* | Behavior → `shell.js`; not a standalone page |
| `Topbar.dc.html` | *(inline shell markup, all screens)* | Behavior → `shell.js`; not a standalone page |
| `Footer.dc.html` | *(inline shell markup, all screens)* | New `.footer` pattern → `styles.css` |
| `support.js` | — | **Not ported** (design-tool runtime only) |
| `Login.dc.html` | `login.html` | Merge: keep old's register/forgot/reset states (new drops them) |
| `Dashboard.dc.html` | `dashboard.html` | Add My-Projects table, dynamic attention count, real CSV export |
| `Profile.dc.html` | `profile.html` | **New screen** |
| `Settings.dc.html` | `settings.html` | Merge: keep old's fuller sections, add new's Appearance switch UI |
| `Leads.dc.html` | `leads.html` | Merge: keep old's Email col/BDS filter/date filter/pagination + add Convert flow |
| `Opportunities.dc.html` | `opportunities.html` | Merge: keep old's Probability col/Client filter/pagination + add sort/consume-handoff |
| `OpportunityDetail.dc.html` | `opportunity-detail.html` | Merge: keep old's Activities/Documents tabs + add stage row/Create Client chain |
| `Clients.dc.html` | `clients.html` | Add Add-Client modal + consume `hub-created-clients` |
| `ClientDetail.dc.html` | `client-detail.html` | Add Accounts tab, Edit/Discard/Save, editable BDS field; keep old's tag/milestone resource filters |
| `BdsPartners.dc.html` | `bds-partners.html` | Merge: keep old's Contact col/date filter/pagination + add Add-Partner modal |
| `BdsPartnerDetail.dc.html` | `bds-partner-detail.html` | Add Edit/Discard/Save + Active/Inactive toggle |
| `Projects.dc.html` | `projects.html` | Merge: keep old pagination/export + add sort/Quick-View/merged Assign modal |
| `ProjectDetail.dc.html` | `project-detail.html` | **Keep old's 6 tabs** (Overview/Milestones/Team/Resources/Finance/Activity); slot new interactions into Team/Milestones/Resources tabs only |
| `ProjectMilestones.dc.html` | `project-milestones.html` | **New screen** |
| `MilestoneDetail.dc.html` | `milestone-detail.html` | Add deliverables checklist + status toggle; verify approval/payment-record parity (see §3 flags) |
| `DeliverableDetail.dc.html` | `deliverable-detail.html` | Add status select + comments; same parity check |
| `Teams.dc.html` | `teams.html` | Add Assign-Members modal + Create-Team modal |
| `TeamMembers.dc.html` | `team-members.html` | Add Team filter + Add-Member modal (`hub-team-members` key) |
| `TeamMemberDetail.dc.html` | `team-member-detail.html` | Add Bank Accounts tab (5th tab) + global Edit/Discard/Save + new Overview fields |
| `Users.dc.html` | `users.html` | Add Edit modal; **preserve** last-active-SUPER_ADMIN deactivate guard (not in script — must add) |
| `Roles.dc.html` | `roles.html` | Fold Permissions in as sub-view, **porting old `permissions.html`'s resource.action catalog content**, not the handoff's coarse matrix |
| `permissions.html` | *(retired)* | Content ported into `roles.html`; file deleted, nav link removed (already gone in new Sidebar) |
| `AuditLogs.dc.html` | `audit-logs.html` | Keep old's Entity + date-range filters + export bar; layer new's Action filter/search on top |
| `FinanceDashboard.dc.html` | `finance-dashboard.html` | Add period selector/6-KPI/by-method/aging/CSV export; **keep old's** Income-vs-Expenses + Top-Projects-by-Profitability cards |
| `BankAccounts.dc.html` | `accounts.html` | **Restructure** to org cash/bank/MFS accounts (CoA hierarchy moves to `accounting.html`); fix editable-Balance violation (§3) |
| `PaymentEntry.dc.html` | `payment-entry.html` | Full rebuild, method-first flow, 3 categories per script (project/team/other) — **DECIDED:** Vendor Payment folds into "Other", no 4th category added |
| `Transactions.dc.html` | `transactions.html` | Keep old's Status + read-only Actions ("View") column; add search/Type filter/empty state |
| `Receivables.dc.html` | `receivables.html` | Fix editable-received-amount violation (§3); Edit modal restricted to invoice metadata |
| `Payables.dc.html` | `payables.html` | **DECIDED:** Add Invoiced/Paid/Outstanding tracking for parity with Receivables |
| `Accounting.dc.html` | `accounting.html` | **New screen**, build per script exactly (CoA → Journal → Ledger → Trial Balance) |
| `ProjectCosts.dc.html` | `project-costs.html` | **DECIDED:** Replace old's profitability rollup (Contract Value/Team Costs/BDS/Profit/Margin) with new's budget-vs-actual-by-category view; profitability rollup retired |
| `Reports.dc.html` | `reports.html` | Keep old's fuller report views; add new's period-selector KPIs; drop cross-domain "New Leads" KPI |
| — | `app-shell.html` | **Kept**, regenerated to the new shell markup/classes (QA reference screen, not in handoff) |
| — | `index.html` | **Kept** as the screen-index/directory page (it is NOT a redirect — corrects task brief), regenerated link list for the new 33-screen set |

---

## 2. Shared shell delta — `shell.js` / `theme.js` / `styles.css` / `tokens.css`

### 2.1 `tokens.css` — no changes.

### 2.2 Wordmark (all screens' inline shell markup)
Replace the 3-span letter markup + separate `.brand-name` span in `.sidebar-brand` with plain
static text matching `Sidebar.dc.html`: two plain spans, `DEA` + `Hub`, no per-letter markup, no
entrance animation. Leave `body > .dea-loading` (the full-page splash loader) and its
`shell.js` `splitLetters()` / DESIGN.md-documented letter-reveal keyframe completely untouched —
they are a different element and a deliberate motion signature. Update the two CSS rules that key
off `.sidebar-brand .dea-loading` (`app-shell.collapsed .sidebar-brand .dea-loading` sizing rule) to
target the new plain-text class instead.

### 2.3 Sidebar — responsive pattern change (significant)
Current `shell.js`/`styles.css` implement an **off-canvas drawer** below 900px: `.menu-btn`
hamburger (topbar), `.nav-backdrop`, `.app-shell.nav-open` toggling, sidebar hidden until opened.
`Sidebar.dc.html`'s actual script (`checkWidth()`) implements a **different, incompatible**
pattern: the sidebar is *always visible*, auto-collapsing to the 64px icon rail when
`window.innerWidth < 900` (not hidden), manually re-expandable via the collapse button or a click
on the brand row regardless of viewport width; `Topbar.dc.html` has **no hamburger button at all**.
Adopt the new pattern (it's explicit in the README and confirmed in the script, and the new Topbar
markup structurally has nowhere to put a hamburger). This means:
- `shell.js`: replace the `#menuBtn`/`.nav-open`/backdrop-click handlers with a `resize` listener
  that auto-collapses (`.app-shell.collapsed`) under 900px and does **not** auto-expand back above
  900px unless the user had it expanded before crossing the breakpoint (mirror the dc-script's
  `isNarrow` bookkeeping, which only force-collapses on the narrow transition, never force-expands).
  Keep the existing manual toggle (`#sidebarCollapse`) and brand-click-to-expand-when-collapsed
  handlers as-is — they already match.
- `styles.css`: remove `.menu-btn`, `.nav-backdrop`, `.app-shell.nav-open` rules (dead after the
  above); the `.sidebar-collapse-btn` / `.app-shell.collapsed` rules already present are correct
  and stay.
- Every screen's markup: remove the `<button class="menu-btn">` hamburger from the topbar block.

### 2.4 Topbar — two genuinely new behaviors
- **Global search dropdown**: markup already exists (`.search-field input`) but is inert today.
  Add a small static `SEARCH_INDEX` array (projects/clients/team members/pages, per
  `Topbar.dc.html`) and wire input/focus/blur/Enter/Escape handlers in `shell.js` to show a
  live-filtered dropdown (reuse `.modal-card`-style surface/border/shadow tokens for the popover)
  and Enter-to-navigate-to-first-match.
- **Notification bell dropdown**: currently a static badge with no panel. Add a small dropdown
  (mirrors the user-menu dropdown pattern already in `styles.css`) listing 2–3 seeded notification
  rows + an empty state ("You're all caught up").
- Both dropdowns follow the exact popover styling already defined for `.user-dropdown` — reuse
  those classes/tokens, don't invent new visual language.

### 2.5 Footer — new shared pattern
No shared `.footer` component exists today (`padding:16px 24px`, top border, centered muted
12px text, "Powered by Deus Ex Automata (DEA)"). Must sit at the bottom of the **scroll area**, not
the viewport, per the README's page-skeleton pattern. This requires restructuring the page shell
CSS: current `.app-shell` is a CSS Grid (`grid-template-columns: sidebar minmax(0,1fr)`) with the
topbar and content as normal document flow. The new pattern is nested flex:
`.app-shell{display:flex;height:100vh;overflow:hidden}` → sidebar (fixed) + a flex column
(`.topbar` sticky, then a `flex:1;overflow-y:auto` scroll area containing `<main>` + `.footer`).
Rework `.app-shell`/`.sidebar`/`.topbar`/`.content` rules in `styles.css` to this flex model (keeps
existing collapse/responsive rules, just changes the outer layout mechanism) and add every screen's
markup with the new nesting + a trailing `.footer` element inside the scroll wrapper.

### 2.6 New shared component patterns (not in `styles.css` today)
- **File upload**: zero existing usage anywhere in `design/*.html` (grepped, confirmed empty).
  Add a `.file-upload-row` pattern: hidden `<input type="file">` + a styled `.btn`-like `<label>`
  ("Choose File") + a muted filename readout span. Needed by ClientDetail/ProjectDetail Resources
  tabs.
- **Multi-add drafts card**: dashed-border card (`border:1px dashed var(--border)`), numbered draft
  rows each with a "Remove" button, "+ Add Another" ghost button, single primary commit button.
  Needed by ProjectDetail/ProjectMilestones (milestones) and TeamMemberDetail (bank accounts).
- **CSV export helper**: Dashboard/FinanceDashboard need a *real* client-side CSV Blob download
  (`downloadCSV(filename, headers, rows)` — build/revoke an object URL, synthetic `<a download>`
  click). Add this as a small shared helper in `shell.js` rather than duplicating it per screen.
  Existing `shell.js` `.export-bar` click handler (`window.alert('Demo: export ...')`) stays as-is
  for every list screen that already uses it (Leads/Opportunities/Clients/BdsPartners/Projects/
  Receivables/Payables/Reports/etc. per §5 decision to retain export bars) — these are two
  different, both-needed demo affordances, not a replacement of one by the other.
- **Query-string `?id=` + localStorage-list hydration**: multiple detail screens
  (OpportunityDetail, ClientDetail, BdsPartnerDetail, TeamMemberDetail) now read an `id` from
  `location.search` and hydrate from a localStorage-seeded list written by their list screen. The
  current SPA router in `shell.js` (`navigate()`/`applyDoc()`) swaps `<main>` innerHTML on nav
  clicks and re-runs `<script data-page>` blocks, but never touches `location.search` and doesn't
  preserve query strings through `pushState`. Add: (a) `pushState`/`navigate()` must preserve the
  full `href` including any `?id=...`; (b) each affected screen's own inline `data-page` script is
  responsible for reading `new URLSearchParams(location.search).get('id')` and the matching
  localStorage list — this is per-screen logic, not a shell.js addition beyond the query-preserving
  fix.

### 2.7 Edit/Discard/Save — scoping clarification for the implementer
The shared rule ("Discard replaces Cancel, Save commits") applies to **header-level, whole-tab-or-
whole-page Edit toggles** only (ClientDetail, BdsPartnerDetail, TeamMemberDetail, Profile). Inline
per-row edits (a single milestone row's Edit/Save, a modal's Cancel/Save) keep plain "Cancel" — this
is consistent across every dc-script that has both kinds of edit affordance in the same screen
(ProjectDetail milestones use row-level "Cancel", while ClientDetail's page-level toggle uses
Discard). **One deliberate deviation**: `Profile.dc.html`'s script itself labels its page-level
toggle button "Cancel" (not "Discard") and has no snapshot/revert logic — this contradicts the
README's own stated rule. Build `profile.html` per the documented Discard/Save convention (with a
real snapshot-and-revert), not per the script's literal (buggy) button label, for consistency with
every other page-level Edit screen.

---

## 3. Money/ledger correctness flags (finance non-negotiables — must fix, not port as-is)

Per CLAUDE.md #1–#4 (integer poisha, computed balances, one-payment-one-transaction, immutable
posted rows) and `hub-ledger`/`accountant-expert` review of the handoff's mock logic:

1. **`accounts.html` (BankAccounts)**: the handoff's Edit modal exposes a directly-editable
   "Balance" field written straight to state. Fix: only "Opening Balance" is settable, and only at
   account creation; the displayed running balance is always `opening + ΣIN − ΣOUT` — for this
   static mockup, keep the balance column as a **display-only** figure (no `<input>` for it in the
   Edit modal), annotated so Phase 2+ wires it to the real computed query.
2. **`receivables.html`**: the handoff's Edit modal has a directly-editable "Amount received so
   far" field, and "Mark Received" is a bare status/field flip. Fix: Edit modal covers invoice
   metadata only (invoice #, due date, invoiced amount); "Received" renders as a computed/display
   value; "Mark Received" is styled as an action that would create a real Transaction in Phase 2+
   (mockup can still flip local state for the demo, but the UI must not present "received amount"
   as a freely-typed number next to invoiced amount, since that models a stored mutable balance).
3. **`payables.html`**: "Mark Paid" is likewise a bare status flip in the script — acceptable to
   mirror in the static mockup (no live backend), but note in-code (HTML comment, not visible copy)
   that Phase 2+ must route this through a real `$transaction`.
4. **`payment-entry.html`**: the script's submit is local-state only, no persistence. This is
   expected for a design mockup — keep it, but structure the demo submit handler as a single
   function so Phase 2+ wiring (one payment record ⇒ one Transaction, same `$transaction`) is a
   clean drop-in rather than scattered across per-field handlers.

None of the other finance screens (FinanceDashboard, Accounting, Transactions, ProjectCosts,
Reports) have a stored-mutable-balance or immutability problem — they're read/derived views and
should stay that way.

---

## 4. Per-screen behavior deltas (condensed)

Full detail was gathered screen-by-screen (CRM: Leads/Opportunities/OpportunityDetail/Clients/
ClientDetail/BdsPartners/BdsPartnerDetail; Projects: Projects/ProjectDetail/ProjectMilestones/
MilestoneDetail/DeliverableDetail; Team/Admin: Teams/TeamMembers/TeamMemberDetail/Users/Roles/
AuditLogs; Finance: FinanceDashboard/BankAccounts/PaymentEntry/Transactions/Receivables/Payables/
Accounting/ProjectCosts/Reports; Auth: Login/Profile/Settings/Dashboard). The essential,
non-visual facts an implementer needs are folded into §1's disposition column and §3/§5 flags.
Key mechanics worth restating explicitly because they're easy to build wrong:

- **Convert-to-Opportunity** (Leads): button shown only when `status ∈ {Qualified, Proposal, Won}`
  and not already converted; on click, appends to `localStorage['hub-converted-leads']`, flips the
  lead to `Won`/`converted:true`, navigates to Opportunities, which consumes-and-clears the key on
  mount (unshift then `removeItem`).
- **Create Client → Create Project chain** (OpportunityDetail): shown when stage is `Won`; writes a
  client stub to `hub-created-clients` (consumed by Clients), then a project stub to
  `hub-created-projects` (consumed by Projects) — a new key beyond the README's documented 5.
- **`hub-team-members`**: new key (TeamMembers writes, TeamMemberDetail reads via `?id=`) beyond
  the README's documented list — add to the shell delta's handoff-key inventory.
- **Stage advance in OpportunityDetail is NOT sequentially enforced** in the script — any of the 6
  stage buttons is clickable at any time (only the Lead→Opportunity and Opportunity→Client
  boundaries are gated). This contradicts the README's "deliberate one-directional pipeline" prose
  for opportunity stages specifically. Build per the script (unenforced) but flag — see §6 Open
  Questions.
- **Merged Assign modal** (Projects list + ProjectDetail "Manage Team"): one team dropdown that
  bulk-checks its members into the roster checklist below, plus individual per-member checkboxes;
  disabled/hidden entirely for `Completed`-status projects.
- **Method-first Payment Entry**: Cash shows only Amount/Direction/Date/Description/Notes. Bank/MFS
  additionally show Entry Type (`project`/`team`/`other` — **3 categories in the actual script**,
  not the 4 the README prose implies; "Vendor Payment" is not a distinct category, it folds under
  "Other" — build per script), "our account" (filtered to method, sourced from `hub-bank-accounts`),
  and for project/team entries a counterparty account constrained to
  `{Bank: [Bank,Card,MFS], MFS: [MFS,Bank,Card]}` with an inline "manage this person's accounts"
  modal. "Other" entries add a Chart-of-Accounts dropdown filtered to Revenue/Asset (Money In) or
  Expense/Liability (Money Out).
- **Accounting tab order**: Chart of Accounts → Journal Entries → Account Ledger → Trial Balance
  (confirmed in script, matches README). "Add Code" is a dropdown of predefined codes only (minus
  ones already added), with a live Name/Type/Normal-Balance preview before "Save Code" commits.
- **Roles + Permissions merge**: NOT a tab bar — it's a two-view toggle within one screen (role
  list ↔ a "Permissions — {role}" sub-view reached via "Edit Permissions", with a back-link and its
  own Save). Build the sub-view's **content** from old `permissions.html`'s resource.action catalog
  (Module/Action/Description/Risk/Assigned-Roles, ~29 real keys), not the handoff's generic
  6-module × {View,Edit,Delete} matrix — see §5.
- **TeamMemberDetail's single Edit/Discard/Save gates all 5 tabs at once** (one `editing` boolean;
  `startEdit()` snapshots every editable field across every tab; `discardEdit()` restores the whole
  snapshot). The Active/Inactive status toggle is a separate, always-available header control,
  independent of edit mode.
- **BdsPartner Phone field**: already existed in the OLD list screen and detail screen as a static
  field — the real delta is that BdsPartnerDetail's Overview becomes fully editable (all fields,
  including Phone) via the new Edit/Discard/Save flow, not that Phone itself is new.

---

## 5. Regressions & judgment calls requiring a decision (resolved here, logged for DECISIONS.md)

Each item below is a place where building the handoff literally would **remove real functionality**
present in the currently-shipped `design/` screens, or where the handoff's own script contradicts
its README prose. Default resolution is stated; anything marked **OPEN** needs stakeholder sign-off
before/while building and is repeated in §7.

| # | Screen(s) | Conflict | Default resolution |
|---|---|---|---|
| 1 | `roles.html` | Handoff's Permissions sub-view is a coarse 6×3 boolean matrix, not resource.action keys (CLAUDE.md #7 non-negotiable) | Port old `permissions.html`'s real catalog content into the new sub-view shell |
| 2 | `users.html` | No last-active-SUPER_ADMIN deactivate guard in the script (CLAUDE.md #9) | Add a disabled-state + tooltip on the deactivate control when it would remove the last active SUPER_ADMIN |
| 3 | `login.html` | New handoff drops register/forgot/reset states entirely | Keep old's states; new's minimal sign-in is a subset, not a replacement |
| 4 | `project-detail.html` | New handoff is tabless (no Overview/Finance/Activity content) | Keep old's 6-tab structure; slot new interactions into Team/Milestones/Resources only |
| 5 | `client-detail.html` | New Resources tab drops old's milestone/tag-scoped filtering | Keep old's filter UI, layer new's add/remove-with-upload on top |
| 6 | `audit-logs.html` | New script drops Entity filter, date-range filter, export bar | Keep old's fuller filter/export set, add new's Action filter/search |
| 7 | `finance-dashboard.html` | New script drops Income-vs-Expenses and Top-Projects-by-Profitability | Keep both old cards alongside new's period/KPI/aging additions |
| 8 | `accounts.html` | Old was CoA-shaped (Parent hierarchy); new is org-accounts-shaped | Adopt new structure — CoA now correctly lives in `accounting.html` instead |
| 9 | `payables.html` | No Invoiced/Paid/Outstanding tracking, asymmetric with Receivables | **DECIDED:** add symmetric tracking |
| 10 | `project-costs.html` | New "budget vs actual" answers a different question than old's profitability rollup | **DECIDED:** replace old profitability rollup with new budget-vs-actual view |
| 11 | `reports.html` | New script is a single flat view; old implied multiple tabs (profitability/cash-flow-forecast/aging); new also has an odd cross-domain "New Leads" KPI | Keep old's fuller structure, add new's KPI/tables, drop "New Leads" from this screen |
| 12 | `opportunity-detail.html` | Stage advance not sequentially enforced in script, vs. README's "one-directional pipeline" prose | **DECIDED:** enforce forward-only stage moves (block backward except explicitly re-opening a Lost deal) |
| 13 | `milestone-detail.html` / `deliverable-detail.html` | New scripts are much simpler (checklist + status only) than old's implied "approval flow, payment record" (per current `index.html` screen descriptions) | Keep old's approval/payment-record affordances, add new's comments thread + status select |
| 14 | `payment-entry.html` | README prose says 4 entry-type categories incl. "Vendor Payment"; script only has 3 (project/team/other) | Build per script (3 categories); note if business wants Vendor split out later |
| 15 | list screens generally (Leads/Opportunities/Clients/BdsPartners/Receivables/Payables/etc.) | New handoff drops export bars/pagination inconsistently across screens (kept on Projects, dropped elsewhere) | Retain the existing `.export-bar` demo pattern everywhere it exists today, for cross-screen consistency; layer new filters/sort/modals on top |

---

## 6. Build batch plan (≤3 files per batch, dependency order)

| Batch | Files | Notes |
|---|---|---|
| 1 | `shell.js`, `styles.css`, `theme.js` | Foundation: wordmark, sidebar auto-collapse rewrite, topbar search/notif dropdowns, footer flex-shell restructure, new file-upload/draft-card patterns, CSV helper, query-string-preserving nav. Everything else depends on this. |
| 2 | `app-shell.html`, `index.html`, `login.html` | Shell QA reference + directory page regenerated to new file set; Login merged (keep old states) |
| 3 | `dashboard.html`, `profile.html`, `settings.html` | Auth/account area |
| 4 | `leads.html`, `opportunities.html`, `opportunity-detail.html` | CRM pipeline core, built in pipeline order |
| 5 | `clients.html`, `client-detail.html`, `bds-partners.html` | |
| 6 | `bds-partner-detail.html`, `projects.html`, `project-milestones.html` | |
| 7 | `project-detail.html`, `milestone-detail.html`, `deliverable-detail.html` | |
| 8 | `teams.html`, `team-members.html`, `team-member-detail.html` | |
| 9 | `users.html`, `roles.html`, `audit-logs.html` | **Read `permissions.html` content before deleting it** — port into `roles.html` first, then retire the file |
| 10 | `finance-dashboard.html`, `accounts.html`, `payment-entry.html` | Money-flag fixes (§3 items 1, 4) apply here |
| 11 | `transactions.html`, `receivables.html`, `payables.html` | Money-flag fixes (§3 items 2, 3) apply here |
| 12 | `accounting.html`, `project-costs.html`, `reports.html` | |

12 batches, 36 files, each a single `hub-implementer` delegation per Delegation Rules.

---

## 7. Definition-of-Done gates

### 7.1 Static gates (hub-reviewer, grep-able)
1. **Zero dead hrefs**: every `href="*.html"` (query strings stripped) across `design/*.html`
   resolves to an existing file in `design/`.
   `grep -ohE 'href="[a-z-]+\.html' design/*.html | sed 's/href="//' | sort -u` — diff against `ls design/*.html`.
2. **Canonical shell classes** present on every screen except `index.html`:
   `grep -L 'class="app-shell"' design/*.html` (excluding index.html) → empty; same for `sidebar`,
   `nav-item active` per active-nav screen.
3. **Zero raw hex outside `tokens.css`**: `grep -rEn '#[0-9a-fA-F]{3,8}' design/*.html design/styles.css design/shell.js design/theme.js` → empty (SVGs use `stroke="currentColor"`, no hex).
4. **Money formatting**: every currency figure uses `৳` + 2-decimal tabular formatting —
   `grep -n '৳[0-9]' design/*.html` sanity-checked against `.data`/`.amount` class usage; no bare
   numeric balance without the glyph.
5. **No leaked dc-format artifacts**: `grep -rl 'text/x-dc\|data-dc-script\|support.js\|<x-dc>\|dc-import' design/*.html` → empty.
6. **`permissions.html` retired cleanly**: `test ! -f design/permissions.html && ! grep -rl 'permissions.html' design/*.html`.
7. **No editable Balance input** in `accounts.html`'s Edit modal: manual grep of the modal's
   `<input>` fields — "Balance" must not appear as an editable field label (only "Opening Balance"
   at create time).
8. **Resource.action keys present** in `roles.html`'s Permissions sub-view:
   `grep -oE '[a-z]+\.[a-z]+' design/roles.html | sort -u` returns the ported catalog's keys
   (e.g. `leads.convert`, `transactions.reverse`), not a generic View/Edit/Delete matrix only.

### 7.2 Empirical gates (hub-tester, webapp-testing skill, browser)
1. **Sidebar responsive**: load `dashboard.html` at 1440px; resize to 800px → `.sidebar` computed
   width ≈64px (icon rail), no off-canvas drawer/backdrop appears; resize back to 1440px → stays
   whatever the user last set (no forced re-expand).
2. **Global search**: type "Acme" into the topbar search on `dashboard.html` → a dropdown appears
   with a matching Client result; press Enter → navigates to that result's target screen.
3. **Edit/Discard/Save**: on `client-detail.html`, click Edit → fields become inputs and the button
   row shows "Discard" (never bare "Cancel") + "Save"; change a field, click Discard → field value
   reverts to its pre-edit value.
4. **Multi-add drafts**: on `project-detail.html`'s Milestones tab, click "+ Add Milestone" → one
   draft row appears; click "+ Add Another" → a second draft row appears; remove one, fill the
   remaining, click the commit button → exactly one new milestone appears in the list and the
   drafts area closes.
5. **Payment Entry method-first**: select "Cash" → only Amount/Direction/Date/Description/Notes
   fields are visible; switch to "Bank" → Entry Type + Our Account + counterparty fields appear;
   pick "Other" as entry type → a Chart-of-Accounts dropdown appears, filtered by the selected
   Direction (Money In → Revenue/Asset; Money Out → Expense/Liability).
6. **Merged Assign modal**: on `projects.html`, click "Assign" on an Active-status row → modal
   shows a team dropdown and individual member checkboxes; selecting a team checks its members;
   a Completed-status row has no Assign button at all.
7. **Responsive no-overflow**: `dashboard.html`, `project-detail.html`, `payment-entry.html` render
   with zero horizontal scroll and no element overlap at 390/768/900/1440px.
8. **Footer pinning**: on a short-content screen, the footer sits at the bottom of the viewport
   with no gap below it; on a long-content screen (e.g. `transactions.html` with many rows), the
   footer only appears after scrolling past the content — never overlapping it.
9. **Accounting Add Code flow**: Chart of Accounts tab → "Add Code" → pick a predefined code →
   preview shows Name/Type/Normal-Balance → "Save Code" → the new row appears in the table and that
   code is no longer offered in the dropdown.
10. **Roles/Permissions sub-view**: on `roles.html`, click "Edit Permissions" on a role card → view
    swaps to a "Permissions — {role}" screen showing resource.action-keyed rows (not a generic
    3-column matrix) → Save returns to the role list.

### 7.3 Gatekeeper criteria (authoritative-source mapping for the standalone DoD audit)
- **`analysis/task-breakdown.md` Phase 0 AC**: every screen opens standalone with zero build step;
  consistent tokens (no hardcoded hex); ৳-formatted money with tabular numerals; work+payment
  statuses visually paired; mobile 390px usable on shell + `dashboard.html` + `project-detail.html`;
  REQ-32 congestion gate (≤7 primary columns above the fold per list table, disclosure pattern for
  the rest) holds on every rebuilt list screen, not just the ones already gated previously.
- **CLAUDE.md #1–#4**: no floats anywhere in money display logic; `accounts.html`/`receivables.html`
  show no editable stored-balance field (§3 fixes verified in place); `payment-entry.html`'s submit
  path is structured for a single-transaction wire-up; `transactions.html` has no edit/delete
  affordance on posted rows.
- **CLAUDE.md #7**: `roles.html`'s Permissions sub-view uses `resource.action` keys, not the
  handoff's generic matrix (cross-check with §7.1 gate 8).
- **CLAUDE.md #9**: `users.html` visually preserves a last-active-SUPER_ADMIN deactivate guard.
- **DESIGN.md**: dark-first Swiss minimalism intact; dual-anatomy status chip system unchanged
  (already conformant — no delta needed, confirmed by reading `styles.css`'s existing `.chip`/
  `.chip-pay` rules against the README's stated chip spec); the DEA letter-reveal splash loader is
  untouched; only the sidebar-brand wordmark is simplified per §2.2.
- **`docs/designs/hub-design-system.md`**: superseded pointer honored — zero new color literals
  introduced outside `tokens.css`.

---

## 8. Open questions — RESOLVED (stakeholder sign-off obtained 2026-08-31)

1. **OpportunityDetail stage sequencing** — **DECIDED:** enforce forward-only; block moving a stage
   backward except explicitly re-opening a Lost deal. (item 12 in §5)
2. **Payables symmetry** — **DECIDED:** add Invoiced/Paid/Outstanding tracking to match Receivables.
   (item 9 in §5)
3. **ProjectCosts purpose** — **DECIDED:** replace the old profitability rollup entirely with the new
   budget-vs-actual-by-category view (not "keep both" — supersedes the plan's original default).
   (item 10 in §5)
4. **PaymentEntry "Vendor Payment"** — **DECIDED:** fold into "Other"; build per script, 3 categories,
   no 4th category added. (item 14 in §5)

See `docs/memory/DECISIONS.md` for the logged decision entry.

---

**Spec written:** `docs/agentic/build-specs/` is not used for this document per the task's explicit
instruction — this plan lives at `docs/designs/phase0-redesign-claude-handoff-plan.md` as directed.
