# ADR-0008: Multi-tenancy model — single-tenant

## Status
Accepted

## Context
BRD §8, ERD §1.4, and DFD §2.1/§8 all independently confirm the same scope: hub serves exactly one company's data, with no concept of multiple organizations sharing the system. This was briefly reconsidered mid-decision (a "multi-tenant-ready" option was picked, then explicitly reversed) — hub is an internal operational tool, not a multi-company SaaS product, and that is not changing.

## Decision
Single-tenant. No `tenant_id` or equivalent discriminator on any entity.

## Consequences
- Every query is simpler — no mandatory tenant-scoping filter to get right on every single query, which is exactly the kind of cross-cutting concern that's easy to forget on one query and create a data leak.
- No tenant-isolation testing burden (there is nothing to isolate).
- If hub's business model ever genuinely changes to serve multiple companies, that requires revisiting this ADR as a real, deliberate pivot (a new ADR superseding this one, with its own BRD-level scope change) — not something this schema is quietly pre-provisioned for today.

## Alternatives considered
- **Multi-tenant-ready (`tenant_id` on every table):** considered and rejected. Speculative future-proofing for a scenario (serving multiple companies) that contradicts BRD's actual, confirmed scope — would add a discriminator column and mandatory filtering logic to every one of ERD's ~26 entities for a requirement that does not exist. Directly against CLAUDE.md's YAGNI ladder ("does this need to exist?").

## Related
BRD §8; ERD §1.4; DFD §2.1, §8
