# ADR-0007: Allow-only RBAC, permission union over active roles

**Status:** Accepted
**Date:** 2026-08-22
**Source:** requirements-analysis.md §7.5 (rule A2), P5; CLAUDE.md non-negotiable rule 7

## Context

Hub needs granular, auditable access control across CRM, projects, and
finance, for a small team where a person can plausibly hold more than one
organizational role. The spec explicitly separates *organizational role*
(a label, e.g. "Senior Developer") from *permission role* (what a user can
actually do) — requirements-analysis §7.5 rule P5 states teams/org roles are
not project-role-based; access comes only from RBAC permission roles, never
from an org-role field or a project-membership field.

## Decision

- Permissions are **allow-only**: a user's effective permission set is the
  **union** of all permissions granted by every **active** role assigned to
  them. There are no deny rules in v1 (§7.5 rule A2) — a role can only add
  capability, never subtract it from another role the user also holds.
- Permission keys are strings in `resource.action` format (lowercase, e.g.
  `finance.view`, `users.deactivate`), and they live in **exactly one place**:
  `packages/shared`. No module may define its own ad hoc permission string.
- A single global `PermissionsGuard` (NestJS) is the only enforcement point;
  there is no per-controller bespoke authorization logic.

## Consequences

- Adding a permission means adding one key to `packages/shared` and wiring it
  into the relevant guard usage — never inventing a parallel check.
- Because it's allow-only, granting a role is always safe to reason about in
  isolation: it can never reduce what a user could already do. Revoking access
  means removing/deactivating a role assignment, not adding a deny rule.
- Deactivating a role or a user must still satisfy CLAUDE.md rule 9 (≥1
  active SUPER_ADMIN invariant) — the two rules interact at the same
  guard/service layer and must be tested together, not independently.
- Every sensitive write must still emit an AuditLog entry (CLAUDE.md rule 8)
  regardless of which role authorized it — RBAC decides *whether* an action
  is allowed, the audit interceptor records *that it happened*; conflating
  the two into one mechanism was explicitly avoided.
- If a future version needs deny rules or project-scoped permissions, that is
  a new ADR superseding this one — not a quiet exception bolted onto the
  guard.
