---
name: finance-integrity
description: Use when testing or validating ANY financial path in this repo — payments (client/team/BDS), transactions, ledger balances, receivables, payables, milestone status math, project costs, reports/dashboards with money. Defines runnable invariant checks (I1–I10), orphan/mismatch detection queries, and the pre-phase-gate full sweep. Load for hub-tester Stage C on finance tasks and before closing Phases 5–8.
---

# Finance System Integrity Testing

Money bugs are silent until they're expensive. This skill turns every ledger invariant into a **runnable check**. Nothing here is satisfied by code reading alone — each check must execute against real data (fixture or scratch DB) and produce observed output.

## When to run what

| Trigger | Scope |
|---|---|
| hub-tester Stage C on a finance task | Checks I1–I10 relevant to the touched paths |
| Any change to payment/transaction services | Pairing + atomicity tests of that flow |
| `/phase-done` for Phases 5–8 | **Full sweep** — entire integrity suite green |

Integrity checks live as code: `apps/api/test/integrity/finance-integrity.e2e-spec.ts` grows alongside features (TDD skill rules apply — failing check first).

## Golden fixture (spec §20 — assert these exact numbers)

Project A contract ৳500,000 · M1 100k, M2 150k, M3 150k, M4 100k.

| State | Received | Currently Due | Not Yet Due |
|---|---|---|---|
| M1 completed, unpaid | 0 | 100,000 | 400,000 |
| After ৳100k M1 payment | 100,000 | 0 | 400,000 |
| M2 completed, unpaid | 100,000 | 150,000 | 250,000 |

Partial: 50k+50k on a 150k milestone ⇒ PARTIALLY_PAID; third 50k ⇒ PAID. Every integrity run seeds this fixture and asserts to the poisha.

## Invariant checks

### I1 · Balances are derived, and correct (rule L1)
Independent recomputation vs everything that displays a balance:
```sql
SELECT a.id,
  a.opening_balance
  + COALESCE(SUM(t.amount) FILTER (WHERE t.direction='IN'), 0)
  - COALESCE(SUM(t.amount) FILTER (WHERE t.direction='OUT'), 0) AS expected
FROM accounts a LEFT JOIN transactions t ON t.account_id = a.id
GROUP BY a.id, a.opening_balance;
```
Compare against service output AND rendered UI values. Company balance == Σ active account balances. **Grep-guard:** no mutable `balance` column exists on accounts.

### I2 · Payment ⇄ Transaction pairing (rule L2)
Per payment family (client/team/bds):
- Every payment record ↔ exactly one Transaction of matching direction (`IN` client, `OUT` team/bds).
- Zero orphans either direction; zero duplicates.
```sql
-- orphaned payments
SELECT cp.id FROM client_payments cp
LEFT JOIN transactions t ON t."refId" = cp.id AND t."refType" = 'CLIENT_PAYMENT'
WHERE t.id IS NULL;
```
Atomicity proof: the e2e for each flow must demonstrate rollback leaves NO partial pair when a forced failure occurs mid-write.

### I3 · Immutability & reversal integrity (rule L3, gap F-8)
- Grep-guard: no UPDATE/DELETE route exists for posted transactions/payment records.
- Reversal rows: direction opposite, amount identical, `refType='REVERSAL'`, `refId` = original, original marked reversed **once** — a second reversal attempt must fail with a domain error (test it).
- Reversing restores prior computed balances exactly (I1 before/after comparison).

### I4 · Amount hygiene
- Prisma schema: money columns are `Int` — grep-guard `Float|Decimal` on any amount field.
- All amounts ≥ 0 in DB (negative check query); API rejects negative/invalid-zero inputs at DTO layer.
- Wire payloads carry integer poisha (no decimal separators); render-side ৳ formatting only.

### I5 · Status machines consistent
Per milestone, independently recompute from raw tables:
- expected paymentStatus from Σallocations vs amount + trigger rule (completion ⇒ PENDING per DEC-009);
- compare stored value — drift = BLOCKER;
- work-status transitions legal per M1; cancelled milestones excluded from due/not-due aggregations (F-7);
- progression independence: seeded fixture proves M2 starts while M1 unpaid (M4 rule).

### I6 · Overdue derived-only
Grep-guard: no persisted overdue/enriched status column. Derivation verified at two reference dates (data setup shifting `paymentDueDate`) matches display logic exactly.

### I7 · Receivables reconciliation
- project received == Σ clientPayments(project)
- currentlyDue == Σ triggered milestones − Σ allocations to them
- notYetDue == remaining milestone amounts
- company receivable == Σ projects; assert against golden fixture table above.

### I8 · Payables reconciliation
- BDS outstanding == Σ agreedAmounts − Σ bdsPayments(partner/project)
- Team payable == Σ payable entries (DEC-007 model) − Σ teamPayments(member)
- Other payable == Σ project costs where paid=false
- Breakdown components sum to reported total payable.

### I9 · Audit completeness
Every payment create, cost pay-action, reversal emits an AuditLog row (actor + before/after) **within the same transaction** — verify via the atomicity tests, not post-hoc queries alone.

### I10 · Journal coherence
Every transaction: valid direction enum, existing account + category, non-null date ≤ today (future-dated rejected at entry), `refType/refId` consistent when present, TRX ID searchable (P-9). If transfers exist later (F-5): paired OUT+IN share `transferRef`, net zero across accounts.

## Full-sweep procedure (pre-phase-gate, Phases 5–8)
1. Seed golden fixture on scratch DB.
2. Run complete integrity suite (`finance-integrity.e2e-spec.ts`).
3. Run grep-guards (schema money types, balance/overdue columns, mutation routes).
4. Attach observed-vs-expected table for I1/I7/I8 to the `/phase-done` report. Any red = phase cannot close.

## Failure handling
- Violation ⇒ **BLOCKER** → `/do` reroute to development. Root cause first: fix the shared calculation/service, never patch the caller.
- Check itself ambiguous or reveals an undocumented flow ⇒ REROUTE-design via `/req`.
- **Never mutate data to make a check pass** — that is falsifying the ledger.
