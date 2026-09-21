---
description: Phase-gate verification — confirm all acceptance criteria are demonstrably met before moving to the next phase.
argument-hint: "[phase] (default: current phase from PROGRESS.md)"
---

Phase completion gate for: $ARGUMENTS (default: current phase from PROGRESS.md)

1. List every checkbox in the phase section of `analysis/task-breakdown.md` and its mirrored items in `docs/memory/PROGRESS.md`. All must be `[x]` — list any stragglers and stop if found.
2. For each **AC** in that phase, demand evidence: the specific e2e/unit test name that proves it. Run `pnpm test` and confirm those tests exist and pass. Unproven ACs = blockers; propose implementing them via `/do`.
3. **Context-free phase audit** — spawn `hub-gatekeeper` scoped to the phase (task list + diff range since the phase's first commit; pass NO summaries). Any REROUTE verdict blocks phase closure — route findings per its target (design fixes via `/req`, dev fixes via `/do`), then re-run this command.
4. Cross-check finance phases (5–7) additionally against CLAUDE.md non-negotiable rules 1–6 — spot-verify with a grep for forbidden patterns (`float` money math, stored balance fields, stored overdue, UPDATE/DELETE on posted transactions). For these phases the **full `finance-integrity` sweep** (all checks I1–I10 on seeded golden fixture + observed-vs-expected reconciliation tables) must be green — attach its output to the gate report.
5. If everything passes:
   - Update PROGRESS.md Current Focus to the next phase + its first task
   - Append Session Log row "Phase N gated complete"
   - Append DECISIONS.md entry recording phase completion date
6. Output the gate report: checklist table (item → proof), gatekeeper dataflow highlights, verdict, new Current Focus.
