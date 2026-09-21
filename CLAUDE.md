# CLAUDE.md — Hub Project Memory & Conventions

Small Company Management System ("hub"): internal tool connecting CRM → Projects/Milestones → ledger-driven Finance, with RBAC and audit trails. ≤5 users, ~monthly usage bursts, $0 recurring cost target.

## Authoritative Documents

| Path | Contents |
|---|---|
| `resources/company_management_system_project_overview.md` | Original client spec (source of truth for WHAT) |
| `analysis/requirements-analysis.md` | Distilled requirements, entity model, ERD, business rules §6–§7 |
| `analysis/requirement-gaps.md` | All gaps + adopted defaults (Decision Checklist at bottom) |
| `analysis/development-plan.md` | Stack, architecture, conventions, testing, CI/CD design |
| `analysis/deployment-plan.md` | Oracle VM, sslip.io, TLS, backups, hardening runbooks |
| `analysis/task-breakdown.md` | Phase 0–8 task checklists (0 = HTML UI design) + acceptance criteria — **superseded as the active backlog by `TASKS.md` (2026-09-10, stakeholder directive)**; kept as historical/phase-sequencing reference |
| `planning/` (BRD.md, SRS.md, ERD.md, FEATURES.md, DFD.md, adr/, EPICS.md) | Current authoritative requirements chain (agentic-harness pipeline, 2026-09-10) — supersedes `analysis/requirements-analysis.md`/`requirement-gaps.md` wherever they conflict, esp. the Finance model (see rules 2–4 below) |
| `TASKS.md` | Active backlog — 38 epic-derived tasks, read this (not `task-breakdown.md`) for "what's next" |
| `docs/memory/PROGRESS.md` | LIVE phase status — read first each session |
| `docs/memory/DECISIONS.md` | Append-only decision log |
| `docs/memory/` (whole dir) | Also an adopted `claude-obsidian` vault (DEC-065) — `.claude-obsidian.json`, `wiki/`. Raw .md files untouched; a `PostToolUse` hook nudges `/claude-obsidian:save` on edits. Vault mutation always needs reviewed transaction approval — never automatic. |

## Locked Stack

- **Monorepo:** pnpm workspaces — `apps/api` (NestJS 11), `apps/web` (Next.js 15 App Router PWA/Serwist), `packages/shared` (zod schemas, enums, permission keys), `infra/`
- **DB:** PostgreSQL 16 via Prisma 6 · **Auth:** JWT access(1d)+refresh(7d), argon2id
- **Deploy:** Docker Compose on Oracle Always Free ARM VM behind nginx; hostname `<ip-dashed>.sslip.io`; CI: GitHub Actions → GHCR → SSH deploy

## Non-Negotiable Rules

1. **Money is integer poisha** (×100) end-to-end. Never floats. Format ৳ only at render.
2. **Full double-entry general ledger is the system of record** (reversed from the earlier simple IN/OUT ledger — DEC-068, 2026-09-10, supersedes ADR-0011/DEC-064). Every financial event posts a balanced `JournalEntry` (debits = credits) made of `JournalLine`s against a chart of accounts (`Account`: Asset/Liability/Equity/Revenue/Expense). **Balances are always computed** — account, company, receivables, payables, trial balance, P&L, balance sheet all derive at query time from posted `JournalLine`s. No stored mutable balance field may ever exist. No free-form manual journal entry screen at any permission level — every entry is system-generated from a defined business event (payment, cost, reversal, opening balance).
3. One payment/cost record (`MilestonePayment`/`TeamMemberPayment`/`BDSPayment`/`ProjectCost`) ⇒ **exactly one balanced JournalEntry**, written in the same Prisma `$transaction`.
4. Posted `JournalEntry` rows are **immutable** — corrections are linked reversing entries (`reversalOfId` FK, `refType='REVERSAL'`). No edit/delete paths, ever.
5. Work status and payment status are independent machines. **Payment never blocks the next milestone.**
6. `Overdue` is derived at read time, never stored.
7. RBAC: allow-only union of active role permissions; keys live ONLY in `packages/shared` (format `resource.action`, lowercase).
8. Every sensitive write emits an AuditLog entry (actor + before/after).
9. ≥1 active SUPER_ADMIN invariant enforced in user deactivation logic.

## Minimal Code Discipline (Karpathy-framed ponytail)

Framed by four principles targeting LLM-specific coding failure modes (unchecked assumptions, overcomplication, unfocused diffs, vague goals) — adapted from Andrej Karpathy's critique of LLM coding behavior via [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) `karpathy-coder` (MIT; same source this repo already vendors `senior-architect` from). The existing ponytail YAGNI ladder sits inside principle 2 unchanged.

1. **Think Before Coding** — state assumptions explicitly; if multiple interpretations exist, present them, don't pick silently; if a simpler approach exists, say so and push back; if something is unclear, stop and ask rather than guess.
2. **Simplicity First** — the best code is the code never written. Before writing any code, stop at the first rung that holds:
   1. Does this need to exist? (YAGNI)
   2. Already in this codebase? → reuse it, don't rewrite
   3. Stdlib does it? → use it
   4. Native platform feature covers it? → use it
   5. Installed dependency solves it? → use it (no new deps otherwise — see Guardrails RAM budget)
   6. Can it be one line? → one line
   7. Only then: the minimum that works

   No unrequested abstractions, boilerplate, or "flexibility" nobody asked for; deletion over addition; boring over clever; fewest files. **The test:** would a senior engineer call this overcomplicated? If yes, simplify.
3. **Surgical Changes** — shortest working diff **after** understanding the problem (read the touched code and trace the real flow first). Touch only what the task requires; don't "improve" adjacent code, comments, or formatting; match existing style; remove only imports/vars *your* change made unused — mention (don't delete) pre-existing dead code unless asked. Bug fix = root cause in the shared function, not per-caller patches. **The test:** every changed line should trace directly to the task/AC.
4. **Goal-Driven Execution** — define verifiable success criteria before starting; replace vague asks with testable goals ("fix the bug" → "write a test that reproduces it, then make it pass"); for multi-step work, state a brief plan with a verify-check per step.

**Never lazy about:** input validation at trust boundaries, error handling preventing data loss, security, accessibility, and anything explicitly requested by spec/ACs.
**Precedence:** CLAUDE.md non-negotiables, financial invariants (`hub-ledger`), and task-breakdown acceptance criteria always outrank minimality. Mark deliberate corner-cutting with a known ceiling as `ponytail: <ceiling> → <upgrade path>`.
**When to relax:** trivial fixes (typo, obvious one-liner) — use judgment. Apply all four principles rigorously to non-trivial changes (>20 lines), unfamiliar code, multi-step/ambiguous tasks, and anything human-reviewed.

## Communication Style (caveman — always on)

All prose in caveman mode (`.claude/skills/caveman/SKILL.md`): terse, compressed, full technical accuracy. Applies every response, not on request. Code, docs, and commit messages stay normal.

## Commands

```bash
pnpm dev                 # api (:4000) + web (:3000) + dev postgres
pnpm lint && pnpm typecheck && pnpm test    # run ALL before declaring done
pnpm --filter api db:migrate            # prisma migrate dev
docker compose -f infra/docker-compose.dev.yml up -d   # standalone DB
```

## Session Protocol

0. Quick drives: `/start` `/do [task]` `/req <text>` `/wrapup` `/status` `/phase-done` `/prototype <ui-piece>` — see `docs/agentic/PROCEDURES.md`.
1. Read `docs/memory/PROGRESS.md` for live status, then `TASKS.md` (not `analysis/task-breakdown.md`) for the next `⏳ TODO` task, WSJF/priority + dependency order.
2. Every hub-* subagent now holds the `Skill` tool directly (DEC-058) and is instructed to invoke any relevant skill on its own judgement beyond what's listed below — the list below is a floor, not a ceiling. Load matching skill if working on: finance/payments/milestones → `hub-ledger` + `accountant-expert` (accounting correctness of every finance analysis, design, and test — DEC-043); finance testing/validation → `finance-integrity` + `accountant-expert` (every financial decision tested for accounting correctness); new files/modules → `hub-codebase` (+ link matching `docs/blueprints/*.md` if one exists; generate new blueprints via `workflow-blueprint` when a pattern-type stabilizes); infra/CI/docker → `hub-deploy`; UI/screens/visual design → `frontend-design` (+ `ui-ux-pro-max` searches for palettes/pairings/UX rules; + `design-taste-frontend` anti-slop pre-flight — merged workflow in `docs/designs/design-skills-merge.md`); NEW UI pieces → `/prototype` FIRST (emilkowalski prototype skill — mandatory before Phase 1 starts; variants in isolated surface, promote winner); Prisma schema/indexes/aggregate SQL → `postgres-ledger`; any feature/bugfix implementation → `test-driven-development` (+ `.claude/skills/testing-anti-patterns` — test real behavior, never mocks); browser verification/debugging → `webapp-testing`; apps/web Next.js work → `nextjs-developer`; apps/api NestJS work → `nestjs-best-practices`.
3. Follow Definition of Done in `analysis/development-plan.md` §10.
4. After finishing work: tick tasks in `PROGRESS.md`, append notable decisions to `DECISIONS.md` (never rewrite history there).
5. Conventional Commits; squash-merge via PR; migrations forward-only (`migrate deploy`).

## Delegation Rules (anti-stall)

Subagents get STUCK on large batches (observed: 31-screen wiring task cancelled twice; a stray `package.json` with Playwright left behind). Enforce:

1. **Max 3 files per delegated build/wire task.** Scope bigger work into multiple one-shot `Task` calls; orchestrator verifies between each. Never hand a subagent "wire all 31 screens".
2. **Every delegated task MUST append a thinking log** to `docs/agentic/RUNLOG.md` — format: `<ISO-time> | <agent> | <plan> → <decision> → <outcome>`. This is the "what the agents are thinking" trail. No log = task considered failed. A `.claude/settings.json` PostToolUse hook (DEC-058) checks this mechanically for every `hub-*` delegation and surfaces a blocking notice if RUNLOG.md wasn't appended — a nag, not a hard block on the subagent itself.
3. **Orchestrator audits after EVERY delegation**: file existence + `href` link check + canonical-shell check (`.app-shell`/`.sidebar`/`.nav-item.active`). Proceed only on PASS; re-delegate the delta on FAIL. Never stack a new batch on top of an unverified one.
4. **Subagents are one-shot `Task` calls.** They never persist across turns. They MUST write files with `write`/`edit` tools — a report-without-files is a failed task and is re-run inline by the orchestrator.
5. **Loop-guardian auto-invokes** when a task shows no file changes for 2 turns or repeats the same tool calls — breaks scope into smaller checkpoints.

## Guardrails

- **Implementation gate:** documentation, planning, and design-doc updates never authorize building. Code/mockup/file implementation starts ONLY on explicit user instruction ("go", "implement", equivalent). When uncertain whether an instruction authorizes implementation, ask.
- **Quality chain (see `Workflow.md`):** every task flows Plan (`hub-planner` — reads business+design requirements, minute breakdown, sets DoD gates) → Build (`hub-implementer`, ≤3 files, executes the spec) → Rule audit (`hub-reviewer`) → Empirical test (`hub-tester`, browser journeys + dataflow) → Code review (`hub-code-reviewer`) → **Standalone DoD gate (`hub-gatekeeper` — zero context, reads only authoritative docs + artifacts, runs LAST after all other agents stop)**. REROUTE/FAIL routes back to BUILD — never bypassed, never patched inline.
- **Orchestrator discipline:** the main agent NEVER writes product code inline. It plans, delegates, audits mechanically, updates memory, commits. A failing check means a new BUILD delegation, not an inline patch.
- **Design-first intake:** new requirements flow Business analysis (`hub-business-analyst`) → technical analysis (`hub-analyst`) → design in `docs/designs/` → architecture review (`hub-solution-architect`) → gatekeeper validation → human approval — before any build task is created or implemented.
- Do not modify `infra/`, Dockerfiles, or workflows without loading `hub-deploy` skill (deep pipeline/rollout patterns: `deployment-pipeline-design`, `deployment-patterns`).
- Do not add dependencies without checking they fit the free-VM footprint (<500MB steady RAM total).
- No business logic in controllers; financial mutations must have e2e atomicity tests.
- Spec deviations are only legitimate if logged in `requirement-gaps.md` defaults or `DECISIONS.md`.
- **NEVER push to the remote without explicit user confirmation.** Commit locally as needed, but a `git push` requires the user to explicitly say "push" / "confirm push" / equivalent. This overrides any prior commit-then-push habit. Staged/unpushed work is fine to leave for the user to review.
