# Software Requirements Specification

## Small Company Management System ("hub")

| | |
|---|---|
| **Document title** | Small Company Management System — Software Requirements Specification |
| **Version** | 1.1 |
| **Date** | 2026-09-10 |
| **Author** | towfiq |
| **Based on** | Small Company Management System BRD v1.3 |
| **Status** | Approved |

## 1. Introduction

### 1.1 Purpose

Elaborates BRD v1.2's business-level functional requirements into testable system behavior: exact data model, mechanisms, state machines, API operation shapes, and acceptance detail — the "how" underneath the BRD's "what."

### 1.2 Document Conventions

Requirement IDs carry a module prefix (`FR-<MODULE>-##`), inherited unchanged from the BRD. IDs added here continue each module's existing sequence. Priority: **M** (Must-have), **S** (Should-have), **C** (Could-have) — inherited from the BRD unless stated otherwise. Every requirement row uses "the system shall..." phrasing. NFR IDs use `NFR-<CATEGORY>-##`.

### 1.3 Intended Audience

Implementers (NestJS/Next.js/Prisma), the solution architect reviewing design deltas, and the test-writer/QA agent verifying acceptance criteria.

### 1.4 Product Scope

Same as BRD §4 — CRM, Projects/Milestones/Deliverables, Organization, BDS Partners, double-entry Finance, Administration, Dashboard/Reports, for up to 5 concurrent internal users.

### 1.5 Definitions, Acronyms, Abbreviations

| Term | Meaning |
|---|---|
| GL | General Ledger — the complete set of posted journal entries. |
| COA | Chart of Accounts. |
| JE | Journal Entry — one balanced posting (≥2 lines, debits = credits). |
| AR / AP | Accounts Receivable / Accounts Payable (used here only as computed report concepts — see §3.6, cash-basis GL). |
| RBAC | Role-Based Access Control. |
| Poisha | ×100 integer subunit of ৳ (BDT) — hub's internal money representation. |

### 1.6 References

- `planning/BRD.md` v1.2 (this document's source)
- `docs/adr/0005-money-as-integer-poisha.md`, `0006-immutable-ledger-reversals.md` (unaffected by the double-entry change)
- `docs/adr/0011-derived-chart-of-accounts-reporting.md` (superseded by this SRS's Finance model — a replacement ADR is required before build, see Appendix B)

## 2. Overall Description

### 2.1 Product Perspective

New internal system, no predecessor to integrate with. Single Next.js 15 PWA frontend, single NestJS 11 REST API, single PostgreSQL 16 database, self-hosted on one Oracle Always Free VM.

### 2.2 Product Functions (summary)

Dashboard overview; CRM (clients/leads/opportunities → project conversion); Projects (milestones, deliverables, dual status tracking); Organization (teams, members, assignments); BDS partner tracking and compensation; double-entry Finance (chart of accounts, journal entries, payments, receivables/payables, financial statements); Administration (users, roles, permissions, audit, settings).

### 2.3 User Classes and Characteristics

| Class | Characteristics |
|---|---|
| Super Admin | Full access; ≥1 always active; manages users/roles/permissions/teams. |
| Finance-permissioned user | Can post payments/costs and view financial statements; separate create/reverse permissions from view. |
| Project/Sales-permissioned user | Manages projects/milestones/deliverables or clients/leads/opportunities per assigned role. |
| Viewer | Read-only on assigned modules. |

Non-technical business users; no accountant on staff (confirmed during BRD reversal discussion — double-entry is stakeholder preference for correctness/reporting, not staffed bookkeeping expertise). UI must not require accounting literacy to perform routine actions (payment entry, cost entry) — journal-entry generation is entirely system-driven (BRD FR-FIN-16).

### 2.4 Operating Environment

Docker Compose on Oracle Always Free ARM VM, nginx reverse proxy, `<ip-dashed>.sslip.io` TLS via Let's Encrypt. PostgreSQL 16 via Prisma 6. Modern evergreen browsers, PWA-installable.

### 2.5 Design and Implementation Constraints

- Money: integer poisha (×100) end-to-end; no floats (BRD NFR-01).
- All balances (account, chart-of-accounts, company) computed from posted journal entries at query time — no stored mutable balance field.
- One user-facing payment/cost action ⇒ exactly one journal entry, posted in the same database transaction as its business record (e.g. `MilestonePayment` + its `JournalEntry`).
- Posted journal entries immutable; corrections only via a linked reversing entry (`refType='REVERSAL'`).
- RBAC permission keys live only in `packages/shared`, format `resource.action`, lowercase, allow-only union semantics.
- ≤5 concurrent users — no need for connection pooling/read-replica sophistication.
- $0 recurring cost — no paid third-party services (email, SMS, payment gateway) may be introduced.

### 2.6 Assumptions and Dependencies

Same as BRD §8. Additionally: chart of accounts is flat (no hierarchy) in v1; TRX ID is a free-text reference field, no uniqueness constraint; GL is cash-basis (journal entries post only when cash actually moves — see §3.6).

## 3. System Features (Functional Requirements)

### 3.1 Dashboard (DASH)
Priority: M · Actors: all authenticated users (scoped by permission) · Precondition: user authenticated.

| ID | Requirement | Priority |
|---|---|---|
| FR-DASH-01 | The system shall display, computed live at request time: available balance (Σ across active money-type COA accounts), total receivable, total payable, income/disbursement for the current calendar month, net cash flow. | M |
| FR-DASH-02 | The system shall display: count of active projects, count of milestones by work status, count of completed-but-payment-not-fully-paid milestones, count of open leads/opportunities, milestones with due date within the next 14 days. | M |
| FR-DASH-03 | The system shall surface an "Attention" list: milestones with `paymentStatus IN (Pending, Partially Paid) AND paymentDueDate < today` (derived overdue), deliverables with status `Submitted` awaiting review, team members/BDS partners with outstanding payable > 0. | M |

*Business rules: all Dashboard figures are read-only aggregates — no write path, no caching beyond normal HTTP response (data is small enough at ≤5-user scale to compute per request).*

### 3.2 CRM / Sales (CRM)
Priority: M · Actors: Sales-permissioned users, Super Admin · Precondition: authenticated + `clients.view`/`leads.view`/`opportunities.view` as applicable.

**Primary flow — lead to project:**
1. User creates a Lead (optionally attributing a BDS partner).
2. Lead status progresses New → Contacted → Qualified → Converted (to Opportunity) or Lost.
3. Opportunity carries the Lead's BDS attribution forward automatically.
4. Opportunity stage progresses Qualified → Proposal Sent → Negotiation → Won or Lost.
5. On Won: user triggers conversion; system creates (or the user selects an existing) Client, creates a Project pre-filled with the Opportunity's commercial data (estimated value → contract value) and BDS attribution.

| ID | Requirement | Priority |
|---|---|---|
| FR-CRM-01 | The system shall support Client CRUD with fields ID, name, company name (optional), phone, email, address, notes, status (`Active`/`Inactive`/`Archived`), createdBy/At, updatedBy/At. | M |
| FR-CRM-02 | The system shall support Lead CRUD with a status enum `New → Contacted → Qualified → Converted → Lost`, transitions enforced server-side (no arbitrary jump, e.g. `New` cannot go directly to `Converted`). | M |
| FR-CRM-03 | The system shall support Opportunity CRUD with a stage enum `Qualified → Proposal Sent → Negotiation → Won → Lost`. | M |
| FR-CRM-04 | The system shall allow an optional `bdsPartnerId` FK on Lead and Opportunity; when a Lead converts to an Opportunity, `bdsPartnerId` copies forward automatically (not re-entered). | S |
| FR-CRM-05 | On Opportunity → Project conversion: if no Client matches, the system shall auto-create a Client from the Opportunity's contact data, link it, and allow the user to edit it afterward; the system shall create a Project with `contractValue = opportunity.estimatedValue`, carry `bdsPartnerId` forward, and preserve the Opportunity↔Project relationship via FK (`Project.originOpportunityId`). | M |
| FR-CRM-06 | The system shall support search (name/company/email substring), filter (status/stage/assigned user/BDS partner), sort, and pagination (default page size 25) on Client/Lead/Opportunity lists. | S |

*Business rules: a Client's `status` does not cascade-restrict its Projects — an Archived client's existing projects remain visible/editable. Converting an already-Converted Lead or an already-Won/Lost Opportunity is rejected (409).*

### 3.3 Projects (PROJ)
Priority: M · Actors: Project-permissioned users, assigned team members (read), Super Admin · Precondition: authenticated + relevant permission.

**Primary flow — milestone progression:**
1. Project created (status `Draft`), milestones added in sequence order.
2. Milestone `workStatus` progresses `Pending → In Progress → Completed` independently per milestone; the next milestone's `workStatus` is never gated on a prior milestone's `paymentStatus`.
3. Milestone `paymentStatus` progresses `Not Due → Pending → Partially Paid → Paid`, driven only by (a) `workStatus` reaching `Completed` (→ `Pending`) and (b) payments recorded against it (§3.6).
4. `Overdue` is never stored — computed as `paymentStatus IN (Pending, Partially Paid) AND paymentDueDate < today`.

| ID | Requirement | Priority |
|---|---|---|
| FR-PROJ-01 | The system shall support Project CRUD: id, auto-generated project code (format `PRJ-YYYY-###`), client FK, description, owner (optional), startDate, expectedEndDate, actualEndDate, status enum (`Draft/Planning/Active/On Hold/Completed/Cancelled`), contractValue (integer poisha). | M |
| FR-PROJ-02 | The system shall render a Project overview aggregating: status, contractValue, received/due/notYetDue (§3.6 receivables engine), total project costs, BDS payable if attributed, milestone list, assigned team, deliverables, last 10 financial activity rows. | M |
| FR-PROJ-03 | The system shall support ordered Milestone CRUD per project: sequence (integer, unique per project), name, description, startDate, dueDate, completionDate, amount (integer poisha), paymentDueDate. Sequence shall be reorderable by an authorized user (`milestones.update`) at any time before the milestone reaches `Completed` workStatus. | M |
| FR-PROJ-04 | The system shall model `workStatus` and `paymentStatus` as two independent enums on Milestone, each with server-enforced valid transitions; no code path may block a `workStatus` transition on any `paymentStatus` value. | M |
| FR-PROJ-05 | `Overdue` shall be computed at read time only (see Primary flow step 4) — never a stored column or cached flag. | M |
| FR-PROJ-06 | The system shall support Deliverable CRUD per milestone: name, description, dueDate, status enum (`Pending/In Progress/Submitted/Under Review/Approved/Rejected`), submittedAt/approvedAt/approvedBy, required (bool), attachments (via the unified Resource model). | M |
| FR-PROJ-07 | A Milestone may transition `workStatus → Completed` only when all its `required=true` Deliverables are `Approved`, unless an authorized user with the separate `milestones.complete_override` permission completes it with a required free-text reason (persisted, audited). | M |
| FR-PROJ-08 | The system shall support search/filter (status/client/dateRange)/sort/pagination on Project and Milestone lists. | S |

*Business rules: deleting a Milestone with `workStatus != Pending` is rejected — archive-only pattern applies once work has started (no destructive delete of in-flight financial-adjacent records, consistent with BRD NFR-05's spirit even though Milestone itself isn't a ledger row).*

### 3.4 Organization (ORG)
Priority: M · Actors: Super Admin (team CRUD), Project/HR-permissioned users (member CRUD/assignment) · Precondition: authenticated + permission.

| ID | Requirement | Priority |
|---|---|---|
| FR-ORG-01 | The system shall restrict Team create/update/archive to users holding `teams.create`/`teams.update`/`teams.delete` — in practice Super Admin per BRD §9.1, enforced by permission grant, not a hardcoded role check. | M |
| FR-ORG-02 | The system shall support Team Member CRUD: name, contact, `primaryTeamId` FK (required), status (`Active/Inactive/Archived`), joinedAt, notes, organization-role label (free text, not project-specific — no admin-managed list). | M |
| FR-ORG-03 | A Team Member shall have exactly one `primaryTeamId` and may optionally belong to additional teams via a `TeamMembership` join table (many-to-many) with no per-team role field. | M |
| FR-ORG-04 | The system shall support Project Assignment CRUD (teamMemberId, projectId, startDate, endDate nullable, status, notes) with no `roleOnProject` field, and shall render a Team Member's current assignments plus total-paid/outstanding (from §3.6). | M |

### 3.5 BDS Partners (BDS)
Priority: M · Actors: Sales/Finance-permissioned users, Super Admin · Precondition: authenticated + permission.

| ID | Requirement | Priority |
|---|---|---|
| FR-BDS-01 | The system shall support BDS Partner CRUD (name, phone, email, notes, paymentTerms free-text, status) as an entity distinct from TeamMember — no shared table, no internal-team FK. | M |
| FR-BDS-02 | The system shall carry `bdsPartnerId` forward Lead → Opportunity → Project automatically on conversion (see FR-CRM-04/05); a Project's `bdsPartnerId` is independently editable after conversion. | M |
| FR-BDS-03 | BDS Compensation shall support `type` enum `FIXED` (agreed amount, integer poisha) or `PERCENTAGE` (basis points of `Project.contractValue`, computed to an agreed amount at project value, re-derived only if `contractValue` changes before any payment is posted — locked once the first BDS payment posts). | M |
| FR-BDS-04 | The system shall render a BDS Partner detail view: count/list of attributed projects, sum of attributed contract value, total compensation agreed, total paid, outstanding. | M |

*Business rules: switching a Project's BDS compensation `type` after a BDS payment has been posted against it is rejected (409) — the agreed amount is locked at first payment, consistent with the immutable-ledger philosophy applied one level up.*

### 3.6 Finance (FIN)
Priority: M · Actors: Finance-permissioned users (separate create/reverse from view, per FR-ADMIN-05), Super Admin · Precondition: authenticated + specific finance permission per action.

**Design basis (resolves BRD Open Item 5 and the accrual-vs-cash fork raised during SRS elaboration):** the general ledger is **cash-basis double-entry** — every Journal Entry posts only when cash actually moves (a payment or cost is recorded), never at milestone-completion/accrual time. Receivables and Payables remain **computed reports** over milestone/cost amounts vs. posted payments (identical in shape to the pre-reversal design), not ledger-tracked Asset/Liability accounts. This keeps every JE a simple 2-line posting and avoids inventing an AR/AP sub-ledger nobody asked for (YAGNI per CLAUDE.md's ladder) — see stakeholder decision recorded in DEC-068.

**Primary flow — client milestone payment:**
1. User submits payment: milestoneId (optional if project-level), amount, receivedDate, account (a money-type COA Asset account), method, TRX ID (free text), note.
2. In one DB transaction: create `MilestonePayment` row; post one `JournalEntry` with exactly 2 `JournalLine`s — Debit the chosen money Account (Asset), Credit `Client Milestone Payment` (Revenue) — both for `amount`.
3. Recompute milestone's `paymentStatus` (received-so-far vs. `amount`) and the project's received/due/notYetDue.

| ID | Requirement | Priority |
|---|---|---|
| FR-FIN-01 | The system shall maintain a flat (no hierarchy in v1) chart of accounts, `type` enum `Asset/Liability/Equity/Revenue/Expense`. Money-holding places (Cash/Bank/Mobile Financial) are COA rows with `type=Asset` and `isMoneyAccount=true`; only `isMoneyAccount=true` rows are selectable as the "Account" on a payment/cost entry. | M |
| FR-FIN-02 | Every payment/cost/reversal business event shall post exactly one `JournalEntry`, itself composed of ≥2 `JournalLine` rows, each `{accountId, direction: DEBIT\|CREDIT, amount}`, with `Σ(DEBIT) = Σ(CREDIT)` enforced server-side before commit (reject, do not silently pad, on imbalance). | M |
| FR-FIN-03 | Every account's balance and the company balance shall be computed as `Σ(DEBIT lines) − Σ(CREDIT lines)` for Asset/Expense-type accounts, `Σ(CREDIT lines) − Σ(DEBIT lines)` for Liability/Equity/Revenue-type accounts, over that account's posted `JournalLine`s — no stored balance field anywhere. | M |
| FR-FIN-04 | Manual client/milestone payment entry shall, atomically: create the `MilestonePayment` record, post its 2-line `JournalEntry` (Debit money Account, Credit `Client Milestone Payment` Revenue account), recompute milestone received/paymentStatus and project received/due/notYetDue — same Prisma `$transaction`. | M |
| FR-FIN-05 | Partial payments are supported: `paymentStatus = Partially Paid` while `Σ(payments against milestone) < milestone.amount`; `= Paid` when equal or greater (over-payment is accepted and logged, not rejected, per no-hard-payment-gate philosophy — flagged as an open item for exact over-payment UX, Appendix B). | M |
| FR-FIN-06 | Manual team-member payment entry shall post a 2-line `JournalEntry` (Debit `Team Member Payment` Expense, Credit money Account) atomically with the payment record, project-cost linkage (if `projectId` given), and payable recompute. | M |
| FR-FIN-07 | Manual BDS payment entry shall post a 2-line `JournalEntry` (Debit `BDS Payment` Expense, Credit money Account) atomically with the payment record and BDS outstanding recompute. | M |
| FR-FIN-08 | A Project Cost recorded as already-paid shall post a 2-line `JournalEntry` (Debit cost-category Expense account, Credit money Account) at creation. A Project Cost recorded as unpaid posts no `JournalEntry` at creation — it becomes a computed Payable line (§FR-FIN-10) until a payment against it is later recorded, which then posts the 2-line entry and marks it paid. | M |
| FR-FIN-09 | Receivables (computed, no ledger involvement): `received = Σ(MilestonePayment.amount)` per milestone/project; `currentlyDue = Σ(milestone.amount WHERE workStatus=Completed) − received allocated to those`; `notYetDue = Σ(milestone.amount WHERE workStatus != Completed)`; `overdue` per FR-PROJ-05. | M |
| FR-FIN-10 | Payables (computed): unpaid `ProjectCost` rows + BDS compensation outstanding (`agreedAmount − Σ(BDS payments)`) + team-member payable, grouped by type. | M |
| FR-FIN-11 | Project financial summary: `contractValue`, receivables breakdown (FR-FIN-09), costs paid/unpaid/total, `expectedGrossProfit = contractValue − totalProjectCosts`. | M |
| FR-FIN-12 | A posted `JournalEntry` is corrected only by posting a new `JournalEntry` with `refType=REVERSAL, refId=<original.id>` and every line's direction flipped (same accounts, same amounts, DEBIT↔CREDIT) — no `UPDATE`/`DELETE` code path exists against a posted `JournalEntry` or `JournalLine` at any permission level. | M |
| FR-FIN-13 | Chart-of-accounts rows and transaction/journal categories (the Revenue/Expense-type COA rows a payment/cost picks from) shall be manageable (add/deactivate, never hard-delete) by `settings.update`-holding administrators. | M |
| FR-FIN-14 | The system shall compute, directly from posted `JournalLine`s (no separate stored report tables): Trial Balance (every account's balance, `Σdebits = Σcredits` company-wide, always true by FR-FIN-02's construction), Profit & Loss (Revenue − Expense accounts over a period), Balance Sheet (Asset accounts, `as-of-today only` in v1 — a historical point-in-time balance sheet is out of scope until Receivables/Payables gain as-of-date capability), income/disbursement by period, receivables, payables, payment history. | M |
| FR-FIN-15 | Financial lists (Journal Entries, Payments) shall support filter by dateRange, account, category, project, client, team member, BDS partner, entry direction, payment status; sort; pagination. | S |
| FR-FIN-16 | No UI or API path shall accept a free-form manually-typed `JournalEntry`/`JournalLine` pair — every entry traces to exactly one of: milestone payment, team-member payment, BDS payment, paid project cost, reversal, or the one-time per-account opening-balance event (posted once, at Account creation, Debit the money Account / Credit `Retained Earnings` Equity, for `openingBalance`). | M |

*Business rules: `Retained Earnings` (Equity) is a system-seeded, non-deletable COA row used only as the opening-balance counter-entry target — never directly selectable on a payment/cost entry. This is structurally identical to ADR-0011's rejected-then-adopted "Equity plug" concept, now load-bearing as a real GL account rather than a derived-report artifact.*

### 3.7 Administration (ADMIN)
Priority: M · Actors: Super Admin (all), self-service (profile only) · Precondition: authenticated; most actions additionally gated by a specific permission.

| ID | Requirement | Priority |
|---|---|---|
| FR-ADMIN-01 | `SUPER_ADMIN` is a fixed, non-deletable system role. A deactivation/role-removal request that would leave zero active Super Admins shall be rejected (422) server-side, not merely warned against in the UI. | M |
| FR-ADMIN-02 | User CRUD: create (email/name, argon2id-hashed password or admin-set temp password), edit, activate/deactivate, admin-mediated password reset (no SMTP dependency, per DEC-012). | M |
| FR-ADMIN-03 | Role CRUD: name, description, status, permission-key set (many-to-many to the `packages/shared` permission catalog). | M |
| FR-ADMIN-04 | Effective permissions = allow-only union of all active Roles' permission keys assigned to the User, evaluated per-request by a global guard; no explicit-deny mechanism in v1. | M |
| FR-ADMIN-05 | `milestone_payments.create/update/reverse`, `team_payments.create/update/reverse`, `bds_payments.create/update/reverse`, `journal_entries.create/reverse` (renamed from `transactions.*` — see Appendix B) are separately permissioned from their `.view` counterparts. | M |
| FR-ADMIN-06 | Every sensitive write (per BRD §22's list, extended to cover Journal Entry posting/reversal) emits an `AuditLog` row: userId, action, entityType, entityId, beforeData/afterData (JSON, nullable where not applicable), timestamp. | M |
| FR-ADMIN-07 | A Settings screen exposes admin-configurable options: chart-of-accounts management (FR-FIN-13), system-wide preferences. | S |

**Auth/session detail (elaborating FR-ADMIN-02, not a new FR):** JWT access token 1 day TTL (DEC-073/ADR-0012, supersedes DEC-012's original 15 min on this point only), refresh token 7 days TTL, argon2id password hashing, lockout after 10 failed attempts within 15 minutes.

## 4. Data Requirements

### 4.1 Core Entities

| Entity | Purpose |
|---|---|
| User | Authenticated principal; may link to a TeamMember. |
| Role, Permission | RBAC — Role is a named permission-key bundle. |
| Team, TeamMember, TeamMembership | Internal org structure; membership is many-to-many, one `primaryTeamId`. |
| Client, Lead, Opportunity | CRM funnel; Opportunity→Project conversion preserves lineage. |
| Project, ProjectAssignment | Delivery unit; assignment links TeamMember↔Project. |
| Milestone, Deliverable | Ordered delivery + billing units; Deliverable gates Milestone completion. |
| BDSPartner, BDSCompensation | External referrers; compensation is fixed or percentage-of-contract. |
| Account (COA row) | A chart-of-accounts entry; a subset (`isMoneyAccount=true`) are cash/bank/MFS holding places. |
| JournalEntry, JournalLine | The GL system of record — one balanced posting per business event. |
| MilestonePayment, TeamMemberPayment, BDSPayment, ProjectCost | Business-event records; each (except unpaid ProjectCost) has exactly one JournalEntry. |
| AuditLog | Immutable record of sensitive actions. |
| Resource | Unified attachment model (deliverables + general project files). |

### 4.2 Key Attributes — JournalEntry / JournalLine (the structural change this SRS introduces)

```
JournalEntry
├── id
├── date
├── refType        (PAYMENT | COST | REVERSAL | OPENING_BALANCE)
├── refId           (FK to the business record, nullable for OPENING_BALANCE)
├── reversalOfId    (nullable FK to another JournalEntry, set only when refType=REVERSAL)
├── note
├── createdBy
└── createdAt

JournalLine
├── id
├── journalEntryId  (FK)
├── accountId       (FK to Account/COA row)
├── direction        (DEBIT | CREDIT)
├── amount           (integer poisha, always positive; sign implied by direction)
```

`Σ(JournalLine.amount WHERE direction=DEBIT) = Σ(JournalLine.amount WHERE direction=CREDIT)` per `JournalEntry` — enforced in the same `packages/shared` zod schema / service layer that validates the DTO before any Prisma write (trust-boundary enforcement, not UI-only — same convention ADR-0011's Finding 2 established).

### 4.3 Entity Relationships (summary)

`Lead --(convert)--> Opportunity --(win+convert)--> Project`; `Project 1—N Milestone 1—N Deliverable`; `Project N—N TeamMember` via `ProjectAssignment`; `Project N—1 BDSPartner` (nullable) `1—1 BDSCompensation`; `MilestonePayment N—1 Milestone`, `N—1 JournalEntry`; `Account 1—N JournalLine N—1 JournalEntry`; `User N—N Role N—N Permission`.

### 4.4 Milestone state machines

| From | To | Trigger/actor | Guard/rule |
|---|---|---|---|
| — | Pending | milestone created | sequence unique per project |
| Pending | In Progress | `milestones.update` | — |
| In Progress | Completed | `milestones.update` | all required Deliverables Approved, OR `milestones.complete_override` + reason |
| (workStatus=Completed) | Not Due→Pending | system, on workStatus transition | automatic, not user-triggered |
| Pending | Partially Paid | payment posted, `0 < received < amount` | — |
| Partially Paid / Pending | Paid | payment posted, `received >= amount` | — |
| any payment-active state | — | derived Overdue | `paymentStatus IN (Pending, Partially Paid) AND paymentDueDate < today` — display only, not a stored state |

## 5. External Interface Requirements

### 5.1 User Interfaces

PWA (installable), responsive 390/768/1440px breakpoints, dark-first Swiss-minimal per `DESIGN.md` — unchanged by this SRS; Finance screens (`finance-dashboard.html`, `transactions.html` → renamed conceptually to a Journal/Ledger view, `payment-entry.html`, `accounts.html`, `reports.html`) require a design-gap pass against the double-entry model (tracked as a follow-up task, Appendix B — not resolved inline here).

### 5.2 Software Interfaces (API — functional)

| Operation | Purpose | Auth |
|---|---|---|
| `POST /finance/payments/milestone` | Record client milestone payment | `milestone_payments.create` |
| `POST /finance/payments/team-member` | Record team-member payment | `team_payments.create` |
| `POST /finance/payments/bds` | Record BDS payment | `bds_payments.create` |
| `POST /finance/costs` | Record project cost (paid or unpaid) | `project_costs.create` |
| `POST /finance/costs/:id/pay` | Pay a previously-unpaid cost | `project_costs.update` |
| `POST /finance/journal-entries/:id/reverse` | Reverse a posted entry | `journal_entries.reverse` |
| `GET /finance/reports/trial-balance` `/profit-loss` `/balance-sheet` | Financial statements | `reports.view` |
| `GET /finance/accounts` | Chart of accounts + computed balances | `accounts.view` |
| (existing CRM/Projects/Org/BDS/Admin operations from `analysis/requirements-analysis.md`, unaffected by this SRS's Finance change) | | |

### 5.3 Communication Interfaces

HTTPS only (TLS via Let's Encrypt/sslip.io), REST/JSON, no webhooks/external callbacks in v1.

### 5.4 Hardware Interfaces

None — standard browser/server hardware.

## 6. Non-Functional Requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-PERF-01 | Performance | Dashboard/report aggregate queries return in <2s at v1 data volumes (≤5 users, monthly-burst usage). |
| NFR-SEC-01 | Security | All endpoints require authentication; sensitive finance endpoints require the specific create/reverse permission, not merely `.view`. |
| NFR-REL-01 | Reliability | Every payment/cost/reversal write is atomic (single Prisma `$transaction` covering the business record + its JournalEntry+JournalLine rows) — partial writes are impossible. |
| NFR-DATA-01 | Data | Money stored as integer poisha throughout; no floating-point arithmetic anywhere in the money path. |
| NFR-DATA-02 | Data | Trial Balance is always balanced (`Σdebit = Σcredit`) — verifiable as a real invariant test, not assumed. |
| NFR-AUDIT-01 | Auditability | Every sensitive write (§3.7 FR-ADMIN-06 list) has a corresponding AuditLog row with before/after state. |
| NFR-SCALE-01 | Scalability | Designed for ≤5 concurrent users; no requirement for horizontal scaling, caching layer, or read replicas. |
| NFR-COST-01 | Cost | Zero recurring paid dependencies; runs entirely within Oracle Always Free tier resource limits. |

## 7. Other Requirements

- Retention: no data-retention/deletion policy — records are retained indefinitely, no scheduled deletion in v1 (BRD §8, confirmed decision).
- Localization: ৳/BDT only, no i18n beyond currency glyph rendering.
- Compliance: none externally mandated (confirmed during BRD — double-entry adoption is an internal-preference/correctness choice, not a compliance requirement) — (open item, see Appendix B for the residual "why double-entry if not compliance-driven" framing needed in the replacement ADR).

## Appendix A — Traceability Matrix (BRD → SRS)

| BRD requirement | Covered by SRS |
|---|---|
| FR-DASH-01..03 | §3.1 (elaborated, no new IDs) |
| FR-CRM-01..06 | §3.2 (elaborated, no new IDs) |
| FR-PROJ-01..08 | §3.3 (elaborated, no new IDs) |
| FR-ORG-01..04 | §3.4 (elaborated, no new IDs) |
| FR-BDS-01..04 | §3.5 (elaborated, no new IDs) |
| FR-FIN-01..16 | §3.6 (elaborated — structural rewrite from IN/OUT ledger to double-entry JE/JournalLine model, no new IDs; data model detail in §4.2) |
| FR-ADMIN-01..07 | §3.7 (elaborated; permission-key rename `transactions.*`→`journal_entries.*` flagged, Appendix B) |
| NFR-01..08 | §6, recategorized under NFR-PERF/SEC/REL/DATA/AUDIT/SCALE/COST (NFR-01→NFR-DATA-01, NFR-02→NFR-SCALE-01, NFR-03→NFR-COST-01, NFR-04→NFR-AUDIT-01, NFR-05→ folded into NFR-REL-01 + FR-FIN-12, NFR-06→ not separately elaborated, informal, NFR-07→NFR-SEC-01, NFR-08→NFR-DATA-02) |

All 48 BRD FRs and 8 NFRs trace to at least one SRS section. No orphans.

## Appendix B — Open Items (TBD)

1. **Replacement ADR required before Finance build starts.** `docs/adr/0011-derived-chart-of-accounts-reporting.md` is superseded by this SRS's cash-basis double-entry model (DEC-068). A new ADR must be written recording the reversal, its rationale, and why ADR-0005/0006 remain accurate at the JournalEntry level — not done as part of this planning-pipeline pass (BRD v1.3 §8 open item 3).
2. **Permission-key rename**: `transactions.*` (create/update/reverse/delete/view) should become `journal_entries.*` to match the new model; `transactions.update`/`.delete` have no replacement (posted entries are never updated or hard-deleted — only reversed) — needs a decision on whether to keep `transactions.*` as a deprecated alias or cut over cleanly, since `resources/company_management_system_project_overview.md` §21.4's permission list is the spec's own reference copy and would need a matching update.
3. **Phase 0 Finance mockup rework** — stakeholder has asked for this to happen, scope: `finance-dashboard.html`, `transactions.html`, `payment-entry.html`, `accounts.html`, `reports.html` at minimum, likely `project-detail.html`'s financial summary tab too. Not done as part of this SRS pass — needs to go through hub's own design-first-intake + quality-chain process (hub-planner/hub-implementer/hub-reviewer/hub-tester/hub-code-reviewer/hub-gatekeeper) in ≤3-file batches per CLAUDE.md's Delegation Rules, tracked as its own task(s) once this planning pass reaches the epics stage or as an immediate `/req`-style follow-up.
4. **Over-payment handling** (FR-FIN-05) — accepted and logged per "no hard payment gate" philosophy, but exact UX (does the excess sit as an unapplied credit against future milestones, or just show `receivedAmount > milestoneAmount` with no further meaning?) is undecided.
5. ~~`analysis/requirement-gaps.md` needs a matching update to reflect FR-BDS-03's percentage-or-fixed choice~~ — **resolved**: fixed directly (§F "Scope Confirmations" no longer lists percentage-based BDS commission or double-entry GL as out-of-scope). Correcting a citation error in this item's original wording: it wrongly named "gap F-2" — F-2 is actually about BDS payable *trigger timing*, unrelated to compensation type; the fixed-amount-only stance lived only in §F's scope-confirmation bullet list, not a numbered gap.
6. Manual adjusting journal entries — resolved (not supported, see BRD §Open Items resolution) — listed here only for cross-reference, not actually open.

Also resolved this revision (v1.1, not separately tracked above since they were never SRS-level open items): data retention — no policy, indefinite retention (BRD v1.3 §8); `TeamMember.organizationRole` — plain free text, no admin-managed list (FR-ORG-02, FR-ADMIN-07 updated accordingly).

---
*End of document — v1.1. Open items: 5 substantive (items 1-5; item 6 is a resolved cross-reference), item 1 (replacement ADR) and item 3 (Phase 0 mockup rework) are the two that block moving Finance work into build.*
