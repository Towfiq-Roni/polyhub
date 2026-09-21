# ADR-0006: Async / queueing — none

## Status
Accepted

## Context
DFD §6's flow inventory lists 42 flows, every one synchronous request/response; DFD §8 flags this explicitly as evidence. No FR or feature (F-01 through F-32) implies a background job, scheduled task, email send, or webhook.

## Decision
No message queue or background-job runner in v1. Every operation, including financial postings (F-18-F-22) and report computation (F-25), executes synchronously within the HTTP request that triggered it.

## Consequences
- No additional infrastructure (Redis, a queue broker) to deploy, monitor, or keep within the $0 recurring-cost constraint (NFR-COST-01).
- Every write is immediately consistent from the caller's point of view — no eventual-consistency window to reason about anywhere in the system.
- If a future feature genuinely needs background processing (e.g. a scheduled backup-verification job, already planned at the infra level per `deployment-plan.md`, not the application level), that's an additive decision when the need is concrete, not a speculative one made now.

## Alternatives considered
- **Add a lightweight job queue (BullMQ):** would future-proof for background work, but nothing in the current SRS/Features requires it — adding it now would be speculative infrastructure with no corresponding requirement (violates CLAUDE.md's YAGNI ladder).

## Related
DFD §6, §8; NFR-COST-01
