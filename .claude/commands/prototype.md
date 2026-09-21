---
description: Explore UI variants before building — divergence picker per the prototype skill. Required before Phase 1 UI work.
argument-hint: "<ui-piece>"
---

Run the prototype workflow from `.claude/skills/prototype/SKILL.md` for: $ARGUMENTS

Rules of engagement for hub:
1. One UI piece per run — restate the brief in one sentence before building.
2. Never touch the mockup surface during exploration — variants live in an isolated surface (`design/prototypes/<slug>/`) sharing `tokens.css`. Note: `design/` was retired 2026-08-31 (DEC-055) — before running this command, confirm with the stakeholder what the current mockup surface is (a rebuilt `design/`, or the reference material at `docs/designs/claude-design-handoff/`).
3. Build 3+ genuinely divergent variants (named axis each), all interactive, real content, no lorem.
4. Render the PICKER.md chrome verbatim; let me flip live and pick a winner.
5. On my pick: promote the winner into the mockup surface, then delete the prototype surface unless I say keep.
6. This command is mandatory before any Phase 1 UI implementation starts.
