---
name: deviation-reasoned-but-not-logged
description: Log every deviation from a build spec in DECISIONS.md before the reviewer stage, not only in RUNLOG or code comments.
type: pitfall
---
Between 2026-09-13 and 2026-09-14 the infra task family deviated from its build specs five times with the reasoning recorded only in RUNLOG/code comments, not DECISIONS.md: DEC-082 (RAM budget), DEC-083 (infra/ path flattening), DEC-084 (node:22 base image, prisma moved to dependencies; caught only by hub-gatekeeper), DEC-087 (Dockerfile dev CMD), DEC-088 (JWT_ACCESS_TTL 1d vs spec 15m, explicitly "5th recurrence"). DEC-090 and DEC-092 (2026-10-25) logged their deviations immediately, as the fix.

**Why:** the reasoning feels done once it is in RUNLOG or a comment, but CLAUDE.md's guardrail names DECISIONS.md as the only legitimate place for spec deviations; reviewers audit against it.

**How to apply:** any deviation from a build spec (version pin, base image, dependency move, file-cap breach, TTL value) gets a DECISIONS.md entry BEFORE the reviewer stage, citing the spec line. Planners pre-log known cap/threshold deviations in the spec itself.
