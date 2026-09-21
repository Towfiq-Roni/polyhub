# Business Requirements Document (BRD)

## Small Company Management System ("hub")

| | |
|---|---|
| **Document title** | Small Company Management System — Business Requirements |
| **Version** | 1.1 (Draft) |
| **Date** | 2026-09-10 |
| **Author** | towfiq |
| **Status** | For review |

---

## 1. Purpose

Build a small-scale internal company management system that connects clients and sales opportunities, projects, milestones and deliverables, internal teams, external Business Development & Sales (BDS) partners, and company finances into one consistent operational and financial view — without becoming a full ERP.

## 2. Background

The company currently has no single system tying sales, project delivery, and money together. Financial state (what's owed, what's owing, current balance) has to be reconstructed by hand across scattered records. Work progress and payment status are conflated in practice, which creates pressure to stall delivery over unpaid invoices. This system replaces that with one ledger-driven, milestone-driven source of truth.

## 3. Business Objectives

Priority order:

1. **Financial traceability** — every money movement is ledger-backed and auditable; company/account balance is always a computed, trustworthy number, never a manually-maintained figure that can drift.
2. **Operational visibility** — one consistent view of clients → projects → milestones → deliverables → payments, replacing scattered/manual tracking.
3. **Reduced tool sprawl** — retire ad-hoc spreadsheets and disconnected records currently used to approximate this view.

**What would make this not worth doing:** not applicable at this stage — the project is already underway (Phase 0 UI design complete) and committed.

## 4. Scope

### 4.1 In scope

- CRM: clients, leads, opportunities, lead/opportunity → project conversion, BDS attribution
- Projects: projects, ordered milestones, deliverables, team assignment
- Independent work-status and payment-status tracking per milestone (payment never blocks next milestone)
- Organization: teams, team members, project assignments (no project-specific role)
- BDS partners: attribution, fixed-amount compensation, payment tracking
- Finance: full double-entry general ledger (chart of accounts, balanced journal entries as the system of record), client/milestone payments, team-member payments, BDS payments, project costs, receivables, payables, reversals
- Administration: users, roles, granular action-based permissions (allow-only), audit logs, settings
- Dashboard and reports (company-, project-, and people-level)
- Manual entry for all payments — no payment gateway or bank integration

### 4.2 Out of scope (v1)

- Automatic payment gateways, bank reconciliation, automatic disbursement
- Payroll engine, tax engine
- HR management, attendance, recruitment, procurement, inventory
- Marketing automation, task management, time tracking (unless later required), Gantt charts, complex workflow builders
- Multi-company accounting, multi-currency, multi-tenancy
- Configurable hard payment-gate policy (may be added later as opt-in config)
- AI features

## 5. Stakeholders & User Roles

| Role | Description |
|---|---|
| Super Admin | Fixed system role. Creates users/roles, assigns permissions, manages teams, has full system access. At least one must always remain active. |
| Finance Manager (example custom role) | Manages accounts, transactions, payments, receivables/payables. |
| Project Manager (example custom role) | Manages projects, milestones, deliverables, team assignments. |
| Sales Manager (example custom role) | Manages clients, leads, opportunities, BDS attribution. |
| Operations User (example custom role) | Limited operational access, defined by assigned permissions. |
| Viewer (example custom role) | Read-only access to assigned areas. |

Custom roles beyond Super Admin are permission bundles the Super Admin defines — the above are illustrative starting examples, not a fixed list.

## 6. Functional Requirements

Requirements are grouped by module. Each has a unique ID for traceability (`FR-<MODULE>-##`). Priority uses **M** (Must-have), **S** (Should-have), **C** (Could-have).

### 6.1 Dashboard (DASH)
*Company-wide operational and financial overview.*

| ID | Requirement | Priority |
|---|---|---|
| FR-DASH-01 | Show financial summary: available balance, receivable, payable, income/disbursement this period, net cash flow. | M |
| FR-DASH-02 | Show operational summary: active projects, current milestones, completed-but-unpaid milestones, overdue payments, upcoming deadlines, open leads/opportunities. | M |
| FR-DASH-03 | Show attention items needing action (payment pending, overdue, deliverable awaiting approval, outstanding payable). | M |

### 6.2 CRM / Sales (CRM)
*Track leads and opportunities through to won business.*

| ID | Requirement | Priority |
|---|---|---|
| FR-CRM-01 | Manage clients (create, update, status, archive). | M |
| FR-CRM-02 | Manage leads through a status flow (New → Contacted → Qualified → Converted/Lost). | M |
| FR-CRM-03 | Manage opportunities through stages (Qualified → Proposal Sent → Negotiation → Won/Lost). | M |
| FR-CRM-04 | Optionally attribute a lead or opportunity to a BDS partner. | S |
| FR-CRM-05 | Convert a won opportunity into a project, carrying forward commercial data and BDS attribution. | M |
| FR-CRM-06 | Search, filter, sort, and paginate client/lead/opportunity lists. | S |

### 6.3 Projects (PROJ)
*Primary operational unit — delivery and progression tracking.*

| ID | Requirement | Priority |
|---|---|---|
| FR-PROJ-01 | Manage projects (code, client, status, contract value, dates, owner). | M |
| FR-PROJ-02 | Project overview showing status, financial summary, milestones, team, deliverables, recent activity. | M |
| FR-PROJ-03 | Ordered, sequenced milestones per project with dates and amount. | M |
| FR-PROJ-04 | Independent work-status and payment-status tracking per milestone; payment status never blocks the next milestone starting. | M |
| FR-PROJ-05 | Overdue payment state is derived at display time, never stored. | M |
| FR-PROJ-06 | Deliverables per milestone with submit/review/approve/reject flow and attachments. | M |
| FR-PROJ-07 | Milestone completion gated on required deliverables being approved; authorized override allowed with a required reason. | M |
| FR-PROJ-08 | Search, filter, sort, and paginate project/milestone lists. | S |

### 6.4 Organization (ORG)
*Internal team structure, managed centrally by Super Admin.*

| ID | Requirement | Priority |
|---|---|---|
| FR-ORG-01 | Manage teams (Super Admin only). | M |
| FR-ORG-02 | Manage team members, including an organization-level role label and status. | M |
| FR-ORG-03 | Assign team members to projects (many-to-many, with start/end dates), with no project-specific role field. | M |
| FR-ORG-04 | Show a team member's current project assignments and total paid/outstanding amounts. | M |

### 6.5 BDS Partners (BDS)
*External business-development/sales contributors.*

| ID | Requirement | Priority |
|---|---|---|
| FR-BDS-01 | Manage BDS partners as external parties, distinct from internal team members. | M |
| FR-BDS-02 | Attribute leads/opportunities/projects to a BDS partner, carrying forward through conversion. | M |
| FR-BDS-03 | Track BDS compensation per project as either a fixed agreed amount or a percentage of contract value (computed to an agreed amount at project value), with total paid and outstanding. | M |
| FR-BDS-04 | BDS partner detail view: attributed projects, total value, payment history. | M |

### 6.6 Finance (FIN)
*Full double-entry general ledger as the financial system of record.*

| ID | Requirement | Priority |
|---|---|---|
| FR-FIN-01 | Maintain a chart of accounts (Asset, Liability, Equity, Revenue, Expense) as the structural foundation of company finances, including the company's money-holding accounts (cash, bank, mobile financial accounts) as Asset accounts. | M |
| FR-FIN-02 | Every financial event posts as a balanced double-entry journal entry (total debits = total credits) against the chart of accounts — this ledger, not any single-sided transaction log, is the system of record. | M |
| FR-FIN-03 | Account, chart-of-accounts, and company balances are always derived from posted journal entries, never manually set or stored as a mutable field. | M |
| FR-FIN-04 | Manual client/milestone payment entry posts a balanced journal entry (cash/bank debited, receivable/revenue credited as applicable) and recomputes milestone/project received/due amounts. | M |
| FR-FIN-05 | Partial payments are supported; milestone payment status recomputes to Partially Paid or Paid as journal entries accumulate against it. | M |
| FR-FIN-06 | Manual team-member payment entry posts a balanced journal entry and updates payable/project cost. | M |
| FR-FIN-07 | Manual BDS payment entry posts a balanced journal entry and updates payable/project cost. | M |
| FR-FIN-08 | Track project costs as paid or unpaid; unpaid costs post as a payable (Liability) journal entry, paid costs post against cash. | M |
| FR-FIN-09 | Receivables engine: received, currently due, not-yet-due, overdue (derived from the ledger) amounts. | M |
| FR-FIN-10 | Payables engine: team-member, BDS, and other payables (derived from the ledger). | M |
| FR-FIN-11 | Project financial summary: contract value, received/due/not-due, costs, expected gross profit. | M |
| FR-FIN-12 | Correct posted journal entries only via a linked reversing entry, never destructive edit/delete — the ledger stays immutable and auditable. | M |
| FR-FIN-13 | Chart of accounts and transaction/journal categories are manageable by authorized administrators. | M |
| FR-FIN-14 | Company- and project-level reports, computed directly from the general ledger: trial balance, profit & loss, balance sheet, income/disbursement by period, receivables, payables, payment history — trial balance and P&L always balance to zero by construction. | M |
| FR-FIN-15 | Financial list filtering: date range, account, category, project, client, team member, BDS partner, entry direction, payment status. | S |
| FR-FIN-16 | Every journal entry is system-generated from a defined business event (payment, cost, reversal, or one-time account opening-balance event) — there is no free-form manual debit/credit entry screen; the system covers accrual/correction needs entirely through these defined event types. | M |

### 6.7 Administration (ADMIN)
*Access control and accountability.*

| ID | Requirement | Priority |
|---|---|---|
| FR-ADMIN-01 | Super Admin is a fixed system role; the system always retains at least one active Super Admin. | M |
| FR-ADMIN-02 | Manage users: create, edit, activate/deactivate, reset access. | M |
| FR-ADMIN-03 | Manage custom roles as named permission bundles. | M |
| FR-ADMIN-04 | Granular, action-based permission catalog; effective access is the allow-only union of a user's active roles. | M |
| FR-ADMIN-05 | Sensitive finance actions (create/reverse payments) are permissioned separately from view access. | M |
| FR-ADMIN-06 | Audit log of sensitive operational and financial actions (actor, before/after, timestamp). | M |
| FR-ADMIN-07 | System settings screen for administrator-configurable options. | S |

## 7. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-01 | All monetary calculations must be exact — no rounding drift across any financial computation. |
| NFR-02 | Supports up to 5 concurrent users with monthly usage-burst patterns; no high-throughput scaling requirement. |
| NFR-03 | Runs within a $0 recurring infrastructure cost target. |
| NFR-04 | Every sensitive or financial write is auditable (actor, before/after state, timestamp). |
| NFR-05 | Posted journal entries are immutable; corrections happen only via a linked reversing entry. |
| NFR-08 | The general ledger is always internally consistent: for every posted journal entry, and in aggregate, total debits equal total credits — verifiable by a trial balance that always balances to zero. |
| NFR-06 | Internal business-hours availability is sufficient; no formal uptime SLA required. |
| NFR-07 | Access requires authentication; all actions are governed by role-based permissions. |

## 8. Assumptions & Constraints

- $0 recurring infrastructure cost target; no external hosting budget approved.
- No hard external deadline; delivery proceeds phase-by-phase.
- System supports up to 5 concurrent users at any time.
- No technology or regulatory constraint mandated by the business beyond what's stated here.
- All payments are entered manually; no payment gateway or bank integration exists in v1.
- Single tenant, single company, single currency (৳/BDT).
- No formal data-retention or deletion policy defined yet for v1.
- Hardest-to-undo decision: the general-ledger data model (chart of accounts, journal entry structure) and permission-key taxonomy, once real financial data and role assignments accumulate. Sign-off authority: the project stakeholder/owner — no other approver.
- **Supersedes ADR-0011/DEC-064** (2026-09-08): that decision deliberately kept a simple IN/OUT transaction ledger as the system of record and added Chart-of-Accounts reporting only as a read-only derived view, specifically rejecting full double-entry as system of record after two rounds of architecture review. This BRD reverses that call on explicit stakeholder direction (2026-09-10): full double-entry (chart of accounts + balanced journal entries) is now the system of record. A new ADR must be written recording this reversal before SRS/design work proceeds to build; ADR-0005 (money as integer poisha) is unaffected, ADR-0006 (immutable ledger + reversals) is reinterpreted at the journal-entry level rather than superseded.

## 9. Glossary

| Term | Meaning |
|---|---|
| BDS | Business Development & Sales — external partners who bring in leads/opportunities for a compensation arrangement. |
| Milestone | A sequenced unit of project delivery with its own work status and payment status. |
| Deliverable | A concrete output tied to a milestone, subject to submit/approve/reject. |
| General Ledger | The complete, append-only set of journal entries; all account and company balances are computed from it. |
| Chart of Accounts | The structured list of accounts (Asset/Liability/Equity/Revenue/Expense) money movements post against. |
| Journal Entry | A balanced (debits = credits) posting to the general ledger, generated from a business event. |
| Trial Balance | A report listing every account's balance, verifying total debits equal total credits ledger-wide. |
| Receivable | Money owed to the company by a client, not yet received. |
| Payable | Money the company owes (team member, BDS partner, other) but hasn't yet disbursed. |
| RBAC | Role-Based Access Control — permissions granted through roles assigned to users. |
| Super Admin | The one fixed system role with full administrative access; always at least one active. |
| Opportunity | A qualified sales prospect being pursued toward becoming a project. |
| Lead | An early-stage sales contact not yet qualified into an opportunity. |

---

## Open Items (TBD)

1. Percentage-based BDS commission — explicitly deferred past v1 (§4.2, §6.5).
2. Hard payment-gate policy (blocking milestone progression on unpaid prior milestone) — deferred as an optional future config, not built in v1 (§4.2, §6.3).
3. Formal data-retention/deletion policy — not yet defined (§8).
4. Time tracking — out of scope for v1 unless a concrete need emerges (§4.2).
5. **ADR-0011/DEC-064 reversal** — needs a new ADR recording this BRD's supersession before build starts (§8).

Resolved during this revision: manual adjusting journal entries are explicitly **not** supported — every journal entry, including opening balances, is system-generated from a defined business event (FR-FIN-16); no free-form entry screen exists at any permission level.

---
*End of document — v1.1 (Draft). Open items: 5 (4 deliberate v1 deferrals, 1 new from the double-entry reversal — item 5 should resolve before SRS is approved).*
