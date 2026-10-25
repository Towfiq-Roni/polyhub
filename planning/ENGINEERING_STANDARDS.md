# Engineering Standards

> Enforced by `/agentic-harness:architect` on every task before it's marked ✅ DONE — see
> `architect.md`'s Architecture Review step. Generic defaults below; add
> project-specific conventions under "Project-specific additions" as they
> emerge. Don't relitigate the defaults per task — they're the baseline.

## Non-negotiable

- **Tests pass.** A task without a passing test run is not done — no
  exception, no "looks correct to me."
- **No cross-segment edits without sign-off.** A segment agent only
  touches its own `owns_paths` (see `planning/project.config.yaml`'s
  `architecture.segments`). Needing to touch another segment's files means
  the task was mis-scoped or the segmentation is stale — flag it, don't
  just do it. This includes swarms (`architecture.swarms`): a swarm
  coordinates parallel dispatch on one task, it never merges paths.
- No dead code, no commented-out blocks, no unused imports/variables left behind.

## Judgment calls (architect enforces at review time)

- No premature abstraction — three similar lines beat a speculative helper.
- No unrequested scope creep — a bug fix doesn't need a refactor riding along.
- Match existing patterns in the segment before introducing a new one.
- Comments explain WHY (a non-obvious constraint, a workaround), never WHAT
  (the code already says that).
- No new dependency, framework, or architectural pattern introduced without
  it being called out explicitly in the task or flagged to the user first.

## Project-specific additions

- Money is integer poisha (×100) end-to-end. Never floats. Format ৳ only at render (BRD NFR-01).
- Balances are always computed from posted journal entries (double-entry general ledger). No stored mutable balance field (BRD FR-FIN-03).
- Every journal entry is balanced (debits = credits) and system-generated from a defined business event — no free-form manual entry screen (BRD FR-FIN-02, FR-FIN-16).
- Posted journal entries are immutable — corrections are linked reversing entries only, no edit/delete paths (BRD NFR-05, NFR-08, FR-FIN-12).
- Work status and payment status are independent state machines; payment never blocks the next milestone (BRD FR-PROJ-04).
- `Overdue` is derived at read time, never stored (BRD FR-PROJ-05, FR-FIN-09).
- RBAC is allow-only union of active role permissions (BRD FR-ADMIN-04).
- Every sensitive write emits an audit log entry with actor + before/after (BRD NFR-04, FR-ADMIN-06).
- ≥1 active Super Admin invariant enforced in user deactivation logic (BRD FR-ADMIN-01).

## Traceability (SDD)

- Every test `describe`/`it` title carries the feature ID(s) it verifies, e.g. `describe('Auth (e2e) [F-27]', ...)`. Feature IDs come from `planning/FEATURES.md`.
- Every build spec in `docs/agentic/build-specs/` cites its `[E-##/F-##]` tags and BRD/SRS requirement IDs.
- Run `bash docs/agentic/trace-check.sh` before closing a task: lists DONE `tasks/*.md` task files' features with no tagged test, and Features with no task (reads each task file's `trace` frontmatter; backlog index is `tasks/INDEX.md`). Report-only; the gatekeeper treats an untagged DONE feature as a finding.
