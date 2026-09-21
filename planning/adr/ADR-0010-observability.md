# ADR-0010: Observability — structured logging + health checks + Sentry (free tier)

## Status
Accepted

## Context
NFR-COST-01 sets a $0 recurring-cost constraint; the system runs on a single VM (ADR-0007) with no dedicated ops team, ≤5 users (NFR-SCALE-01). Some real error-tracking value is still wanted — silent production failures in financial posting logic (F-18-F-22) are exactly the kind of bug that must surface quickly, not be discovered by a user weeks later.

## Decision
NestJS's built-in structured (JSON) logger plus a `/health` endpoint (already planned in `task-breakdown.md` Phase 1, checked by the deploy pipeline's smoke test) for baseline observability, plus Sentry on its free tier for error tracking.

## Consequences
- Sentry's free tier (5,000 errors/month, 1 seat, at time of decision) plausibly covers a 5-user internal tool's actual error volume — real error visibility without a recurring cost, as long as usage stays under quota.
- **This is a constraint to actively monitor, not a one-time decision.** If error volume approaches the free-tier cap, that's a decision point (fix the error-generating bug, or accept a paid tier) — not something that should silently lapse into an unexpected charge. Whoever operates hub in production should periodically check Sentry's usage dashboard.
- No distributed tracing infrastructure (OpenTelemetry) — appropriate for a single-process monolith (ADR-0002) with no distributed calls to trace.
- Health checks feed the deployment pipeline's rollback decision (`deployment-pipeline-design` skill) — this ADR doesn't re-decide that, just confirms the same signal serves both purposes.

## Alternatives considered
- **Datadog, free tier:** considered; its free tier is narrower (5 hosts, 1-day log retention) than Sentry's error-count model, a tighter fit risk as hub's screen/feature set grows — Sentry's model matches "catch bugs in financial logic" better than Datadog's infra-monitoring-first free tier.
- **OpenTelemetry tracing:** rejected — a single-process monolith with no distributed calls has nothing worth tracing; the operational complexity has no corresponding payoff at this architecture (same reasoning ADR-0006 applied to async infra).

## Related
NFR-COST-01, NFR-SCALE-01; F-18 through F-22 (where silent failures matter most); `deployment-pipeline-design` skill
