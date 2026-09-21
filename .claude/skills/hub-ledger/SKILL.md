---
name: hub-ledger
description: Use when writing or reviewing ANY code touching money or progress states in this repo — payments (client, team-member, BDS), transactions, accounts, balances, receivables, payables, milestones, deliverables, project costs, finance modules under apps/api/src/modules/. Enforces ledger invariants, atomicity patterns, and status machine rules. Load BEFORE implementing these features.
---

# Hub Ledger & Finance Rules

The financial core is the reason this system exists. These rules are absolute; violating any one of them is a failed PR regardless of tests passing elsewhere.

## Money representation
- Integer **poisha** (×100) end-to-end: DB `Int`, API payloads, computations. Never float, never string.
- Convert to ৳ display strings ONLY in UI renderers (`packages/shared` money helpers).
- Amounts are non-negative; direction (`IN`/`OUT`) carries sign semantics.

## Ledger invariants (requirements-analysis §7.1)
- **L1** Balance = `openingBalance + ΣIN − ΣOUT`, always computed at query time. A stored mutable balance column must NEVER exist.
- **L2** One payment record ⇒ exactly one Transaction, created inside the SAME `prisma.$transaction([...])`. If you can make one without the other, your code is wrong.
- **L3** Posted transactions/payment records are immutable. No UPDATE/DELETE endpoints for posted rows. Corrections create a linked reversal transaction: opposite direction, same amount, `refType='REVERSAL'`, `refId=originalId`, mandatory reason → audit log.
- **L4/L5** Opening balances & manual adjustments are themselves transactions with notes.

## Status machines (§7.2)
- Work: `PENDING → IN_PROGRESS → COMPLETED` (+`ON_HOLD`/`CANCELLED` optional).
- Payment: `NOT_DUE → PENDING → PARTIALLY_PAID → PAID`.
- Adopted defaults (DEC-007..DEC-010): completion flips payment to `PENDING`; team payables accrue only via manual entries; BDS payable activates on project `Active`; `.update` permissions apply to drafts only.
- `OVERDUE` is DERIVED at read time (`(PENDING|PARTIALLY_PAID) && paymentDueDate < today`). Never store it.
- Starting milestone N+1 must never check payment state of milestone N.

## Side-effect chains (implement each atomically)
| Entry | Must do |
|---|---|
| ClientPayment | row + IN txn + recompute milestone paid total/status |
| TeamMemberPayment | row + OUT txn + payable ↓ + project-cost linkage when projectId present |
| BDSPayment | row + OUT txn + compensation outstanding ↓ + cost linkage |
| ProjectCost paid | row + immediate OUT txn |
| Unpaid cost → paid | OUT txn + flip `paid=true` (single action) |

Partial allocations validate `Σ allocations ≤ milestone.amount`.

## Required engineering practices
- Every financial mutation gets an e2e Supertest asserting DB rows (payment + txn + recomputed statuses) inside one transaction scenario — see task-breakdown Phase 5/6 ACs.
- Fixture baseline mirrors spec §20 (Project A ৳500,000; M1–M4) so outputs are assertable against documented numbers.
- AuditLog entry with before/after for every write above.
- Permission gates are separate per family: `milestone_payments.*`, `team_payments.*`, `bds_payments.*`, `transactions.create/reverse/view`. Viewing finance never implies moving money.

## Reference docs
- Formulas & worked examples: `analysis/requirements-analysis.md` §7.3–§7.4
- Full gap defaults: `analysis/requirement-gaps.md` §Decision Checklist
