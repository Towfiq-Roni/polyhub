---
description: Orient a new session — read project memory and propose today's work.
---

Session start procedure for the hub project:

1. Read `docs/memory/PROGRESS.md` (Current Focus + phase checklist) and `docs/memory/DECISIONS.md` tail (last 5 entries).
2. Run `git status` and `git log --oneline -5` to see working state.
3. Report compactly:
   - Current phase + next 1–3 unchecked tasks from `analysis/task-breakdown.md` matching that phase
   - Any `[~]` in-progress items or unresolved blockers
   - Whether working tree is clean
4. Propose which single task to take next (dependency order per task-breakdown §Suggested Sequencing Notes) and ask me to confirm, or wait for `/do <task>`.

Do not implement anything yet.
