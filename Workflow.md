# Workflow — Hub Development Pipeline

> The single source of truth for WHO does WHAT, in WHICH order, with WHICH skills.
> The orchestrator (main agent) runs this pipeline. It does not build.

---

## 1. Cast

| Actor | Role | Allowed to edit files? |
|---|---|---|
| **Orchestrator** (main agent) | Reads memory, plans, delegates, audits results, updates memory, commits. **NEVER writes product code inline.** | Memory/docs/config only |
| `hub-business-analyst` | New requirements → business brief (problem, stories, scope) | No |
| `hub-analyst` | Technical classification, impact analysis, gap drafts | No |
| `hub-solution-architect` | Reviews designs before build: boundaries, dataflow, constraints | No |
| `hub-planner` | **Stage 1, before implementer.** Reads business + design requirements itself, breaks the task to minute detail (≤3-file batches), sets the task's DoD gates (static/empirical/gatekeeper), writes `docs/agentic/build-specs/`. | Build specs only |
| `hub-implementer` | Builds/fixes code by executing the planner's spec. **Max 3 files per task.** Loads matching skill first. | Yes — scoped files only |
| `hub-reviewer` | Rules audit of the diff: CLAUDE.md non-negotiables, invariants, AC conformance | No |
| `hub-tester` | Empirical verification: runs gates, browser journeys, dataflow. Skills: `webapp-testing`, `testing-anti-patterns`, frontend criteria | No |
| `hub-code-reviewer` | Two-axis diff review (Standards + Spec), derives follow-up tasks | No |
| `hub-gatekeeper` | **Standalone third-party DoD audit. Zero session context.** Reads only authoritative docs + artifacts. Runs LAST. | No |
| `loop-guardian` | Breaks stalls (no file change 2 turns / repeated calls) | No |

### Skill routing (per agent)
Every agent above holds the `Skill` tool directly (DEC-058) and is instructed to invoke any
relevant skill on its own judgement, not just the ones named below — this list is a **floor**
(skills that MUST be loaded for these situations), not a ceiling. `hub-code-reviewer`,
`hub-gatekeeper`, `hub-reviewer`, `hub-tester`, `hub-solution-architect`, `hub-analyst`,
`hub-business-analyst`, `hub-planner`, `hub-implementer` all call `Skill` themselves now
instead of the orchestrator or a hardcoded `Read .claude/skills/X/SKILL.md` path deciding
for them (superseding the DEC-053 workaround, which existed only because these agents'
`tools:` lists lacked `Skill`).
- Finance/money/milestone code → `hub-ledger` + `accountant-expert` (analysis, design, implementer, reviewer), `finance-integrity` + `accountant-expert` (tester, gatekeeper)
- New files/modules → `hub-codebase`; stable pattern → `workflow-blueprint`
- UI build → `frontend-design` + `ui-ux-pro-max` + `design-taste-frontend` (see `docs/designs/design-skills-merge.md`)
- **New UI piece → `/prototype` FIRST** (mandatory before Phase 1 UI work)
- Tests → `test-driven-development` + `testing-anti-patterns` (test real behavior, never mocks)
- Browser verification → `webapp-testing`
- Infra/CI → `hub-deploy`; Prisma/SQL → `postgres-ledger`

---

## 2. The Pipeline (every task, no exceptions)

**Backlog:** one file per task (`tasks/NNN-slug.md`); `tasks/INDEX.md` is generated.
Agents read INDEX + the ONE task file, never a monolith (`TASKS.md` is a retired pointer).
`python3 tools/task.py start <id> --spec <spec>` sets the single focus before any product edit.
Append changelog via `python3 tools/task.py log <id> "<note>"`; close with `task.py done`.

```
 ┌─────────────────────────────────────────────────────────────┐
 │ 0. ORCHESTRATOR: read PROGRESS.md + tasks/INDEX.md → pick   │
 │    task → open that one task file                           │
 │    (docs/config edits allowed; product code NOT)            │
 └──────────────────────────┬──────────────────────────────────┘
                            ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ 1. PLAN — hub-planner: reads business + design requirements │
 │    itself, minute breakdown (≤3-file batches), sets the     │
 │    task's DoD gates, writes build-spec. No spec, no build.  │
 │    orchestrator then runs task.py start <id> --spec <spec>  │
 └──────────────────────────┬──────────────────────────────────┘
                            ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ 2. BUILD — hub-implementer executes the spec (≤3 files,     │
 │    skill-loaded, appends RUNLOG). New UI? /prototype first. │
 └──────────────────────────┬──────────────────────────────────┘
                            ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ 3. RULE AUDIT — hub-reviewer (diff vs non-negotiables,      │
 │    invariants, ACs). FAIL → back to 1 with findings.        │
 └──────────────────────────┬──────────────────────────────────┘
                            ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ 4. EMPIRICAL TEST — hub-tester (lint/typecheck/test +       │
 │    browser journey + dataflow + screenshots).               │
 │    FAIL → back to 1 with repro.                             │
 └──────────────────────────┬──────────────────────────────────┘
                            ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ 5. CODE REVIEW — hub-code-reviewer (Standards + Spec axes,  │
 │    derives follow-up tasks). Findings → back to 1.          │
 └──────────────────────────┬──────────────────────────────────┘
                            ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ 6. DoD GATE — hub-gatekeeper. STANDALONE. Runs ONLY after   │
 │    1–4 have stopped. Zero context from session/other        │
 │    agents: reads requirements, design docs, and the         │
 │    artifacts themselves. Checks: requirements coverage,     │
 │    design conformance, UX quality, journey completeness     │
 │    (own browser evidence). PASS → 7. REROUTE → 2 (re-plan only if gates were wrong).           │
 └──────────────────────────┬──────────────────────────────────┘
                            ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ 7. ORCHESTRATOR: tick PROGRESS.md, append DECISIONS.md,     │
 │    commit locally. PUSH only on explicit human "push".      │
 └─────────────────────────────────────────────────────────────┘
```

### Loop discipline
- Any FAIL/REROUTE re-enters at **2 (BUILD)** with the findings as the task. Never patch inline to "save time".
- Max 3 fix iterations per finding set before escalating to the human.
- `loop-guardian` auto-invokes when a delegation stalls (no file changes 2 turns).
- Every delegation appends one line to `docs/agentic/RUNLOG.md` (DEC-038). No log = failed task.

### Orchestrator audit between steps
After each delegation the orchestrator verifies mechanically (files exist, greps, suite runs) — this is *auditing*, not building. If audit fails, re-delegate the delta.

---

## 3. Phase gates

| Milestone | Gate must include |
|---|---|
| Any UI phase (0, screens, dashboards) | reviewer R-gates + tester browser journeys (all viewports 390/768/900/1440) + **gatekeeper standalone audit** (requirements §25 list, DESIGN.md conformance, UX pre-flight, journey crawl with own Playwright evidence) |
| Finance phases (5–8) | `finance-integrity` I1–I10 sweep + atomicity e2e evidence |
| Infra (1) | `hub-deploy` review + rollback drill evidence |
| Pre-Phase-1 UI start | `/prototype` runs for every new UI piece; winners promoted, surfaces deleted |

## 4. Memory protocol
- `docs/memory/PROGRESS.md` — tick tasks, append session rows. Read FIRST every session.
- `docs/memory/DECISIONS.md` — append-only decisions.
- `docs/agentic/RUNLOG.md` — one line per delegation.
- `Workflow.md` (this file) — change only via human decision + DEC entry.

## 5. Automation (DEC-058)

Two mechanical enforcements now back what was previously prose-only, plus one optional
codified run of this whole pipeline:

- **RUNLOG enforcement (hook, live now):** `.claude/settings.json` PreToolUse/PostToolUse
  hooks on `Agent|Task` calls where `subagent_type` starts with `hub-` checkpoint
  `docs/agentic/RUNLOG.md`'s line count before the call and check it grew after — if not,
  the orchestrator gets a blocking notice citing DEC-038. Nag, not a hard block on the
  subagent itself (it already finished); it forces the orchestrator to notice and fix
  before proceeding, per rule 1.5 below.
- **Gate hook (guarded, inert until Phase 1):** a `Stop` hook runs `pnpm lint && pnpm
  typecheck && pnpm test` in the background (async, only wakes the session on failure) —
  but only `if [ -f pnpm-workspace.yaml ]`, so it is a no-op today and activates itself
  automatically the moment Phase 1's monorepo scaffold lands. No change needed then.
- **Codified pipeline script (opt-in, untested against a real task):**
  `.claude/workflows/hub-quality-chain.js` runs Plan→Build→Review→Test→CodeReview→Gate as
  one `Workflow` tool invocation per task, looping REROUTEs back to Build (or Plan, on a
  gatekeeper REROUTE) automatically instead of the orchestrator calling each stage by hand.
  Invoke with `Workflow({name: 'hub-quality-chain', args: {taskDescription: '...'}})`.
  This does NOT remove the human from the loop — the `Workflow` tool still requires
  per-run opt-in language from the user before the orchestrator may call it. Read
  `docs/agentic/RUNLOG.md` after its first real run and fix the script rather than
  trusting it blindly — it has not yet been exercised against a real task.

## 6. Hard rules (restated)
1. Orchestrator never writes product code. Never. The remedy for a failing check is a new BUILD delegation, not an inline patch.
1.5. No build without a planner spec — every hub-implementer delegation carries the hub-planner's spec (batch + gates).
2. Gatekeeper is a third person: no session context, no other agents' claims, no orchestrator summaries in its prompt — only doc pointers + artifact paths.
3. Gatekeeper runs last, after every other agent has stopped.
4. Money is integer poisha; balances computed; posted rows immutable; payment never blocks next milestone; Overdue derived; RBAC union; audit every sensitive write; ≥1 active SUPER_ADMIN.
5. Never push without explicit human confirmation (DEC-041).
6. **Never commit an unverified task.** Stage 7 runs only after the gate renders PASS (or UNVERIFIABLE-with-human-override recorded in RUNLOG by the human). A provider outage parks the commit — it does not lower the bar (DEC-043).
