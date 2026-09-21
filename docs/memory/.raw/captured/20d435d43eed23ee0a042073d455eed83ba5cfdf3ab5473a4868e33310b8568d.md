# ADR-0008: Unified Resource table for uploads + deliverable attachments

**Status:** Accepted
**Date:** 2026-08-22
**Source:** DEC-006, DEC-011 (gap D-1)

## Context

The spec introduced project-scoped file uploads (tag chips, milestone-scoped
filtering) alongside deliverable submissions, which are also files attached to
a specific milestone deliverable. Gap D-1 asks directly whether these should
be two separate file systems (a generic "Resources" table plus a
deliverable-specific attachments table) or one unified model.

## Decision

One `Resource` table serves both purposes: a general project-scoped upload
(optionally tagged, optionally linked to a milestone) and a deliverable
attachment are the same underlying record shape, differing only in which
optional foreign keys are populated (`milestoneId`, `deliverableId`).
Downloads are served via X-Accel-Redirect so nginx streams the file bytes
while NestJS still gates the authorization check. Master financial/entity
records archive rather than hard-delete; file bytes+metadata do hard-delete
(and are audited) since D-1's recommended default treats files differently
from ledger-adjacent records (see gap doc's note referencing F-8's
never-delete-transactions rule as the contrast case).

## Consequences

- One permission surface (`resources.*`) and one storage/query code path
  instead of two parallel upload systems that would drift apart over time.
- The Resources tab UI (tag chips + milestone dropdown filter) and the
  deliverable submission flow both read/write the same table — a bug fix or
  a feature (e.g. virus scanning, size limits) written once covers both.
- X-Accel-Redirect means the authorization check (RBAC + resource ownership)
  must happen in the NestJS handler *before* it hands off to nginx — nginx
  itself must never be reachable for `/files` without that handshake; this is
  called out explicitly in the deployment nginx conf design (`hub-deploy`
  skill, ADR-0003's pipeline).
- Because deliverable attachments and general resources share one table, a
  future requirement to treat them differently (e.g. deliverable attachments
  becoming immutable once approved, matching ADR-0006's spirit) would need a
  status/lock field on the shared table, not a fork into two tables.
