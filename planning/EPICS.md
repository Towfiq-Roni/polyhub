# Epics

## Small Company Management System ("hub")

| | |
|---|---|
| **Document title** | Small Company Management System — Epics |
| **Version** | 1.0 |
| **Date** | 2026-09-10 |
| **Based on** | FEATURES v1.0, planning/adr/ |
| **Status** | Approved |

---

## Delivery plan

**Mode:** Whole project at once.

Epics run in this order (WSJF, respecting dependencies — foundational access/admin work goes first regardless of its own WSJF rank, since every other epic's write paths depend on it existing):

1. **E-07** — Access, Security & Administration (foundational; blocks every write-capable epic)
2. **E-01** — CRM & Sales Pipeline
3. **E-03** — Organization & Staffing
4. **E-04** — BDS Partner Tracking
5. **E-02** — Project & Milestone Delivery
6. **E-05** — Financial Ledger & Payments ★
7. **E-06** — Financial Reporting
8. **E-08** — Company Dashboard

*Note on granularity: `planning-protocol.md` specifies epics 1:1 with `BUSINESS_GOALS.md` goals; with only 3 broad strategic goals against 32 features, that would produce 2-3 unworkable mega-epics and one goal ("reduced tool sprawl") with no distinct scope of its own. By explicit stakeholder choice, epics here are module-shaped instead, each tagged with the goal(s) it advances — see each epic's Goal line.*

## E-01 — Customers can be tracked from first contact through signed project

**When this ships:** A salesperson can capture a lead, qualify it into an opportunity, and convert a won deal straight into an active project — without re-typing client or commercial details.
**Goal:** → Operational visibility (primary), Financial traceability (contract value carries forward accurately)
**WSJF:** (value 7 + time-criticality 6 + risk-reduction 4) / size 5 = **3.4**

### Scope
**In scope**
- Client, Lead, Opportunity CRUD and status/stage flows
- Optional BDS attribution on Lead/Opportunity
- Opportunity → Project conversion (auto-create Client if none matches, carry commercial data + BDS attribution forward)

**Out of scope**
- Project/Milestone creation details beyond the conversion trigger (E-02)
- BDS compensation terms (E-04)

### Acceptance criteria (EARS)
- **EARS-CRM-1**: WHEN a Lead's status is set to `Converted`, the system SHALL require an Opportunity to exist for it (FR-CRM-02)
- **EARS-CRM-2**: WHEN an Opportunity's `bdsPartnerId` is set from a converted Lead, the system SHALL copy it automatically without re-entry (FR-CRM-04)
- **EARS-CRM-3**: WHEN an Opportunity's stage is set to `Won` and converted, the system SHALL auto-create a Client if none matches, create a Project with `contractValue = estimatedValue`, and preserve the Opportunity↔Project link (FR-CRM-05)
- **EARS-CRM-4**: IF an already-`Won`/`Lost` Opportunity or already-`Converted` Lead is re-converted, THEN the system SHALL reject the request (409) (FR-CRM-02, FR-CRM-03)

### Tasks
| Task | Description | Size | MoSCoW | Depends on | Traces to |
|---|---|---|---|---|---|
| T-01 | Client CRUD + search/filter/sort/pagination (backend + frontend) | S | Must | — | F-02 |
| T-02 | Lead CRUD + server-enforced status flow (backend + frontend) | S | Must | — | F-03 |
| T-03 | Opportunity CRUD + server-enforced stage flow (backend + frontend) | S | Must | — | F-04 |
| T-04 | BDS attribution on Lead/Opportunity, carried forward on conversion | S | Should | T-02, T-03 | F-05 |
| T-05 | Opportunity→Project conversion (auto-create Client, cross-module transaction) | M | Must | T-01, T-03 | F-06 |

### Risks
| Risk | Mitigation |
|---|---|
| Conversion spans two owning DFD processes (P1, P2) in one transaction | Single Prisma `$transaction` wrapping both writes, not two independently-committed calls |

## E-02 — Delivery teams can run a project through ordered, billable milestones without payment stalling work

**When this ships:** A project manager can sequence milestones, gate deliverables through an approval workflow, and complete a milestone's work regardless of whether its payment has arrived yet.
**Goal:** → Operational visibility (primary)
**WSJF:** (value 8 + time-criticality 7 + risk-reduction 5) / size 6 = **3.33**

### Scope
**In scope**
- Project CRUD, status lifecycle, overview aggregation
- Ordered/reorderable milestones with independent work-status and payment-status machines
- Deliverable submit/review/approve/reject workflow, milestone completion gating
- Project/milestone search and filtering

**Out of scope**
- Actual payment posting against a milestone (E-05)
- Team assignment mechanics (E-03)

### Acceptance criteria (EARS)
- **EARS-PROJ-1**: WHEN a Milestone's `workStatus` changes, the system SHALL NOT consider `paymentStatus` in the transition guard (FR-PROJ-04)
- **EARS-PROJ-2**: WHEN a Milestone's `paymentStatus` is `Pending` or `Partially Paid` AND `paymentDueDate < today`, the system SHALL display it as Overdue without storing that state (FR-PROJ-05)
- **EARS-PROJ-3**: WHEN a user attempts to complete a Milestone with an unapproved required Deliverable, THE system SHALL reject the transition UNLESS the user holds `milestones.complete_override` and supplies a reason (FR-PROJ-07)

### Tasks
| Task | Description | Size | MoSCoW | Depends on | Traces to |
|---|---|---|---|---|---|
| T-06 | Project CRUD + auto-coding + overview aggregation (backend + frontend) | M | Must | T-01 | F-07 |
| T-07 | Milestone CRUD + reorderable sequence + dual independent status machines (backend) | M | Must | T-06 | F-08 |
| T-08 | Milestone frontend screens (list + detail, both status chips) | S | Must | T-07 | F-08 |
| T-09 | Deliverable CRUD + submit/review/approve/reject workflow | M | Must | T-07 | F-09 |
| T-10 | Milestone completion gating + `milestones.complete_override` permission | S | Must | T-09 | F-10 |
| T-11 | Project/milestone search, filter, sort, pagination | S | Should | T-06, T-07 | F-11 |

### Risks
| Risk | Mitigation |
|---|---|
| Coupling work-status and payment-status transitions by accident | Explicit test asserting `workStatus` transitions succeed with every `paymentStatus` value (BRD §2.3 invariant) |

## E-03 — The company's internal team structure is tracked centrally

**When this ships:** A Super Admin can organize staff into teams and see who's assigned to which project, from either direction.
**Goal:** → Operational visibility
**WSJF:** (value 5 + time-criticality 4 + risk-reduction 3) / size 3 = **4.0**

### Scope
**In scope**
- Team CRUD (Super Admin only)
- Team Member CRUD, one required primary team plus optional secondary memberships
- Project Assignment (many-to-many, no project-specific role)

**Out of scope**
- Team-member payment tracking (E-05)

### Acceptance criteria (EARS)
- **EARS-ORG-1**: WHEN a Team Member is created, the system SHALL require exactly one `primaryTeamId` (FR-ORG-02)
- **EARS-ORG-2**: WHEN a Project Assignment is created, the system SHALL NOT expose a project-specific role field (FR-ORG-04)

### Tasks
| Task | Description | Size | MoSCoW | Depends on | Traces to |
|---|---|---|---|---|---|
| T-12 | Team CRUD, `teams.*` permission-gated | S | Must | — | F-12 |
| T-13 | Team Member CRUD (primary + secondary team membership) | S | Must | T-12 | F-13 |
| T-14 | Project Assignment (both-direction queries) | S | Must | T-13, T-06 | F-14 |

### Risks
| Risk | Mitigation |
|---|---|
| None significant | Straightforward CRUD, well-specified in ERD §3.7-3.8 |

## E-04 — External BDS partners are credited and paid correctly for the business they bring in

**When this ships:** A BDS partner's referred deals are attributed to them automatically, and their compensation (fixed or percentage) is tracked accurately through to payment.
**Goal:** → Operational visibility (attribution), Financial traceability (compensation/outstanding)
**WSJF:** (value 5 + time-criticality 4 + risk-reduction 4) / size 3 = **4.33**

### Scope
**In scope**
- BDS Partner CRUD
- BDS compensation (fixed or percentage-of-contract, locked at first payment), partner detail rollup

**Out of scope**
- Actual BDS payment posting (E-05)

### Acceptance criteria (EARS)
- **EARS-BDS-1**: WHEN a Project's BDS compensation `type=Percentage` is set, the system SHALL compute `agreedAmount` from `contractValue × percentageBps` at creation (FR-BDS-03)
- **EARS-BDS-2**: IF a BDS payment has already been posted against a Project, THEN the system SHALL reject any change to that Project's BDS compensation type or amount (FR-BDS-03)

### Tasks
| Task | Description | Size | MoSCoW | Depends on | Traces to |
|---|---|---|---|---|---|
| T-15 | BDS Partner CRUD | S | Must | — | F-15 |
| T-16 | BDS Compensation (fixed/percentage, lock-after-first-payment) + partner detail rollup | M | Must | T-15, T-06 | F-16 |

### Risks
| Risk | Mitigation |
|---|---|
| Lock-after-first-payment rule depends on E-05's payment posting existing | T-16's lock check is a guard evaluated at edit time — can be implemented and tested with a stubbed "has payment" check before E-05 lands, then wired to the real one |

## E-05 — Every financial event posts as a real, balanced double-entry ledger record ★

**When this ships:** Whoever records a client payment, team payment, BDS payment, or project cost sees it become an immutable, correctly-balanced journal entry — the accounting-grade ledger the business actually asked for (DEC-068/069/070).
**Goal:** → Financial traceability (this epic *is* goal #1, made real)
**WSJF:** (value 10 + time-criticality 9 + risk-reduction 9) / size 9 = **3.11**

### Scope
**In scope**
- Chart of accounts (flat, seeded), admin management
- Journal entry/journal line posting service (balanced-entry enforcement)
- Client milestone payment, team-member payment, BDS payment, project cost — all posting atomically
- Journal entry reversal (linked, never edit/delete)

**Out of scope**
- Receivables/payables/financial-statement computation (E-06 — reads this epic's output, doesn't post to it)
- Manual/adjusting journal entries (explicitly out of scope for all of v1, per BRD Open Items resolution)

### Acceptance criteria (EARS)
- **EARS-FIN-1**: WHEN any journal entry is posted, the system SHALL reject it UNLESS `Σ(debit lines) = Σ(credit lines)` (FR-FIN-02)
- **EARS-FIN-2**: WHEN a client milestone payment is recorded, the system SHALL atomically create the payment record and its journal entry in the same database transaction (FR-FIN-04, NFR-REL-01)
- **EARS-FIN-3**: WHEN a posted journal entry needs correction, the system SHALL post a new reversing entry with every line's direction flipped, and SHALL NOT expose any update/delete path against a posted entry (FR-FIN-12)
- **EARS-FIN-4**: WHEN any payment/cost/reversal is posted, the system SHALL generate its journal entry from that defined business event only — no free-form manual entry path SHALL exist at any permission level (FR-FIN-16)
- **EARS-FIN-5**: WHEN an account or company balance is requested, the system SHALL compute it from posted journal lines at query time and SHALL NOT read it from any stored balance field (FR-FIN-03)

### Tasks
| Task | Description | Size | MoSCoW | Depends on | Traces to |
|---|---|---|---|---|---|
| T-17 | Chart of accounts seed + admin add/deactivate | M | Must | — | F-17 |
| T-18 | JournalEntry/JournalLine schema + balanced-posting service (shared by all payment/cost tasks below) | M | Must | T-17 | F-18 |
| T-19 | Client milestone payment posting (backend, atomic transaction) | L | Must | T-07, T-18 | F-18 |
| T-20 | Client milestone payment entry screen | M | Must | T-19 | F-18 |
| T-21 | Team-member payment posting (backend + frontend) | M | Must | T-13, T-18 | F-19 |
| T-22 | BDS payment posting (backend + frontend) | M | Must | T-16, T-18 | F-20 |
| T-23 | Project cost recording, paid/unpaid (backend + frontend) | M | Must | T-06, T-18 | F-21 |
| T-24 | Journal entry reversal (backend + frontend) | M | Must | T-19, T-21, T-22, T-23 | F-22 |

### Risks
| Risk | Mitigation |
|---|---|
| Single most safety-critical write path in the whole system | Every posting task gets an atomicity test asserting no partial write is possible (kill the process mid-transaction in a test, assert rollback) — non-negotiable per CLAUDE.md rule 3 |
| Reversal must correctly unwind side-effects (Milestone.paymentStatus, ProjectCost.paidStatus), not just ledger lines | T-24's test explicitly asserts the side-effect fields revert, not just that a reversing JournalEntry exists |

## E-06 — Management can see real accounting-grade financial reports, not just a cash total

**When this ships:** A stakeholder can pull a trial balance, P&L, and balance sheet that always mathematically balance — the exact capability that drove the double-entry reversal in the first place.
**Goal:** → Financial traceability
**WSJF:** (value 9 + time-criticality 8 + risk-reduction 7) / size 5 = **4.8**

### Scope
**In scope**
- Receivables/payables computed engine, project financial summary
- Trial balance, P&L (always balance to zero by construction)
- Balance sheet (distinct `Equity_BS = Equity_TB + AR − AP` formula, as-of-today only)
- Financial list filtering

**Out of scope**
- Historical/point-in-time balance sheet (explicitly deferred, SRS FR-FIN-14)

### Acceptance criteria (EARS)
- **EARS-RPT-1**: WHEN a trial balance is computed, the system SHALL assert `Σ(all account debits) = Σ(all account credits)` as a real balance test, not a component-reconciliation test (FR-FIN-14)
- **EARS-RPT-2**: WHEN a balance sheet is computed, the system SHALL use `Equity_BS = Equity_TB + AR − AP`, NOT the trial-balance equity figure directly (FR-FIN-14)
- **EARS-RPT-3**: WHEN a balance sheet is requested, the system SHALL scope it to as-of-today only and SHALL NOT accept a historical date parameter (FR-FIN-14)

### Tasks
| Task | Description | Size | MoSCoW | Depends on | Traces to |
|---|---|---|---|---|---|
| T-25 | Receivables & Payables computed engine | M | Must | T-19, T-21, T-22, T-23 | F-23 |
| T-26 | Project financial summary view | S | Must | T-25 | F-24 |
| T-27 | Trial balance / P&L computation | M | Must | T-18 | F-25 |
| T-28 | Balance sheet (distinct equity formula, algebraically verified) | M | Must | T-25, T-27 | F-25 |
| T-29 | Financial Statements screen (reports.html tab) | S | Must | T-27, T-28 | F-25 |
| T-30 | Financial list filtering | S | Should | T-19, T-21, T-22 | F-26 |

### Risks
| Risk | Mitigation |
|---|---|
| Balance-sheet equity formula is exactly the class of bug ADR-0011's own history caught (a real algebra mistake, found by hub-solution-architect) | T-28 gets an explicit algebraic-proof test (numeric example: Cash=X, AR=Y, AP=Z, assert Assets=Liabilities+Equity_BS exactly), independently re-derived, never assumed correct because the formula "looks right" |

## E-07 — The system is securely accessible only to the right people, with a full accountability trail

**When this ships:** A Super Admin can create users, define exactly what each role can do, and see a complete audit trail of every sensitive action — and the system can never lock everyone out.
**Goal:** → Financial traceability (audit trail), Operational visibility (foundational — gates every other epic)
**WSJF:** (value 8 + time-criticality 9 + risk-reduction 6) / size 6 = **3.83**

### Scope
**In scope**
- Authentication (login, JWT access(1 day)/refresh(7 days), argon2id, lockout)
- User CRUD, Role/Permission CRUD, allow-only RBAC enforcement
- Super Admin invariant enforcement
- Audit logging (cross-cutting interceptor + view screen)
- System settings screen

**Out of scope**
- None — this epic is intentionally complete before other epics' write paths go live

### Acceptance criteria (EARS)
- **EARS-ADM-1**: WHEN a login succeeds, the system SHALL issue a 1-day access token and a 7-day refresh token, argon2id-verified (FR-ADMIN-02, ADR-0004/ADR-0012)
- **EARS-ADM-2**: WHEN a user's effective permissions are evaluated, the system SHALL compute them as the allow-only union of all active Roles' permission keys (FR-ADMIN-04)
- **EARS-ADM-3**: IF a deactivation or role-removal request would leave zero active Super Admins, THEN the system SHALL reject it (422) server-side (FR-ADMIN-01)
- **EARS-ADM-4**: WHEN any sensitive write occurs (per the FR-ADMIN-06 action list), the system SHALL emit an AuditLog row with actor, before/after state, and timestamp (FR-ADMIN-06)
- **EARS-ADM-5**: WHEN a user without `milestone_payments.create` (or equivalent) attempts a sensitive finance action, the system SHALL reject it even if they hold the corresponding `.view` permission (FR-ADMIN-05)

### Tasks
| Task | Description | Size | MoSCoW | Depends on | Traces to |
|---|---|---|---|---|---|
| T-31 | Auth module: login, JWT access(1d)/refresh(7d), argon2id, lockout | M | Must | — | F-27 |
| T-32 | User CRUD + activate/deactivate + admin-mediated reset | M | Must | T-31 | F-28 |
| T-33 | Role CRUD + permission catalog (`packages/shared`) | M | Must | T-32 | F-29 |
| T-34 | PermissionsGuard (allow-only union) + sensitive-action permission split | M | Must | T-33 | F-29 |
| T-35 | Super Admin invariant enforcement (422 on last-active-removal) | S | Must | T-33 | F-30 |
| T-36 | Audit interceptor + AuditLog + audit log screen | M | Must | T-33 | F-31 |
| T-37 | Settings screen (chart-of-accounts management surface, system preferences) | S | Should | T-17, T-33 | F-32 |

### Risks
| Risk | Mitigation |
|---|---|
| Permission-model bug is a security bug, not just a UX one | e2e denial tests per permission key (already planned, `task-breakdown.md` Phase 2), not just happy-path coverage |
| Audit interceptor must exist before other epics' write paths ship, or their writes go unaudited | E-07 is sequenced first in the delivery plan for exactly this reason |

## E-08 — One glance shows what needs attention today

**When this ships:** Any authorized user opens the dashboard and immediately sees financial standing, operational status, and what's overdue or awaiting action — without visiting five separate screens.
**Goal:** → Operational visibility
**WSJF:** (value 6 + time-criticality 3 + risk-reduction 2) / size 2 = **5.5**

### Scope
**In scope**
- Financial summary, operational summary, attention-items aggregation

**Out of scope**
- None — single feature, single epic

### Acceptance criteria (EARS)
- **EARS-DASH-1**: WHEN the dashboard is loaded, the system SHALL compute all displayed figures live from current data, never from a cache older than the request itself (FR-DASH-01, FR-DASH-02)
- **EARS-DASH-2**: WHEN a milestone is completed with payment pending, an overdue payment exists, or a deliverable awaits approval, the system SHALL surface it in the Attention list (FR-DASH-03)

### Tasks
| Task | Description | Size | MoSCoW | Depends on | Traces to |
|---|---|---|---|---|---|
| T-38 | Dashboard aggregation (financial + operational + attention) + screen | M | Must | T-06, T-07, T-25, T-03 | F-01 |

### Risks
| Risk | Mitigation |
|---|---|
| Only correct once every dependency epic has real data flowing | Sequenced last in the delivery plan; acceptance testing needs seeded data across all upstream epics |

## Coverage check

Every one of FEATURES.md's 32 features lands in exactly one epic:
- E-01: F-02, F-03, F-04, F-05, F-06
- E-02: F-07, F-08, F-09, F-10, F-11
- E-03: F-12, F-13, F-14
- E-04: F-15, F-16
- E-05: F-17, F-18, F-19, F-20, F-21, F-22
- E-06: F-23, F-24, F-25, F-26
- E-07: F-27, F-28, F-29, F-30, F-31, F-32
- E-08: F-01

No orphans, no duplicates. All 48 SRS FRs trace through these features to a task (via each task's Traces-to column). 38 tasks total.

## Open Items (TBD)

None — this stage raised no new unresolved question. SRS Appendix B's remaining items (replacement ADR for the superseded `docs/adr/0011`, Phase 0 finance mockup rework) stay tracked there; they are prerequisites `/agentic-harness:architect` should surface before or during E-05/E-06's dispatch, not separately re-tracked here.

---
*End of document — v1.0. Open items: none new.*
