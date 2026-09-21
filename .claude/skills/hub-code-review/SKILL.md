---
name: hub-code-review
description: "Review changes along two axes: Standards (does the code follow this repo's documented standards?) and Spec (does it match the originating task/design?). Runs both axes as separate passes so they don't mask each other. Use when reviewing a task's diff before final gating. Adapted from mattpocock/skills code-review."
license: MIT
---

> Adapted from [mattpocock/skills](https://github.com/mattpocock/skills) `skills/engineering/code-review/SKILL.md` (MIT). Hub mapping replaces its issue-tracker/spec discovery; smell baseline kept verbatim.

Two-axis review of the diff for one task:

- **Standards**: does the code conform to this repo's documented standards?
- **Spec**: does the code faithfully implement the originating task/design?

Run the two axes as **separate internal passes** (never blend findings), then report them side by side. A change can pass one axis and fail the other — reporting separately stops one axis from masking the other.

## Hub mapping

| Upstream concept | Hub source |
|---|---|
| Fixed point | Task start = diff of working tree, or `git diff <base>...HEAD` when given a range. Confirm ref resolves and diff non-empty first |
| Spec source | 1) The task text + ACs in `analysis/task-breakdown.md` · 2) linked `docs/designs/REQ-*.md` if any · 3) relevant section of `analysis/requirements-analysis.md`. Never invent requirements not written there |
| Standards sources | `CLAUDE.md` (non-negotiables, Minimal Code Discipline) · loaded domain skills (`hub-ledger`, `hub-codebase`, `nextjs-developer`, `nestjs-best-practices`) · development-plan §4–§5 conventions |
| Issue tracker refs | Not used — our memory protocol replaces it |

## Process

### 1. Pin the fixed point
Capture `git diff <base>...HEAD` (or working-tree diff) once plus `git log --oneline`. Verify non-empty.

### 2. Gather spec & standards sources (per table above)

### 3. Standards pass — with the smell baseline

Repo-documented standards always win. On top of them applies this **fixed smell baseline** (Fowler, _Refactoring_ ch.3). Each smell is a labelled judgement call ("possible Feature Envy"), never a hard violation; skip anything tooling already enforces:

- **Mysterious Name**: name doesn't reveal what it does/holds → rename; no honest name = murky design.
- **Duplicated Code**: same logic shape in more than one hunk/file → extract shared shape.
- **Feature Envy**: method reaches into another object's data more than its own → move it onto the data.
- **Data Clumps**: same few fields/params keep travelling together → bundle into a type.
- **Primitive Obsession**: primitive standing in for a domain concept → small dedicated type (e.g., raw number for money instead of poisha helpers).
- **Repeated Switches**: same switch/if-cascade on same type recurs → polymorphism or one shared map.
- **Shotgun Surgery**: one logical change scattered across many files → gather into one module.
- **Divergent Change**: one module edited for unrelated reasons → split by reason.
- **Speculative Generality**: abstraction/params/hooks for needs the spec lacks → delete; inline until real need appears.
- **Message Chains**: long `a.b().c().d()` navigation → hide behind one method.
- **Middle Man**: mostly delegates onward → cut it, call target direct.
- **Refused Bequest**: subclass ignores most of what it inherits → composition over inheritance.

Report per file/hunk: (a) documented-standard breaches — cite standard file + rule, these can be hard violations; (b) baseline smells — name + quote hunk, always judgement calls. Under ~400 words.

**Hub note:** ponytail discipline makes *Speculative Generality* findings frequent allies — unrequested abstractions get deleted, but AC-mandated structure (e.g., e2e atomicity tests) is never flagged as generality.

### 4. Spec pass

Report: (a) requirements the task/design asked for that are missing or partial; (b) behaviour in the diff nobody asked for (scope creep); (c) requirements that look implemented but where implementation looks wrong. Quote the spec/AC line per finding. Under ~400 words.

### 5. Aggregate

Present under `## Standards` and `## Spec` headings without merging or reranking. End with per-axis finding counts and the worst issue *within each axis*. Never pick a single cross-axis winner.

---

# Hub Adaptation

1. This skill is executed by the **hub-code-reviewer agent** inside `/do` — positioned AFTER `hub-tester` passes, BEFORE `hub-gatekeeper`.
2. The reviewer **cannot edit files**. Its findings become **derived tasks** routed to `hub-implementer` (code fixes/refactors) and/or `hub-tester` (missing test coverage) — phrased as imperative one-line tasks naming file:line and the axis finding.
3. Judgement-call smells do not block completion by themselves; hard standard violations and spec gaps do. The report must classify each finding BLOCKER (hard violation / missing requirement) vs SUGGESTION (judgement call).
4. If both axes are clean: output exactly `REVIEW CLEAN` + the two summary lines — gatekeeper runs next regardless.
