# Design Documents

Design-first artifacts for new requirements and significant changes. **No implementation starts until the design here is validated** (hub-gatekeeper + human approval) and recorded in `docs/memory/DECISIONS.md`.

## Naming
`REQ-<n>-<short-slug>.md` — n = next number after the highest DEC/gap reference it extends. Link the file from the DECISIONS entry that authorizes its build.

## Required sections (template)

```markdown
# REQ-<n>: <Title>

Source: /req "<original request text>" · Status: DRAFT | VALIDATED | SUPERSEDED

## Problem & Goal
What is broken/missing and why now. One paragraph.

## Requirement (verbatim)
The stakeholder request, unedited.

## Design Decisions
Each decision: chosen option · rejected alternatives · one-line rationale.

## Data Model Changes
Entities added/changed (fields, FKs, indexes) vs requirements-analysis §5.

## Dataflow
End-to-end hops: input → validation → permission → service → transaction → writes → derived outputs → response → render.
Every write path listed; undocumented side effects are gate failures later.

## Permissions & Audit
New permission keys (`resource.action`) and which sensitive writes emit audit events.

## UI Affected
Screens/tabs/components touched; layout notes per spec §25–§29 conventions.

## Task Delta
Exact checkboxes to add to analysis/task-breakdown.md (phase + wording).

## Gate Notes
Filled by hub-gatekeeper during design validation: contradictions found, doc amendments required.
```

## Rules
- Append-only history inside a file: supersede sections by adding dated addenda, never rewriting validated content silently.
- A VALIDATED design may only change via a new dated addendum + new DEC entry.
