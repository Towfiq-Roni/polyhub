# Gap Audit — Projects & Delivery Module

> **Scope:** `design/projects.html`, `design/project-detail.html`, `design/project-milestones.html`,
> `design/milestone-detail.html`, `design/deliverable-detail.html` — read-only independent audit.
> **Cross-checked against:** `analysis/requirements-analysis.md` (entity model, §6-7 business rules),
> `analysis/requirement-gaps.md`, `analysis/task-breakdown.md`, `CLAUDE.md` Non-Negotiable Rules,
> `docs/designs/claude-design-handoff/screens/{Projects,ProjectDetail,ProjectMilestones,
> MilestoneDetail,DeliverableDetail}.dc.html`, `docs/designs/phase0-redesign-claude-handoff-plan.md`.
> **Already-known items excluded per task brief:** DEC-060/061/062/063 (accounting.html removal,
> payment-entry.html category fix), 5 dead attachment-link rows.
> **Severity scale (per `requirement-gaps.md`):** H = blocks correct build/risks financial rework,
> M = must decide before the phase that touches it, L = safe to default now.

---

## Findings

### PD-1 · Milestone list rows show only work status, omit payment status entirely — **H**
**Screens:** `project-detail.html` (Milestones tab), `project-milestones.html` (cross-project board).

Both screens render each milestone row as a single boolean chip toggle (`Done`/`Pending`,
`data-toggle-milestone`) with no payment-status chip anywhere in the row. This collapses the
work-status machine (M1: `Pending→In Progress→Completed` +optional On Hold/Cancelled) into a binary,
and drops the payment-status axis completely from list context. Only the single-milestone drill-down
(`milestone-detail.html`) shows both statuses (a work-status `<select>` + a `chip-pay` payment chip).

This contradicts P2 ("Two independent state machines per milestone. **UI shows both everywhere**")
and CLAUDE.md Rule 5's spirit — a list view is exactly where a user needs the dual-status pairing
at a glance (e.g. to spot "done but unpaid" milestones), and the dashboard's "awaiting-payment
milestones"/"overdue milestones" operational lists (§9) depend on the same pairing being legible.
Not a duplicate of any logged gap — `requirement-gaps.md` has no entry about list-row status
collapsing.

- **Recommended fix:** replace the single Done/Pending toggle in both list rows with the same
  work-status chip (3-state, from M1) + payment-status `chip-pay` (from M2/M3, incl. derived Overdue)
  pairing already proven out in `milestone-detail.html`; keep the row compact (badges, not selects).

### PD-2 · Milestone payment-status vocabulary doesn't match the adopted M2/F-3 state machine, and introduces an undocumented "Invoiced" field — **M**
**Screen:** `milestone-detail.html`.

`requirements-analysis.md` §7.2 defines the payment-status machine as
`Not Due → Pending → Partially Paid → Paid`, with `Overdue` a **derived** read-time flag (M3), and
DEC-009/F-3 fixes the transition trigger (completion flips `Not Due→Pending`). The script instead:
- Uses a different vocabulary (`Unpaid`/`Partial`/`Paid`/`Overdue`) with no state corresponding to
  `Not Due` — milestone 4 (`UAT & Go-Live`, work `Not Started`, nothing invoiced) is shown identically
  to a milestone that's actually due-but-unpaid (both compute to `Unpaid`), erasing exactly the
  distinction the receivables engine (`Currently Due` vs `Not Yet Due`, §7.4) depends on.
- Has a `chip-pay--overdue` style mapped in `PAYMENT_CHIP` but `paymentStatus()` never returns
  `'Overdue'` — the state is visually defined but unreachable/dead in this mockup, so M3's
  read-time-derived-Overdue rule has no demonstrated screen representation anywhere in the 5 screens
  audited.
- Introduces an `invoiced` amount distinct from `receivable` (`milestone.amount`) with no backing
  field in the Milestone entity (`requirements-analysis.md` §5 lists `amount, paymentDueDate,
  workStatus, paymentStatus` — no `invoicedAmount`). It's display-only (no `<input>`, correctly
  avoids the Rule 2 stored-mutable-balance trap) but represents a state concept (has this become
  due?) that the entity model already captures via `paymentStatus` itself — a redundant, undocumented
  parallel concept likely to confuse Phase 4 implementation of the real state machine.

- **Recommended fix:** rename/remap the chip vocabulary to the spec's actual 4 states (`Not Due`,
  `Pending`, `Partially Paid`, `Paid`) plus a derived `Overdue` computed as
  `(Pending ∨ PartiallyPaid) ∧ paymentDueDate < today` (wire at least one seeded milestone to
  demonstrate it); drop the separate `invoiced` field or explicitly document it as a stand-in for
  "amount currently due" if the team wants to keep it, but log that choice in `DECISIONS.md` first.

### PD-3 · Deliverable status vocabulary conflicts with the documented entity model (and with the handoff's own script) — **M**
**Screens:** `milestone-detail.html` (deliverables checklist), `deliverable-detail.html`.

`requirements-analysis.md` §5 specifies Deliverable status as
`Pending → In Progress → Submitted → Under Review → Approved/Rejected`. The built screens instead
use `Draft → Submitted → Approved / Changes Requested / Rejected` (no `In Progress`, no
`Under Review`, `Draft` substitutes for `Pending`, `Changes Requested` is net-new). For reference,
the original handoff script (`DeliverableDetail.dc.html`) uses yet a **third** vocabulary
(`Not Started/In Progress/Review/Done`) — none of the three sources agree, and no `DECISIONS.md`
entry resolves which is authoritative going into Phase 4. `docs/designs/phase0-redesign-claude-handoff-plan.md`
§5 item 13 only logged the decision to "keep old's approval/payment-record affordances" — it did not
address the underlying status enum mismatch against the entity model.

- **Recommended fix:** pick one 5-state enum and update `requirements-analysis.md` §5 (or the
  screens) to match; recommend keeping the built screens' `Draft/Submitted/Approved/Changes
  Requested/Rejected` (it already has a real reason-required flow wired for the two "send back"
  states) and updating the entity-model doc + M6/P-3 rule text to reference it, since rebuilding the
  screens a third time is more costly than a doc correction — but this is a call for the human/
  business-analyst chain, not a mechanical fix.

### PD-4 · Deliverable `required`/optional flag has no screen representation anywhere — **M**
**Screens:** `milestone-detail.html`, `deliverable-detail.html`.

Rule M6 ("A milestone may be marked Completed when all **required** deliverables are Approved") and
gap P-3's adopted default (`requireAllDeliverables` boolean, "all `required` deliverables Approved")
both depend on a per-deliverable required/optional flag. `requirements-analysis.md` §5 lists
`required flag` as a Deliverable field ("Gates milestone completion when required"). Neither screen
shows this flag: the deliverables checklist in `milestone-detail.html` renders only a status chip +
name + status-select, no Required/Optional badge; `deliverable-detail.html` likewise has no such
field. A reviewer looking at either screen cannot tell which deliverables actually gate completion.

- **Recommended fix:** add a small `Required`/`Optional` chip or label next to each deliverable row
  in both screens.

### PD-5 · Milestone-completion override-with-reason (M6) has zero UI representation — **M**
**Screen:** `milestone-detail.html`.

M6's second clause ("Authorized users may override with a mandatory reason, stored on audit log")
has no mockup affordance: the `Work Status` `<select>` in `milestone-detail.html` is a bare,
unconditional dropdown — no modal/reason-field appears when moving to `Completed`, unlike
`deliverable-detail.html`'s already-built "Reason required" card pattern for its own two gated
status transitions (`Changes Requested`/`Rejected`), which would be the obvious template to reuse.
Related to PD-4 (no required-flag data to gate against in the first place).

- **Recommended fix:** reuse `deliverable-detail.html`'s reason-card pattern: when `Work Status`
  moves to `Completed` show a same-style "Override reason (required if not all required deliverables
  are Approved)" card before committing — purely presentational for the mockup, wired to a real audit
  write in Phase 4.

### PD-6 · No screen representation of milestone `sequence` or reordering — **M**
**Screens:** `project-detail.html` (Milestones tab), `project-milestones.html`, `milestone-detail.html`.

Rule M5 ("Milestones have explicit `sequence`; reorder allowed but sequence stays contiguous") and
`task-breakdown.md` Phase 4 ("Milestones: ordered creation/reorder (contiguous sequence)") both
require a sequence concept. None of the three screens shows a sequence number, ordinal badge, or any
reorder affordance (drag handle, move-up/down buttons) on milestone rows — list order is implicit
DOM order only, with no visual cue it's meaningful or editable. Given Phase 0 is meant to be the
full UI representation of every planned interaction (task-breakdown.md's per-phase-build reliance on
"screens match mockups"), this is a legitimate omission, not a deferred backend-only concern.

- **Recommended fix:** add a sequence number/ordinal to each milestone row + up/down (or drag-handle)
  reorder controls in both the Milestones tab and `project-milestones.html`'s board.

---

## Screens NOT flagged (checked, no new issues)

- `projects.html`: canonical shell intact, no dead hrefs, Assign modal correctly disabled for
  Completed-status rows (M4-consistent — payment status plays no role in the gate, only project
  status), congestion gate holds (5 visible columns).
- Handoff mapping cross-check: all 5 screens' dispositions in
  `docs/designs/phase0-redesign-claude-handoff-plan.md` §1 (`Projects.dc.html`→`projects.html`,
  `ProjectDetail.dc.html`→`project-detail.html` keep-6-tabs, `ProjectMilestones.dc.html`→new screen,
  `MilestoneDetail.dc.html`/`DeliverableDetail.dc.html`→add deliverables/status-select+comments) are
  faithfully reflected; no handoff screen left unbuilt, no unlogged deviation beyond PD-2/PD-3 above.
- No instance found of payment status visually gating/disabling milestone-N+1 work actions (Rule 5/M4
  literal violation) — the gap here is status *invisibility* in list rows (PD-1), not gating.
- No stored-looking Overdue field found (Rule 6) — the opposite problem: Overdue is defined
  (CSS/chip class) but never computed (see PD-2).

## Summary table

| ID | Severity | Screens | One-line |
|---|---|---|---|
| PD-1 | H | project-detail.html, project-milestones.html | List rows drop payment status entirely, collapse work status to a boolean |
| PD-2 | M | milestone-detail.html | Payment-status vocabulary/fields don't match adopted M2/F-3 machine; Overdue never computed |
| PD-3 | M | milestone-detail.html, deliverable-detail.html | Deliverable status enum conflicts with entity model (3-way disagreement incl. handoff) |
| PD-4 | M | milestone-detail.html, deliverable-detail.html | No required/optional flag shown on deliverables |
| PD-5 | M | milestone-detail.html | No override-with-reason UI for milestone completion gate (M6) |
| PD-6 | M | project-detail.html, project-milestones.html, milestone-detail.html | No sequence/reorder affordance on milestones |
