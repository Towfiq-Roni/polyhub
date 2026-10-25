Bump rule: patch = wording only; minor = new hook/skill/memory category/CLI command; major = `.claude/settings.json` hook wiring changes (everyone must re-review hooks). Version lives in `.claude/VERSION`.

## 0.1.0 — 2026-10-25
- New hooks (PreToolUse/SessionStart): block-git-push (marker HUB_PUSH_CONFIRMED=1), protect-paths (.env*, .git/, existing prisma migrations, root TASKS.md), require-task (apps/**+packages/** need the single FOCUSED task - tasks/.focus, set only by task.py start - to be IN_PROGRESS with an existing build spec; escape HUB_SKIP_TASK_GATE=1, user-set, logged), session-start briefing.
- New CLI tools/task.py (show/start/log/done/status/new/index/brief; start sets the one focus, done/status clear it); backlog is now tasks/NNN-slug.md + generated tasks/INDEX.md; TASKS.md is a deprecated pointer.
- New typed memory docs/memory/pitfalls/ (5 seeded pitfalls + INDEX.md).
- hub-tester/hub-implementer: screenshot 1440x900 + 430x932 and READ them for UI tasks.
- Why: 5 recurrences of "reasoned but not logged", accidental-push risk, token cost of the 12 KB monolith, no mechanical task gate.
