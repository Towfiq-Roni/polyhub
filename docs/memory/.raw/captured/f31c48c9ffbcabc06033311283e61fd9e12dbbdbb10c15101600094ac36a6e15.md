# Task Breakdown

> Ordered, dependency-aware checklist. **Phase 0 = full UI design in HTML** (stakeholder directive: design before any code). Phases 1–8 then mirror spec §31 (1 = groundwork, 2–8 = spec phases 1–7). Each phase lists tasks + acceptance criteria (AC). Defaults from `requirement-gaps.md` § Decision Checklist are adopted unless overridden.
>
> ⚠️ Renumbered 2026-08-22 (DEC-028): old Phase 0→1, 1→2 … 7→8. Historical docs referencing old numbers map via +1 shift on build phases.

---

## Phase 0 — Full UI Design (HTML)  *(no build tooling — static HTML/CSS only)*

**Design foundations**
- [ ] `design/tokens.css` — full token layer from generated design system (colors, spacing scale at density 8, type scale, radii, shadows, status colors for work/payment states)
- [ ] `design/styles.css` — shared component styles: app shell (sidebar+topbar), tables (tabular numerals, right-aligned ৳), cards/KPIs, badges/chips (status pairs), forms, buttons, modals, empty/loading states
- [ ] Design-system record: chosen palette/type/effects + rejected alternatives → `docs/designs/hub-design-system.md`

**Screens (30 per spec §25; each = static HTML using shared CSS, sample §20 data)**
- [ ] `index.html` — screen index linking every mockup
- [ ] Auth: login.html
- [ ] Shell: app-shell demo (sidebar nav by module, topbar, user menu)
- [ ] Dashboard: dashboard.html (financial strip + operational lists + attention items)
- [ ] CRM: clients.html · client-detail.html · leads.html · opportunities.html · opportunity-detail.html
- [ ] Projects: projects.html · project-detail.html (§26 layout: financial summary, milestones w/ dual-status chips, team, resources tab w/ milestone dropdown filter + tag chips, recent activity) · milestone-detail.html · deliverable-detail.html
- [ ] Organization: teams.html · team-members.html · team-member-detail.html (§27 layout)
- [ ] BDS: bds-partners.html · bds-partner-detail.html (§28 layout)
- [ ] Finance: finance-dashboard.html (§29 layout) · accounts.html · transactions.html (filters bar) · receivables.html · payables.html · payment-entry.html (client/milestone modal form w/ TRX ID fields) · project-costs.html
- [ ] Administration: users.html · roles.html (permission matrix) · permissions.html · audit-logs.html · settings.html · reports.html

**AC:** every screen opens standalone in a browser with zero build step; consistent tokens everywhere (no hardcoded hexes); money always ৳-formatted with tabular numerals; work+payment statuses visually paired; mobile viewport (390px) usable on shell + dashboard + project detail; passes frontend-design anti-template critique + ui-ux-pro-max pre-delivery checklist; congestion gate per REQ-32 D1: ≤7 primary columns visible above the fold per list table, zero data loss via sanctioned disclosure patterns, verified per screen; stakeholder sign-off recorded as DEC entry before Phase 1 starts.

---

## Phase 1 — Repository, Tooling & Infrastructure  *(before any feature work)*

**Repo & standards**
- [ ] Monorepo scaffold: pnpm workspaces, TS strict configs, ESLint+Prettier, husky/lint-staged, commitlint
- [ ] `packages/shared`: status enums, permission keys, zod schemas, BDT money helpers
- [ ] Root scripts: `dev` · `lint` · `typecheck` · `test` · `build`

**Apps bootstrap**
- [ ] `apps/api`: NestJS init — config module, global pipes/filters, Swagger at `/api/docs`, `/api/v1/health`
- [ ] Prisma init + `schema.prisma` skeleton (User/Role/Permission first), dev compose for PG16
- [ ] `apps/web`: Next.js App Router shell — auth layout group, dashboard placeholder, Serwist PWA (manifest, SW, install prompt), Tailwind+shadcn base; **tokens.css translated to Tailwind theme**

**Infra & pipeline**
- [ ] Multi-stage Dockerfiles (arm64+amd64) for api/web; prod compose + nginx conf (`/`, `/api`, internal `/files`)
- [ ] GitHub Actions: `ci.yml` (lint→typecheck→unit→e2e), `deploy.yml` (GHCR push → SSH deploy → smoke → rollback)
- [ ] Oracle VM live: sslip.io HTTPS, backups→B2 cron verified, keepalive workflow

**AC:** `https://<host>` serves the PWA shell over TLS; CI green on PR; deploy of a "hello" release succeeds and rolls back cleanly; backup file appears in B2.

---

## Phase 2 — Foundation & Access *(spec §31 P1)*

- [ ] Schema v1 migration (all entities per requirements-analysis §5)
- [ ] Permission catalog seeder (~60 keys)
- [ ] Auth module: login/refresh/logout/me, argon2id, lockout, SUPER_ADMIN env-seed bootstrap
- [ ] Users CRUD + deactivation guard (≥1 active SUPER_ADMIN) + admin reset
- [ ] Roles CRUD (+archive rule gap P-4), role-permission matrix UI, user-role assignment
- [ ] PermissionsGuard + decorator wired globally; union semantics (A2); e2e denial tests
- [ ] Audit service + interceptor: before/after snapshots; audit list screen
- [ ] Teams CRUD · Team members CRUD · Org roles lookup
- [ ] Screens (from approved mockups): Login · Users · Roles · Permissions · Audit Logs · Teams · Team Members(+detail) · Settings stub

**AC:** non-admin denied without granted keys (e2e asserts denials); audit rows capture actor/before/after; seeded admin manages everything; screens match Phase 0 mockups.

---

## Phase 3 — CRM *(spec §31 P2)*

- [ ] Clients CRUD + detail page
- [ ] Leads CRUD + status flow + BDS attribution field
- [ ] Opportunities CRUD + stage flow
- [ ] BDS partners CRUD (early — attribution FKs needed here)
- [ ] Lead→Opportunity conversion (gap P-1 default)
- [ ] Opportunity→Won conversion (spec §5.4): create project carrying client/title/value→contractValue/notes/BDS partner + `sourceOpportunityId`
- [ ] Screens: Clients(+detail) · Leads · Opportunities(+detail) · BDS Partners(+detail)

**AC:** full chain Lead(BDS-attributed)→Opportunity→Won→Project preserves client + BDS link end-to-end (e2e).

---

## Phase 4 — Projects, Milestones, Deliverables & Resources *(spec §31 P3 + added Resources)*

- [ ] Projects CRUD + statuses Draft→Planning→Active→On Hold→Completed/Cancelled; auto code; optional owner
- [ ] Assignments UI both directions; no role-on-project anywhere
- [ ] Milestones: ordered creation/reorder (contiguous sequence), dates, amount, paymentDueDate
- [ ] Dual-status engines: work machine (M1) + payment machine (M2 w/ completion-trigger default F-3); never-payment-blocked rule (M4) unit-pinned
- [ ] Deliverables CRUD: required flag, submit/approve/reject flow
- [ ] Milestone completion gating: all-required-approved + override-with-reason (audit) (P-3)
- [ ] Resources: upload API (25MB/type-whitelist, volume storage), metadata table unified w/ deliverable attachments (D-1)
- [ ] Project page Resources tab: tag chips + milestone dropdown filter; milestone-scoped files
- [ ] RBAC downloads via X-Accel-Redirect
- [ ] Permissions: projects.* / milestones.* / deliverables.* / resources.*
- [ ] Screens: Projects(+detail per mockup) · Milestone Details · Deliverable Details(in-tab)

**AC:** spec §20 scenario e2e — complete M1 unpaid → M2 startable → financials Received 0/Due 100k/NotDue 400k. Files upload; dropdown filters by milestone; unauthorized download = 403; screens match mockups.

---

## Phase 5 — Finance Foundation *(spec §31 P4)*

- [ ] Accounts CRUD (Cash/Bank/MFS, opening balance, BDT locked F-10) + derived balance endpoints (L1)
- [ ] TransactionCategory admin UI (seeded defaults, deactivate-only system cats) (P-8)
- [ ] LedgerAccount seed (CoA reference data, exactly 14 rows: 1 Asset "Cash & Bank" + 2 Revenue
      + 8 Expense category targets + 1 Equity "Retained Earnings" plug + 2 "Uncategorized
      Income"/"Uncategorized Expense" fallbacks — no parentId/hierarchy in v1) +
      `TransactionCategory.ledgerAccountId` nullable FK, seeded for all 10 spec §11.2
      categories, mapped 1:1 to the Revenue/Expense rows above (F-11)
- [ ] TransactionCategory admin form: LedgerAccount picker restricted to type-compatible
      targets only (Income-direction -> Revenue/Uncategorized-Income, Expense-direction ->
      Expense/Uncategorized-Expense) — enforced server-side in the shared `packages/shared`
      zod schema for the category-update DTO, not UI-form-only (F-11)
- [ ] Manual Transaction entry (IN/OUT generic income/expense) — atomic write, TRX ID + note
- [ ] Ledger screen: full §23 filter set, pagination, running totals
- [ ] Reversal flow (L3, `transactions.reverse`)
- [ ] Company balance rollup (per-account + total active)

**AC:** ledger math matches worked example to the poisha; reversal restores prior balances exactly and is audited; no edit/delete paths exist for posted rows (F-8). LedgerAccount seed exactly 14 rows, type-compatibility validation rejects a direct API call with a mismatched mapping (not just a UI form) (F-11).

---

## Phase 6 — Project Finance *(spec §31 P5)*

- [ ] Client/milestone payment entry: ClientPayment ⇒ exactly one IN txn (L2 atomic e2e)
- [ ] Partial payments: allocations ≤ milestone amount; paymentStatus recomputed NotDue→Pending→PartiallyPaid→Paid
- [ ] Overdue display-only derivation (M3)
- [ ] Receivables engine: Received / Currently Due / Not Yet Due / Overdue (project + company-wide, §7.4)
- [ ] Project costs CRUD: paid ⇒ immediate OUT txn; unpaid ⇒ payable; later "Record Payment" flips paid + OUT txn (F-9)
- [ ] Project Financial Summary panel (mockup §26 layout)
- [ ] Unallocated client credit handling (F-4 default)
- [ ] Permissions: milestone_payments.* separate from view rights (A4)
- [ ] Screens: Finance Dashboard · Payment Entry · Receivables · Project Costs

**AC:** §12.2 partial-payment example reproduces exactly; after ৳100k M1 payment summary matches §20; unpaid cost appears under Payables until recorded; finance-integrity checks I1/I2/I5/I7 green.

---

## Phase 7 — People & BDS Finance *(spec §31 P6)*

- [ ] TeamMemberPayable manual entries (F-1 default)
- [ ] Team payments ⇒ OUT txn; member totals ↑ payable ↓; project-linked ⇒ project cost (§13)
- [ ] Team member detail page (mockup §27)
- [ ] BDS compensation per project (fixed; activates on Active per F-2)
- [ ] BDS payments ⇒ OUT txn; outstanding = agreed − paid (§14)
- [ ] BDS partner detail (mockup §28)
- [ ] Payables breakdown endpoint (Team/BDS/Other)

**AC:** §18-style breakdown sums correctly across three sources; member/partner histories reconcile 1:1 with transactions; finance-integrity I8 green.

---

## Phase 8 — Dashboard & Reports *(spec §31 P7)*

- [ ] Company dashboard: financial strip + operational lists + attention-items feed
- [ ] Finance dashboard (mockup §29 layout)
- [ ] Reports: company/project/people suites (§24) + CSV export behind `reports.export`
- [ ] Reports: Financial Statements — trial balance / P&L / balance sheet, computed at query
      time from Transaction+TransactionCategory+LedgerAccount+Account (no new stored journal
      rows). Trial Balance/P&L use `Equity_TB = Σopening + cumulative(Income-Expense)`;
      Balance Sheet uses a DIFFERENT `Equity_BS = Equity_TB + AR - AP` (folding in
      Receivables/Payables), as-of-today only, no period picker — do not reuse `Equity_TB`
      for the Balance Sheet. Behind existing `reports.view`/`reports.export` (F-11)
- [ ] Search/sort/filter parity all major lists (§23); empty/loading/error states; PWA mobile QA vs mockups
- [ ] Settings real content (P-7); audit views final

**AC:** dashboard numbers equal sum-of-parts on seeded fixtures; attention items fire for each seeded condition; CSV respects permissions. Trial Balance and P&L always balance to zero by construction; Balance Sheet always satisfies Assets = Liabilities + Equity_BS exactly, as a real balance test, not a component-reconciliation test that could hide a gap (F-11).

---

## MVP Acceptance Criteria (mapped from spec §32)

| # | Spec requirement | Verified by |
|---|---|---|
| 0 | Approved full HTML design precedes implementation | Phase 0 AC |
| 1 | Users + granular RBAC | Phase 2 AC |
| 2 | Teams & assignment | Phase 2 AC |
| 3 | Clients & opportunities | Phase 3 AC |
| 4 | BDS chain preserved | Phase 3 AC |
| 5–7 | Projects/milestones/deliverables | Phase 4 AC |
| 8 | Next milestone independent of payment | Phase 4 §20-scripted e2e |
| 9–10 | Manual payments + computed financials | Phase 6 AC |
| 11 | Project costs paid/unpaid | Phase 6 AC |
| 12–13 | Team/BDS payments | Phase 7 AC |
| 14 | People/partner outstanding | Phase 7 AC |
| 15 | Ledger-derived company balance | Phase 5 AC |
| 16 | Project + company financial views | Phase 6/8 AC |
| 17 | Audit history | Phases 2–8 interceptors |

*(Plus added-scope: resources w/ milestone dropdown + tag chips — Phase 4 AC.)*

## Suggested Sequencing Notes

- Phase 0 (design) must reach stakeholder sign-off before Phase 1 scaffolding translates it to Tailwind tokens.
- Phase 1 must fully precede features (pipeline gates everything).
- Phases 3→4 sequential (conversion needs project entity). Phase 5 may parallel late Phase 4; Phase 6 depends on both.
- Keep-alive + backups live from day one of Phase 1 — cheapest insurance available.
