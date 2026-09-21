---
name: hub-deploy
description: Use ONLY when changing infra/, Dockerfiles, nginx configs, docker-compose files, GitHub Actions workflows, deployment scripts, TLS/backup setup, or anything about the Oracle VM. Contains the free-VM constraints, rollback procedure, and secrets rules that keep the $0 stack safe.
---

# Hub Deploy & Infra Rules

## The $0 constraints (never break these)
- Total steady-state RAM budget: **<500MB** across containers. No dependency may push this.
- Images must build multi-arch: `linux/arm64` primary (Oracle A1), amd64 fallback (AMD micro escape hatch).
- No paid services, no external managed dependencies beyond Backblaze B2 backup storage.
- Only nginx exposes ports (80/443). Postgres stays on the internal compose network.

## File ownership
| Change | Location |
|---|---|
| Compose topology | `infra/docker-compose.prod.yml` (+ `.dev.yml` local) |
| Routing/TLS/file streaming | `infra/nginx/nginx.conf` — `/files/` must stay `internal;` |
| Pipelines | `.github/workflows/{ci,deploy,keepalive}.yml` |
| Release logic | `infra/scripts/deploy.sh` |

## Non-negotiable practices
- Secrets ONLY via GitHub Environment secrets rendered to VM `.env` at deploy time. Never in repo, never in images, never echoed in workflow logs.
- Migrations run as an explicit deploy step (`prisma migrate deploy`) between pull and up — never on container boot. Forward-only; no down migrations.
- Every deploy ends with smoke check (`/api/v1/health` + login 200); on failure auto-rollback to previous image tag (`LAST_TAG`).
- Keepalive cron (`keepalive.yml`, every 3d) exists to counter Oracle idle-reclaim — don't remove it.
- Backup cron + B2 sync must survive any compose refactor: nightly `pg_dump -Fc` → rclone, 30-day local retention.
- Base images rebuilt weekly by scheduled workflow for CVE patching.

## Reference
Full runbook incl. provisioning steps, certbot, DR restore, hardening checklist:
`analysis/deployment-plan.md`
