---
description: Orient a new session — read project memory and propose today's work.
---

Session start procedure for the hub project:

1. The session-start hook already printed Focus/Next; use `python3 tools/task.py brief` or read `tasks/INDEX.md` (never a monolithic backlog) alongside `docs/memory/PROGRESS.md` (Current Focus + phase checklist) and `docs/memory/DECISIONS.md` tail (last 5 entries).
2. Run `git status` and `git log --oneline -5` to see working state.
3. Report compactly:
   - Current phase + next 1–3 tasks = Focus + Next from `python3 tools/task.py brief` (priority-ordered)
   - Any `wip`/IN_PROGRESS items or unresolved blockers
   - Whether working tree is clean
4. Propose which single task to take next (take brief's top Next; check `deps` in `tasks/INDEX.md`) and ask me to confirm, or wait for `/do <task>`.

Do not implement anything yet.
