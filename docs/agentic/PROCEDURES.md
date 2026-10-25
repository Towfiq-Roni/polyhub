# Agentic Development System — Procedures

> How this repository is developed: a memory-driven, invariant-gated loop executed by Claude Code agents.
> Components live in `CLAUDE.md`, `.claude/{agents,commands,skills}/`, and `docs/memory/`.

---

## 1. Principles

1. **Memory is the source of momentum** — `docs/memory/PROGRESS.md` decides what happens next; no agent invents its own backlog.
2. **Invariants gate progress** — nothing merges without passing the reviewer's rule checklist; rules outrank velocity.
3. **Small loops** — one task per `/do`; implement → review → fix → memory-tick. No batch-and-pray.
4. **Append-only truth** — DECISIONS.md and gap records are never rewritten; changes supersede via new entries.
5. **Human owns judgment calls** — agents propose; the human approves decisions, requirements, and commits.
6. **Ponytail discipline, Karpathy-framed** — the best code is the code never written (CLAUDE.md §Minimal Code Discipline: Think Before Coding · Simplicity First [the YAGNI ladder] · Surgical Changes · Goal-Driven Execution); enforced via prompt convention baked into CLAUDE.md and the implementer/reviewer agents (the `@dietrichgebert/ponytail` opencode plugin has no Claude Code equivalent and was dropped on migration — the discipline is carried entirely in prose now, and DEC-054 folded in the Karpathy four-principle framing from `alirezarezvani/claude-skills` `karpathy-coder`). Never at the cost of validation, security, or AC-mandated tests.

## 2. Topology

```text
 Human
  │  /start /do /req /wrapup /status /phase-done
  ▼
 Claude Code primary session ──reads──► CLAUDE.md (auto) + docs/memory/*
  │                    │
  │ delegates          │ applies approved edits to analysis/ + docs/memory/
  ▼                    ▼
 subagents (.claude/agents/)
  ├── hub-business-analyst  intake stage: business requirements brief,
  │                         user stories, scope lines (no tech solutions)
  ├── hub-analyst           technical classification & impact analysis drafts
  ├── hub-solution-architect design-stage gate: APPROVED/REVISE on drafts
  │                         (senior-architect skill tooling)
  ├── hub-implementer       writes code+tests, runs gates, reports
  ├── hub-reviewer          read-only rule audit → PASS/FAIL verdict
  ├── hub-tester            empirical verification: runs gates/e2e/browser,
  │                         evidence-based PASS/FAIL; never fixes code
  ├── hub-code-reviewer     two-axis review (Standards+Spec) after tester passes;
  │                         read-only — derives tasks routed to implementer/tester
  ├── hub-gatekeeper        context-free DoD gate: design conformance +
  │                         real dataflow trace → PASS / REROUTE(dev|design|both)
  └── (intake order: business-analyst → analyst → design → architect → gatekeeper)

 skills (.claude/skills/) inject domain law on demand:
  hub-ledger · hub-codebase · hub-workflow · hub-deploy
```

## 3. Component Map

| Type | Name | Trigger | Role |
|---|---|---|---|
| command | `/start` | session begin | orient from memory, propose next task |
| command | `/do [task]` | per task | full implementation loop w/ review gate |
| command | `/wrapup` | session end | gates, memory sync, commit plan |
| command | `/status` | anytime | compact health report |
| command | `/req <text>` | new idea/change | change-management intake |
| command | `/phase-done [n]` | phase end | AC evidence audit, phase transition |
| agent | hub-implementer | via /do | single-task implementation |
| agent | hub-reviewer | via /do Stage B | invariant & AC audit (read-only) |
| agent | hub-tester | via /do Stage C | empirical gate/e2e/browser verification (read-only) |
| agent | hub-code-reviewer | via /do Stage D | two-axis Standards+Spec review; derives tasks for implementer/tester (read-only) |
| agent | hub-gatekeeper | via /do + /req + /phase-done | context-free DoD/design gate (read-only); receives task+diff only, never summaries |
| agent | hub-business-analyst | via /req stage 1 | business requirements brief, user stories, scope lines; no tech solutions (read-only) |
| agent | hub-analyst | via /req stage 2 | technical classification & impact analysis drafts (read-only) |
| agent | hub-solution-architect | via /req stage 4 | architecture review of designs: APPROVED/REVISE (read-only); senior-architect tooling |
| skill | hub-ledger | money/milestone code | ledger law L1–L5, M1–M6 |
| skill | hub-codebase | any new file | placement/naming conventions |
| skill | hub-workflow | sessions | memory protocol, DoD chain |
| skill | hub-deploy | infra/docker/CI | $0 constraints, rollback, secrets |
| skill | frontend-design | UI/screens/design | distinctive visual direction; vendored from anthropics/skills + hub overrides |
| skill | postgres-ledger | Prisma schema/indexes/SQL | ledger-aware Postgres practices; curated from github/awesome-copilot |
| skill | test-driven-development | any feature/bugfix | red-green-refactor iron law; vendored from obra/superpowers + hub runners |
| skill | webapp-testing | browser verification | Playwright patterns for hub screens/PWA; curated from github/awesome-copilot |
| skill | nextjs-developer | apps/web work | App Router/RSC rules; vendored from jeffallan/claude-skills + hub overrides |
| skill | nestjs-best-practices | apps/api work | 40-rule priority index + hub precedence table; adapted from kadajett/agent-nestjs-skills |
| skill | ui-ux-pro-max | design intelligence searches | searchable palettes/pairings/UX rules/charts (python3 CLI); pruned vendored data from nextlevelbuilder |
| skill | deployment-pipeline-design | CI/CD design/debugging | pipeline stages/gates/health-check depth; vendored from wshobson/agents + single-VM overrides |
| skill | deployment-patterns | dockerize/release readiness | strategies/Docker/checklists; vendored from affaan-m/ecc + single-VM overrides |
| skill | workflow-blueprint | after pattern-types stabilize | distills gate-passed flows into docs/blueprints/ implementation templates; adapted from github/awesome-copilot |
| hook | `block-git-push` | PreToolUse Bash | blocks `git push` unless same segment carries `HUB_PUSH_CONFIRMED=1` |
| hook | `protect-paths` | PreToolUse Edit/Write | blocks `.env*` (except `*.example`), `.git/`, existing prisma migrations, root `TASKS.md` |
| hook | `require-task` | PreToolUse Bash/Edit/Write | `apps/**`+`packages/**` writes need the one focused task (`tasks/.focus`) IN_PROGRESS with an existing build spec |
| hook | `session-start` | SessionStart | short briefing: branch, dirty/stashes, Focus, Next, pointer to `tasks/INDEX.md` |
| cli | `tools/task.py` | per task | backlog CLI over `tasks/NNN-slug.md` (show/start/log/done/status/new/index/brief); regenerates `tasks/INDEX.md` |
| memory | `docs/memory/pitfalls/` | on recurrence | typed pitfall docs + `INDEX.md` (raw .md, outside the vault ingest path) |

Hook escapes: `HUB_PUSH_CONFIRMED=1` (set per push command, only after explicit user confirmation) and `HUB_SKIP_TASK_GATE=1` (user-set only; each bypass auto-logged to RUNLOG). Backlog source is `tasks/*.md` (read `tasks/INDEX.md` + the one task file); root `TASKS.md` is a retired pointer.

> **Dropped on Claude Code migration:** the opencode `@dietrichgebert/ponytail` plugin (`/ponytail [lite\|full\|ultra\|off]`, `/ponytail-review`, `/ponytail-audit`, `/ponytail-debt`) has no Claude Code equivalent. The minimal-code ladder it injected every turn is now carried entirely as prose in `CLAUDE.md` §Minimal Code Discipline and enforced by `hub-implementer`/`hub-reviewer` — no live plugin, no slash commands for it.

## 4. The Core Loop (`/do`)

```text
resolve task (PROGRESS Current Focus or argument)
  → design precondition: any linked docs/designs/REQ-*.md must be VALIDATED
  → mark [~]
  → A. hub-implementer implements (+tests)
  → B. hub-reviewer rule audit            ┐ max 2 cycles,
       FAIL? violations back to A         ┘ then human decides
  → C. hub-tester empirical verification  ┐ max 2 cycles,
       FAIL? derived tasks back to A      ┘ then human decides
  → D. hub-code-reviewer (Standards+Spec axes, read-only)
       BLOCKERS → derived tasks → re-run B→D (max 1 full re-loop);
       SUGGESTIONS recorded, non-blocking; CLEAN → continue
  → E. hub-gatekeeper (context-free: task+diff ONLY, no summaries)
        PASS            → continue
        REROUTE-dev     → findings to implementer → B–E again (max 1 re-loop)
        REROUTE-design  → halt; amend docs via /req first, then restart at A
        REROUTE-both    → design fix first, then dev, in that order
  → F. primary runs lint/typecheck/test
  → tick [x] + Session Log row + DEC-### if new decision
  → propose conventional commit (human approves)
```

**Gate rules:** an AC without a named passing test is not done · tester evidence beats claims · code-review BLOCKERS clear before gating · no test, review, or summary substitutes for the gatekeeper reading the code itself.

## 5. Change Management (`/req`) — design-first

Any new requirement, mid-build idea, or spec contradiction:

```text
request → 1. hub-business-analyst (business brief: problem · stories+ACs · scope
            lines · principle check) — human confirms business intent
        → 2. hub-analyst (classify · impact trace · finance-safety check)
        → 3. DESIGN DRAFT      docs/designs/REQ-<n>-<slug>.md (template in its README)
        → 4. ARCHITECTURE      hub-solution-architect: APPROVED / REVISE
                               (max 2 cycles, then human decides)
        → 5. DESIGN VALIDATION hub-gatekeeper checks design-vs-spec coherence +
                               dataflow completeness (no code exists yet)
        → 6. human approves option & design
        → 7. status=VALIDATED + DEC-### entry linking the file
        → 8. apply verbatim drafts:
             analysis/requirement-gaps.md  (gap entry, append)
             analysis/task-breakdown.md    (task delta checkboxes)
             docs/memory/PROGRESS.md       (focus update if needed)
Implementation of those tasks happens later via /do — never inside /req.
```

Finance-unsafe proposals must resolve the conflict before any code exists (hub-ledger invariants win by default; only the human may consciously override, and the override becomes a DEC entry). A design that fails gatekeeper validation loops back to drafting — it never skips to tasks.

## 6. Phase Gates (`/phase-done`)

A phase closes only when:
1. Every checkbox `[x]` in both task-breakdown and PROGRESS.
2. Every AC has named passing tests (verified by running them).
3. Finance phases additionally grep-clean of forbidden patterns (float money, stored balances, stored overdue, mutation paths on posted transactions).
4. PROGRESS focus advances + completion recorded in DECISIONS.

## 7. Escalation & Hard Stops

| Situation | Action |
|---|---|
| Reviewer FAIL after 2 cycles | stop, present findings, human arbitrates |
| Task needs a decision not in DECISIONS/gaps | halt → `/req` first |
| Request touches `infra/`, Dockerfiles, workflows | load `hub-deploy` before any edit |
| Conflict with append-only logs | never rewrite; supersede with new DEC entry referencing the old ID |
| Gates red at wrapup | trivial fixes inline; else new PROGRESS task |

## 8. Session Rhythm (canonical day)

```text
/start            # orient
/do               # repeat per task
/req (as needed)  # intake surprises immediately, don't improvise
/wrapup           # gates, memory sync, commit plan → human commits/pushes
```

## 9. Adding New Machinery

- New recurring procedure → add a `.claude/commands/<name>.md` following the existing template shape, then list it in §3 here.
- New domain-law cluster → new skill folder under `.claude/skills/` + CLAUDE.md §Session Protocol pointer + §3 row.
- Restart Claude Code after adding/changing config-time files.
