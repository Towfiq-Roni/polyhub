# Requirement Gaps & Open Questions

> **Source analyzed:** `resources/company_management_system_project_overview.md`
> **Purpose:** Every ambiguity, contradiction, or omission found in the spec — each with severity and a suggested clarifying question or recommended default so development is never blocked.
>
> **Severity scale**
> - **H** = High — blocks correct build or risks rework of financial logic
> - **M** = Medium — must be decided before the phase that touches it
> - **L** = Low — safe to default now, revisit later
>
> Each gap lists a **recommended default**. Defaults are adopted unless the owner overrides before the relevant phase (see `task-breakdown.md` § Decisions).

---

## A. Financial Business-Rule Gaps

### F-1 · Team-member payable has no accrual model — **H**
Spec §18 requires tracking "Team Member Payable" and §9.4 asks "how much is still payable?" per member — but no mechanism anywhere defines *when* a member becomes owed money. There is no salary, rate, or project-share concept (and §30 excludes payroll engines).
- **Impact:** Cannot compute the §18 dashboard breakdown (`Team Members ৳80,000`) without inventing an accrual rule.
- **Question:** How does a team member accrue money owed? Options: (a) manual "payable entries" created by authorized users; (b) fixed monthly amount; (c) % of milestone on completion.
- **Recommended default:** (a) manual payable entries — a small `TeamMemberPayable` record (amount, note, date) created by `team_payments`-authorized users, reduced by recorded payments. Zero automation, matches "manual payments" philosophy.

### F-2 · BDS payable trigger point undefined — **H**
§10.3 defines a fixed agreed amount per project, but not *when* it becomes due/owed: at project creation? first client payment? project completion?
- **Impact:** BDS outstanding totals (dashboard + partner page) are ambiguous until decided.
- **Recommended default:** payable becomes active when the project turns `Active`; due date optional field. Simplest and auditable.

### F-3 · "Not Due → Pending" transition timing unspecified — **H**
Payment status starts `Not Due`. The spec never states what flips it to `Pending`: milestone completion? `paymentDueDate` arrival? both?
- **Impact:** Directly drives receivables ("Currently Due") — wrong choice corrupts every financial summary.
- **Recommended default:** milestone completion sets status to `Pending` (paymentDueDate becomes informational/overdue driver only). If paymentDueDate passes while still Not Due (work incomplete), status stays Not Due.

### F-4 · Overpayment / advance / unallocated payments unhandled — **M**
What happens when a client pays more than a milestone's amount, pays before any milestone completes, or a payment shouldn't attach to a milestone at all?
- **Recommended default:** v1 validates allocations ≤ milestone amount (block over-allocation); payments with no milestone are allowed (project-scoped credit shown under Received); true advances/refunds deferred to adjustments via transactions.

### F-5 · Account-to-account transfers hinted but never specified — **M**
§2.1 shows `± Adjustments / Transfers` in the balance formula; no module, fields, or workflow exist elsewhere for transfers.
- **Recommended default:** transfer = paired OUT+IN transactions sharing one generated `transferRef`, created atomically by a dedicated form (`transactions.transfer` permission). Defer if time-constrained — manual OUT/IN pairs achieve the same result in v1.

### F-6 · Contract value vs Σ(milestones) reconciliation missing — **M**
Projects carry `contractValue`; milestones carry amounts. Nothing says they must match, nor which wins when they diverge (e.g., after adding M5 late).
- **Recommended default:** store both independently; project page shows both plus delta badge; gross profit uses contractValue; receivables math always uses milestone sums. No enforcement in v1.

### F-7 · Cancelled milestone effect on financials undefined — **M**
If M2 is cancelled, do its amount/allocations drop out of "Not Yet Due"/"Received"?
- **Recommended default:** cancelled milestones excluded from all due/not-yet-due aggregations; already-received allocations against them surface as unallocated credit (ties into F-4).

### F-8 · Permission list contradicts reversal-only principle — **H**
§21.7 mandates reversal-not-deletion for posted financials, yet §21.4 seeds edit permissions: `transactions.update`, `milestone_payments.update`, `team_payments.update`, `bds_payments.update`.
- **Impact:** Implementing both invites silent ledger edits — the exact thing the ledger design exists to prevent.
- **Recommended default:** posted payment records & transactions are immutable except reversal. `.update` permissions apply **only pre-posting drafts** (or are dropped). Document deviation from spec §21.4 explicitly.

### F-9 · Project cost → payable lifecycle details thin — **L**
Unpaid cost later paid: spec implies OUT transaction then reduces payable, but doesn't name the action or permissions (`project_costs.pay` vs reusing `transactions.create`).
- **Recommended default:** explicit "Record Payment" action on unpaid cost rows requiring both `project_costs.update` and `transactions.create`.

### F-10 · Multi-currency posture — **L**
Currency field exists on Account; §30 defers multi-currency complexity. Mixed-currency accounts would break naive Σ.
- **Recommended default:** single currency (BDT) enforced app-wide in v1; currency stored but locked.

### F-11 · Derived Chart-of-Accounts reporting (trial balance/P&L/balance sheet) — **M**
Stakeholder wants Chart-of-Accounts-style accrual reports (trial balance, P&L, balance sheet) driven by internal preference, not external compliance (DEC-064). `Transaction`/`Account` stay the sole system of record — this is a read-only derived view, not a second ledger.
- **Recommended default:** new `LedgerAccount` seeded reference table (14 rows) + nullable `TransactionCategory.ledgerAccountId` FK; trial balance/P&L computed at query time (`Equity_TB = Σopening + cumulative(Income−Expense)`, balances to zero by construction); Balance Sheet uses a distinct `Equity_BS = Equity_TB + AR − AP` (folding in existing Receivables/Payables), scoped to as-of-today only in v1. Full design: `docs/designs/REQ-33-derived-chart-of-accounts-reporting.md` (VALIDATED, DEC-064).

## B. Process & Workflow Gaps

### P-1 · Lead → Opportunity conversion flow missing — **M**
Lead statuses include `Converted`, but nothing links a converted lead to the opportunity/client it produced (only Opportunity→Project conversion is specified).
- **Recommended default:** converting a lead prompts create-or-select Client + create Opportunity, storing `leadId` on the opportunity (preserving chain Lead→Opp→Project→BDS attribution).

### P-2 · Opportunity→Project "carry forward commercial information" vague — **L**
Which fields copy? (client, title→name, estimatedValue→contractValue?, notes, bdsPartnerId.)
- **Recommended default:** copy client, title, estimatedValue→contractValue (editable), notes, BDS attribution; keep `sourceOpportunityId` FK on project.

### P-3 · Deliverable "configured completion requirement" has no home — **M**
§8.2: milestone completable "when required deliverables satisfy the configured completion requirement" — no such config field exists on milestone or deliverables (only Required/Optional flag).
- **Recommended default:** rule = "all `required` deliverables Approved"; store as boolean `requireAllDeliverables` on milestone (future: per-milestone policy). Override-with-reason writes audit log.

### P-4 · Role deletion safety criteria undefined — **L**
"Delete roles when safe" — define: role has no active user assignments.
- **Recommended default:** soft-delete/archive; block deletion while assigned; SUPER_ADMIN undeletable.

### P-5 · User ↔ TeamMember linkage rules unstated — **L**
Optional link exists. Can two users link to one member? Can unlinking happen after payments exist?
- **Recommended default:** 1-to-1 unique FK; unlink allowed (historical payments keep member ref, not user ref).

### P-6 · ProjectAssignment status values undefined — **L**
- **Recommended default:** `Active | Completed | Cancelled`; assignment auto-shows as past when endDate < today.

### P-7 · Settings module contents undefined — **L**
Screen #29 exists; no settings enumerated.
- **Recommended default:** company name/logo, fiscal month-start, overdue reminder threshold days, category management entry point.

### P-8 · TransactionCategory configurability scope — **L**
"Where practical." CRUD UI vs seed-only?
- **Recommended default:** admin-managed simple list (create/deactivate); seeded defaults; system categories used by automated flows non-deletable.

### P-9 · TRX ID uniqueness/duplication handling — **L**
Manual entry ⇒ typos/duplicates inevitable. Unique constraint? warn-only?
- **Recommended default:** non-unique free text + duplicate warning within same account (soft check), searchable.

## C. Security / Auth Gaps

### S-1 · Auth mechanics unspecified — **M** *(partially resolved by stack decision)*
No session/JWT/MFA/password-policy/reset/lockout guidance. Stack decision: JWT access(15m)+refresh(7d), argon2id hashing, lockout after 10 failed logins/15min, email-less reset via Super Admin (no SMTP dependency in v1).
- **Question:** Is Super-Admin-mediated password reset acceptable without email infrastructure?

### S-2 · Super Admin bootstrap procedure absent — **M**
First-run seeding of the guaranteed-active SUPER_ADMIN account.
- **Recommended default:** seed script creates SUPER_ADMIN from env vars on first deploy; forces password change on first login.

### S-3 · Audit log immutability & retention — **L**
Who may view/delete logs; how long kept.
- **Recommended default:** append-only table; view gated by `audit_logs.view`; no delete API; retained indefinitely (volume trivial at this scale).

### S-4 · Rate limiting & brute-force posture — **M** *(resolved by deployment plan)*
Public internet exposure demands nginx rate limits + login throttling + security headers. Covered in `deployment-plan.md` §Hardening.

## D. Data-Model Ambiguities

### D-1 · Deliverable attachments vs Resources unify? — **M**
Spec §8.1 gives Deliverables an `Attachments` field; new requirement adds project/milestone Resources. Two file systems would be wasteful.
- **Recommended default:** single polymorphic-lite `Resource` table; deliverable attachments = Resource rows scoped `deliverableId` (added nullable FK).

### D-2 · File size/type limits & storage quota — **L**
- **Recommended default:** ≤25 MB/file, whitelist (pdf, images, office docs, zip), ~10 GB volume ceiling monitored.

### D-3 · File versioning/overwrite policy — **L**
- **Recommended default:** overwrite-in-place v1 (old bytes replaced, audit log records actor); version chain deferred.

### D-4 · Delete rules for files & masters — **L**
Archive-vs-delete inconsistent across entities in spec.
- **Recommended default:** files hard-delete (metadata+bytes, audited); master records archive-only where spec lists Archived status; transactions/payment records never deletable (F-8).

### D-5 · Tag taxonomy for resources — **L**
Tag currently derived (Project|Milestone). Free-form tags later?
- **Recommended default:** derived enum only in v1; `tags jsonb` column reserved.

## E. Non-Functional Voids

| ID | Gap | Severity | Recommended default |
|---|---|---|---|
| E-1 | Hosting/backups/monitoring entirely absent from spec | ~~H~~ | **Resolved** — see `deployment-plan.md` |
| E-2 | Concurrency control (two users editing same entity) | L | Prisma optimistic locking on hot entities (milestones, transactions creation atomicity via DB tx) |
| E-3 | Timezone & locale | L | Store UTC; display Asia/Dhaka; en-US formatting; ৳ prefix |
| E-4 | Notifications/reminders (overdue, deadlines) | L | None in v1 beyond dashboard attention items; cron-generated daily digest optional post-MVP |
| E-5 | Export formats | L | CSV only v1 |
| E-6 | Browser/device support matrix | L | Evergreen browsers + Android PWA target |
| E-7 | Performance targets | L | p95 < 500 ms API on VM; trivial at this scale |
| E-8 | Backup restore testing cadence | M | Monthly restore drill documented in deployment runbook |

## F. Scope Confirmations (spec §30)

Explicitly out — confirm stakeholders agree these stay out through MVP:
payment gateways · bank sync · payroll engine · tax engine · HR/attendance/recruitment · procurement/inventory · marketing automation · Gantt · task management · time tracking · AI features · multi-company · multi-currency · optional payment-gate config (post-v1 candidate).

**Reversed by DEC-068/planning/BRD.md v1.2+ (2026-09-10):** double-entry GL is now IN scope (cash-basis, journal-entry system of record — see `planning/SRS.md` §3.6); percentage-based BDS commission is now IN scope alongside fixed amount (see `planning/BRD.md` FR-BDS-03). Removed from the "explicitly out" list above rather than left contradicting the current planning docs.

---

## Decision Checklist Before Build

Blocking decisions (defaults adopted unless overridden):

| Gap | Default adopted |
|---|---|
| F-1 | Manual team-member payable entries |
| F-2 | BDS payable activates on project Active |
| F-3 | Completion flips milestone to payment-Pending |
| F-8 | Posted financials immutable; `.update` = draft-only |
| D-1 | Unified Resource table incl. deliverable attachments |
| S-1/S-2 | JWT + Super-Admin reset + env-seeded bootstrap |

All other gaps proceed on their listed recommended defaults; revisit anytime via change request.
