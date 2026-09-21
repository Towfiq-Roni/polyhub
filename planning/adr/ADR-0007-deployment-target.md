# ADR-0007: Deployment / hosting target — self-hosted Docker Compose on Oracle Always Free VM

## Status
Accepted

## Context
BRD §8/NFR-COST-01 sets a hard $0 recurring-infrastructure-cost target, with up to 5 users and no dedicated ops team. DFD §7 models exactly one trust boundary (public internet ↔ application trust zone), implying a single network perimeter rather than a distributed edge/origin split.

## Decision
Deploy the NestJS API (ADR-0002), Next.js frontend (ADR-0001), and PostgreSQL (ADR-0003) as Docker Compose services on a single Oracle Cloud Always Free ARM VM, behind nginx handling TLS.

## Consequences
- Genuinely $0 recurring cost — Oracle's Always Free tier has no time-limited trial expiry, unlike most competitors' "free for 12 months" offers.
- One VM to patch/monitor/back up — matches "no dedicated ops team," but is also a single point of failure with no built-in redundancy; backups (already planned in `deployment-plan.md`) are the primary mitigation, not failover.
- nginx terminates TLS at the one trust-boundary crossing DFD §7 identifies — no additional network segmentation needed since there's only one boundary in the logical model.
- Manual/scripted deploys (GitHub Actions → GHCR → SSH, per `task-breakdown.md` Phase 1) rather than a managed platform's push-to-deploy — more setup work up front, but no recurring platform fee.

## Alternatives considered
- **Managed PaaS (Render/Railway free tier):** less ops burden, but free tiers on these platforms commonly sleep/spin down on inactivity or cap resources more tightly than an Always-Free VM — risks availability during actual daily use by 5 concurrent users.
- **Serverless (Vercel + managed Postgres):** auto-scales, which nothing at this project's actual scale needs, and a managed Postgres add-on almost always exceeds a small free allowance quickly, breaking the $0 constraint.

## Related
NFR-COST-01; DFD §7
