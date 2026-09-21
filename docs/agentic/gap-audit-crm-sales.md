# Gap Audit — CRM & Sales Module Screens

**Scope:** `design/clients.html`, `client-detail.html`, `leads.html`, `opportunities.html`,
`opportunity-detail.html`
**Method:** read-only cross-check against `analysis/requirements-analysis.md` (entity model §5,
rules §7), `analysis/requirement-gaps.md`, `analysis/task-breakdown.md` Phase 0/3 AC,
`resources/company_management_system_project_overview.md` §5.2–5.4 (original spec), CLAUDE.md
Non-Negotiable Rules, `docs/memory/DECISIONS.md`, and the 5 matching
`docs/designs/claude-design-handoff/screens/*.dc.html` files via
`docs/designs/phase0-redesign-claude-handoff-plan.md` §1's mapping table.
**Date:** 2026-09-08 · **Author:** hub-analyst (independent audit)

**Already known/fixed — confirmed NOT re-reported:** DEC-060/061/062/063 (accounting.html removal,
payment-entry.html category classifier), 5 dead placeholder attachment-link rows in
client-detail.html (accepted, non-blocking).

---

## Finding 1 — BDS attribution dropped from Opportunity entirely, breaks Lead→Opportunity→Project chain

**Severity: H**
**Screens:** `leads.html`, `opportunities.html`, `opportunity-detail.html`

`requirements-analysis.md` §5 documents `Opportunity.bdsPartnerId?` as a real field, and the
original spec (`resources/.../overview.md` §5.3) lists "BDS Partner (optional)" directly on
Opportunity. Phase 3 AC (`task-breakdown.md` line 79) is explicit: *"full chain Lead(BDS-attributed)
→Opportunity→Won→Project preserves client + BDS link end-to-end (e2e)."*

Checked all three screens directly:
- `leads.html` correctly carries a `bds` field (list column via row-detail `<dt>BDS Partner</dt>`,
  filter dropdown, Add-Lead... actually Add Lead modal has no BDS field either — new leads default
  to `'Unassigned'`, never settable at creation).
- The `Convert to Opportunity` handler (`leads.html` line 381) builds the new opportunity object as
  `{ id, code, client, stage, probability, value, closeDate, owner }` — **`bds` is not copied**.
- `opportunities.html` and `opportunity-detail.html` have **zero BDS field anywhere** — no column,
  no filter, no detail-page field, no Add-Opportunity-modal field. Grepped both files and their
  handoff counterparts (`Opportunities.dc.html`/`OpportunityDetail.dc.html`) for `bds`/`BDS` — the
  only hits are the unrelated sidebar nav link to `bds-partners.html`. This is inherited from the
  original Claude Design handoff, not introduced by the rebuild — but the rebuild plan
  (`phase0-redesign-claude-handoff-plan.md`) never flagged or fixed it, and gap P-2's own
  recommended default explicitly lists "BDS attribution" as one of the fields Opportunity→Project
  conversion must carry forward — impossible if Opportunity never captured it.

**Impact:** the BDS commission/attribution traceability chain (Lead→Opportunity→Project→
BDSCompensation) required by Phase 3 AC and the BDS module (§10.3, gap F-2) is structurally broken
at the Opportunity stage — there is no field to carry forward even in the mockup's local-storage
handoff chain, let alone the real backend.

**Recommended default:** add a `bds` field to the Opportunity object model, list column (or
row-detail), detail-page Overview, and Add-Opportunity modal; carry it forward in the
Lead→Opportunity conversion handler (`leads.html` line 381) and in `opportunity-detail.html`'s
Create-Client/Create-Project handoff object so BDS attribution survives the full chain, matching
the pattern client-detail.html already uses for its own BDS Partner field.

---

## Finding 2 — Opportunity stage vocabulary deviates from spec, undocumented

**Severity: M**
**Screens:** `opportunities.html`, `opportunity-detail.html`

Spec §5.3 and `requirements-analysis.md` §7 (rules table, module overview) both define the
Opportunity stage machine as exactly: `Qualified → Proposal Sent → Negotiation → Won → Lost` (4
active stages + terminal Lost). The built screens (inherited from `Opportunities.dc.html` /
`OpportunityDetail.dc.html`) instead use 6 stages: `Discovery, Qualification, Proposal,
Negotiation, Won, Lost` — an added "Discovery" stage before Qualified, and "Proposal Sent" shortened
to "Proposal". Neither `requirement-gaps.md` nor `DECISIONS.md` logs this as an adopted deviation
(DEC-055 only logs the forward-only-stage-move judgment call, not the stage list itself).

**Recommended default:** either (a) log a DECISIONS.md entry adopting the 6-stage vocabulary as a
deliberate refinement of the spec's "suggested stages" (spec itself says "Suggested stages," so this
is arguably within tolerance), or (b) drop "Discovery" and rename "Proposal"→"Proposal Sent" to
match spec verbatim. Recommend (a) — Discovery as a pre-qualification stage is a reasonable
real-world refinement — but it must be written down since `requirements-analysis.md` currently
documents the 4-stage version as authoritative and no other doc reconciles the difference.

---

## Finding 3 — Documented Lead/Opportunity fields have no screen representation

**Severity: M**
**Screens:** `leads.html`, `opportunities.html`, `opportunity-detail.html`

Cross-checking spec §5.2/§5.3's full field lists against the built screens:
- **Lead.Source** — spec/entity-model field, zero representation anywhere in `leads.html` (list
  columns, row-detail `<dl>`, Add-Lead modal, filters). Source (referral/website/cold-outreach/etc.)
  is a standard CRM lead-quality signal; its total absence means it can never be captured or
  filtered on even at the mockup level.
- **Lead.Assigned User** — spec field, absent from `leads.html` entirely (no column, no
  filter, no modal field). Only BDS Partner (a *different*, optional field) is present.
- **Opportunity.Title** — spec field distinct from Client; `opportunities.html`/
  `opportunity-detail.html` only ever show `client` (company name) and a generated code, never a
  deal title. Two opportunities for the same client would be visually indistinguishable.
- **Opportunity.Notes** — spec field, no textarea/field anywhere on either opportunity screen.

**Recommended default:** either add these fields to the mockups (Source as a select on Add-Lead +
list/filter; Assigned User reusing the same user-picker pattern as Opportunity's "Owner"; Title as
a required text field distinct from Client; Notes as a textarea on the detail page Overview), or, if
intentionally deferred, log each as an explicit scope-trim in `requirement-gaps.md` rather than
leaving them as a silent mismatch against the documented entity model.

---

## Finding 4 — Client.status values don't match the documented enum; Inactive/Archived unreachable

**Severity: M**
**Screens:** `clients.html`, `client-detail.html`

`requirements-analysis.md` §5 and spec §5.1 define `Client.status ∈ {Active, Inactive, Archived}`.
Both screens instead use `{Active, Overdue}` (chip map, status filter, seed data) — inherited
verbatim from `Clients.dc.html`. "Overdue" is not a Client status at all in the entity model; it's a
derived condition (M3: `Overdue` is computed from milestone `paymentDueDate`), and conflating it
with the Client's own lifecycle status means:
1. There is no way in either screen to view, filter, or set a client to `Inactive` or `Archived`.
2. The client list's "Status" column mixes a stored lifecycle field with a computed
   payment-derived signal under one label, which is exactly the kind of stored-vs-derived confusion
   Rule 6 ("Overdue is derived at read time, never stored") warns against for milestones — here it
   leaks into a different entity's status field as a UI-modeling error, not a data-storage one, but
   worth flagging before it hardens into the real schema/API contract.

**Recommended default:** split into two independent, correctly-modeled signals: `Client.status`
chip using the real enum (Active/Inactive/Archived, with Archived clients excluded from the active
list by default per other archived-entity patterns in this codebase), plus a separate
"Payment Overdue" indicator (badge or column) computed from the client's outstanding milestones —
not folded into the same status chip/filter.

---

## Finding 5 — `client-detail.html` silently lost its DEC-050 loading skeletons in the DEC-055 rebuild

**Severity: L**
**Screen:** `client-detail.html`

DEC-050 (2026-08-27) explicitly added loading skeletons to `client-detail.html` ("overview panel
skeletons (2 cards + 3 kpi-mini) + projects table skeletons... All list screens now demonstrate
loading states per REQ-32"). Grepping the current file (and every file in `design/`) for
`skeleton`/`is-loading`/`shimmer` today returns **zero hits outside `dashboard.html`** — the
DEC-055 handoff rebuild (2026-08-31) did not carry this forward, and DEC-055's own "kept from old
design/" enumeration (client-detail's milestone/tag resource filters, etc.) does not mention
skeletons, so this is an unlogged regression rather than a deliberate cut.

**Recommended default:** either re-add the DEC-050 skeleton markup to `client-detail.html`'s
Overview/Projects tabs (low effort, matches the pre-rebuild bar already met once), or log an
explicit DECISIONS.md line accepting the loss so it's not mistaken for oversight during Phase 0
gatekeeping. Not blocking — no other CRM screen ever had skeletons to lose.

---

## Handoff-mapping cross-check result

All 5 screens map cleanly to their `docs/designs/claude-design-handoff/screens/*.dc.html`
counterparts per the plan's §1 table (Clients/ClientDetail/Leads/Opportunities/OpportunityDetail —
no handoff screen in this group is unreflected in `design/`). No canonical-shell violations, no
broken internal `href`s, no undefined chip classes, no bare-number money (all figures use `৳` +
2-decimal formatting via the shared `fmt()` helper) — confirmed by direct grep across all 5 files.
Congestion gate (≤7 primary columns) holds on every table in scope.

## Summary

5 new findings (1 H, 3 M, 1 L). No violations of CLAUDE.md Rules 1–4 (money/ledger) found in this
CRM-only scope — these screens carry no direct money-mutation paths. Findings 1–4 trace to gaps in
how the entity model's documented fields made it into the (externally produced) Claude Design
handoff, carried through unmodified by the Phase 0 rebuild; Finding 5 traces to the rebuild itself.
None of these were already logged in `requirement-gaps.md` or `DECISIONS.md`.
