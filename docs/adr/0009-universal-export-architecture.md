# ADR-0009: Universal list-export architecture (Excel/CSV/PDF)

**Status:** Accepted
**Date:** 2026-08-23
**Source:** DEC-033 (supersedes gap E-5's "CSV only v1" default)

## Context

The original gap-analysis default (E-5) scoped exports down to CSV only for
v1, on cost/complexity grounds. Stakeholder review (REQ-32) expanded this: every
list screen needs an export affordance (Excel/CSV/PDF picker with period
presets), and reports need full multi-sheet Excel workbooks plus a
light-branded PDF option. Building this per-screen would mean N slightly
different export implementations drifting out of sync with their list
screens' filters.

## Decision

A single shared export service, used by every list endpoint's `/export`
route: it takes the *same* zod filter schema the list endpoint already
validates against (so export and on-screen results can never diverge from
different filter logic), and renders to Excel (`exceljs`, streaming — not
loaded fully into memory), CSV (Node stdlib, RFC-4180 compliant), or PDF
(`pdfkit`, light-brand theme) based on a format parameter. Exports are
RBAC-scoped by the same visibility permission keys as the screen itself (an
export can never surface data the viewing role couldn't already see on
screen), and every export is recorded through the audit interceptor
(CLAUDE.md rule 8).

## Consequences

- One export code path instead of per-module bespoke exporters — a bug fix or
  a new format (should one ever be added) lands once.
- Because the same filter schema drives both the screen and its export, a
  reconciliation test (exported totals == on-screen derived values, to the
  poisha) is meaningful and required — `finance-integrity` skill treats this
  as an extension check, and Phase 8's task list requires it before close.
- Streaming Excel generation is mandatory (not "load all rows, then build the
  workbook") to keep memory bounded on the free-tier VM's RAM budget
  (ADR-0003) even for a full unfiltered export.
- This formally supersedes gap E-5's CSV-only default — logged here and in
  `DECISIONS.md` (DEC-033) per CLAUDE.md's rule that spec deviations must be
  logged, not silently expanded in scope.
