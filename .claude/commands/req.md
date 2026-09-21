---
description: Intake a new requirement — business analysis → technical analysis → design → architecture review → validation, then tasks.
argument-hint: "<requirement/change request>"
---

New requirement/change request: $ARGUMENTS

Hub change-management procedure (mandatory order):

1. **Business analysis** — send the verbatim request to `hub-business-analyst`. Present its brief (problem, objectives, user stories + ACs, scope lines, principle check) to me. Iterate until I confirm the BUSINESS intent. No technical work before this.
2. **Technical analysis** — send the approved brief to `hub-analyst` for classification, impact trace across entities/endpoints/screens/permissions/phases, finance-safety check, and draft artifacts (gap entry, DEC line, task delta).
3. **Design draft** — from the chosen option, author `docs/designs/REQ-<n>-<slug>.md` per `docs/designs/README.md` template: problem, verbatim requirement + link to business brief, design decisions with rejected alternatives, data-model changes, full dataflow hops, permissions & audit, UI affected, task delta. Status: DRAFT.
4. **Architecture review** — spawn `hub-solution-architect` on the DRAFT.
   - REVISE → apply its numbered amendments (analyst edits the doc), re-review. Max 2 cycles, then escalate to me.
   - APPROVED → record its BLUEPRINT NOTE in the doc.
5. **Design validation** — spawn `hub-gatekeeper` on the DESIGN ONLY: coherence vs requirements-analysis rules, ledger invariants, internal completeness of documented dataflow.
   - REROUTE-design → back to step 3 with findings. PASS → present everything for my final approval.
6. **Authorize** — status VALIDATED; append `DEC-###` to DECISIONS.md linking the design file.
7. **Apply** — only now: gap entry appended to `analysis/requirement-gaps.md` · Task Delta checkboxes inserted into `analysis/task-breakdown.md` · PROGRESS.md focus updated if needed.
8. **Summarize** changes and affected upcoming tasks. Implementation happens later via `/do`, never inside `/req`.

Hard rule: no task derived from this requirement may be marked `[~]` or implemented before steps 4–6 are complete. Mid-build reroutes here are the system working, not a failure.
