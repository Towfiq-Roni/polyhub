# ADR-0003: Single free-tier VM deployment topology

**Status:** Accepted
**Date:** 2026-08-22
**Source:** DEC-003, DEC-004, DEC-005, DEC-025

## Context

$0 recurring cost is a hard target for a ≤5-user internal tool with monthly
usage bursts. Managed Postgres (Supabase/Firebase/RDS) and a real domain with
CA-issued TLS both carry either recurring cost or registration overhead that
doesn't pay for itself at this scale. The project needed one hosting decision
covering compute, database, public hostname, and how code gets from commit to
running container.

## Decision

- **Compute:** one Oracle Cloud "Always Free" ARM A1 VM (2 OCPU/8GB start),
  reserved IP — not a paid VPS, not serverless.
- **Database:** self-hosted PostgreSQL container via Docker Compose on that
  same VM — not Supabase/Firebase/managed RDS.
- **Public hostname:** `<ip-dashed>.sslip.io` (wildcard DNS-as-a-service,
  no registration) with Let's Encrypt TLS — not a purchased domain up front;
  `is-a.dev` was rejected (ToS forbids commercial use); DigitalPlat US.KG is
  documented as a future upgrade path if a real domain becomes worth it.
- **Pipeline:** GitHub Actions builds multi-arch images → pushes to GHCR →
  SSHes into the VM to pull and restart via Compose. Single-VM reality means
  canary/blue-green/K8s-style rollout strategies are reference-only, not
  applicable; deep health checks (Postgres `SELECT 1`, not just HTTP 200) and
  forward-only migrations are mandatory given there's no orchestrator to fall
  back to.

## Consequences

- Everything (web, api, db, nginx) lives on one machine — a single point of
  failure by design, mitigated by backups to B2 (cron-verified) and a
  keepalive job (Oracle Free Tier reclaims idle instances).
- No horizontal scaling path without a second, larger architectural decision
  later; acceptable given the ≤5-user, monthly-burst usage profile this
  system targets and the $0 constraint that drove every choice here.
- Rollback is "redeploy the previous image tag," not a platform-managed
  instant rollback — `hub-deploy` skill carries the exact runbook.
- Losing the free-tier VM (Oracle policy change, account issue) is an
  unmitigated risk at this budget; accepted explicitly as a cost/risk trade,
  not an oversight.
