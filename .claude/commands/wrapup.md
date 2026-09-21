---
description: Close the session — full verification, memory sync, commit summary.
---

Hub session wrap-up procedure:

1. Run `pnpm lint && pnpm typecheck && pnpm test`. Report results; fix trivial failures (formatting) directly; anything else → propose a follow-up task in PROGRESS.md.
2. Audit memory consistency:
   - Every `[~]` item is either completed (`[x]`) or reverted to `[ ]` with a blocker note
   - Session Log has a row for today
   - Any decision made this session exists as a `DEC-###` line in DECISIONS.md — if missing, append it now with my implicit approval from this conversation
3. Show `git status` + `git diff --stat`; group changes into logical conventional commits and propose exact commit commands (do not run them without my approval).
4. Summarize: what advanced, what's next for next session (first unchecked item), open blockers.
