Bump rule: patch = wording only; minor = new hook/skill/memory category/CLI command; major = `.claude/settings.json` hook wiring changes (everyone must re-review hooks). Version lives in `.claude/VERSION`.

## 0.2.0 — 2026-10-25
- New tool tools/check-dockerfile-stages.py (+ tools/tests/test-check-dockerfile-stages.sh): asserts the last FROM is runtime, prisma generate runs before the build in the build stage, and the runtime CMD runs dist/main.js; CI (#43) reuses it.
- hub-tester: mechanical IMAGE-BUILD gate (single path-trigger list in hub-tester.md; unmodified docker build with no --target + boot check); hub-planner/hub-gatekeeper point to that list instead of duplicating it.
- Why: #2->#48 regression - image build was broken for weeks and the default stage was silently `dev`; host builds and e2e cannot see it (DEC-107/108/109).

## 0.1.0 — 2026-10-25
- New hooks (PreToolUse/SessionStart): block-git-push (marker HUB_PUSH_CONFIRMED=1), protect-paths (.env*, .git/, existing prisma migrations, root TASKS.md), require-task (apps/**+packages/** need the single FOCUSED task - tasks/.focus, set only by task.py start - to be IN_PROGRESS with an existing build spec; escape HUB_SKIP_TASK_GATE=1, user-set, logged), session-start briefing.
- New CLI tools/task.py (show/start/log/done/status/new/index/brief; start sets the one focus, done/status clear it); backlog is now tasks/NNN-slug.md + generated tasks/INDEX.md; TASKS.md is a deprecated pointer.
- New typed memory docs/memory/pitfalls/ (5 seeded pitfalls + INDEX.md).
- hub-tester/hub-implementer: screenshot 1440x900 + 430x932 and READ them for UI tasks.
- Why: 5 recurrences of "reasoned but not logged", accidental-push risk, token cost of the 12 KB monolith, no mechanical task gate.
