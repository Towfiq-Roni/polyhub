# Deployment Plan

> Target: **Oracle Cloud Always Free ARM VM** · single-VM Docker Compose stack · **sslip.io** hostname · Let's Encrypt TLS · zero recurring cost.
> Audience: the developer performing first-time provisioning and later operations.

---

## 0. Topology (recap)

```text
https://<ip-dashed>.sslip.io            ← PWA-installable, only public entrypoint
        │
Oracle VM (Ubuntu 24.04 ARM, reserved public IP)
  └── Docker Compose
      ├── nginx       :80/:443   TLS termination, routes, file streaming
      ├── web                    Next.js PWA
      ├── api                    NestJS + Prisma
      ├── postgres               PG16 (internal network only)
      └── pg-backup (cron)       nightly dumps → rclone → Backblaze B2

GitHub Actions: build/test → GHCR images → SSH deploy; keepalive ping every 3 days
```

---

## 1. Oracle Cloud Provisioning

1. Create account (**credit card required for identity; never charged on Always Free**).
2. ⚠️ Choose **home region carefully — it cannot be changed later**. Prefer a region historically friendly to A1 capacity; if `out of capacity` on A1, fall back to 2× AMD `VM.Standard.E2.1.Micro` (stack fits in 1 GB with swap).
3. Create compartment → VCN (default wizard) → **reserve a public IP** and attach it to the instance.
4. Instance shape: `VM.Standard.A1.Flex` with **2 OCPU / 8–12 GB RAM / 50 GB boot volume** (allowance is 4 OCPU/24GB total — start modest, expand later free).
5. Image: **Ubuntu 24.04 LTS (aarch64)**. Add SSH key at creation.
6. Security List (VCN): allow inbound **22 (SSH), 80, 443 only**.
7. OS hardening:
   ```bash
   apt update && apt upgrade -y
   # SSH: disable password auth & root login (edit /etc/ssh/sshd_config)
   ufw allow OpenSSH && ufw allow 80,443/tcp && ufw enable
   apt install -y unattended-upgrades && dpkg-reconfigure -plow unattended-upgrades
   fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile  # safety margin
   ```

## 2. Install Runtime

```bash
curl -fsSL https://get.docker.com | sh          # Engine + compose plugin
usermod -aG docker $USER                        # re-login after
docker run --rm hello-linux                     # sanity check arch = arm64
```

## 3. DNS via sslip.io (zero registration)

sslip.io serves magic DNS: dashes→dots resolve to your IP.

```text
IP 138.2.55.71  ⇒  https://138-2-55-71.sslip.io
```

1. Verify: `dig +short 138-2-55-71.sslip.io` → `138.2.55.71`.
2. Use this hostname in nginx `server_name`, Certbot, CORS/`NEXT_PUBLIC_API_URL`… actually single-origin: one URL for web+api (`/api` path), so exactly **one hostname everywhere**.
3. If IP ever changes: nothing to re-register — new dashed name just works; update nginx/certbot config.

> Upgrade path documented: any future real domain (Porkbun/Cloudflare ~$1–10/yr) replaces the hostname by editing two files + re-running certbot.

## 4. TLS via Certbot

```bash
apt install -y certbot
systemctl stop nginx || true                      # standalone mode first issue
certbot certonly --standalone -d 138-2-55-71.sslip.io \
  --agree-tos -m you@example.com --no-eff-email
# renewal timer ships with certbot (systemd); add deploy hook:
echo -e '#!/bin/sh\nsystemctl reload nginx' > /etc/letsencrypt/renewal-hooks/deploy/nginx.sh && chmod +x $_
certbot renew --dry-run
```

## 5. Production Compose & Secrets

`/opt/hub/` layout on VM:

```text
/opt/hub/
├── docker-compose.prod.yml     (copied from infra/ by deploy script)
├── .env                        (rendered from GitHub Environment secrets)
└── data/
    ├── pgdata/                 volume-backed Postgres
    ├── resources/              uploaded project/milestone files
    └── backups/                local dump staging before rclone
```

Service contract:

| Service | Image | Notes |
|---|---|---|
| nginx | nginx:alpine + mounted certs | `server_name <host>`; `/` → web:3000; `/api` → api:4000; `location /files/ { internal; alias /data/resources/; }`; client_max_body_size 25m |
| web | ghcr.io/org/hub-web:sha | non-root, HEALTHCHECK |
| api | ghcr.io/org/hub-api:sha | runs `prisma migrate deploy` as separate entry step in deploy script, never on crash-loop restart |
| postgres | postgres:16-alpine | internal net, `POSTGRES_PASSWORD` from .env, tuned shared_buffers=256MB |

`.env` keys (documented in `.env.example`, rendered on VM by deploy): `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_INITIAL_PASSWORD`, `B2_*` (rclone), `APP_HOSTNAME`.

Secrets management: store values as **GitHub Actions Environment secrets** ("production"); deploy workflow writes `.env` over SSH each release (mode 600). Never committed.

First-boot bootstrap: api seed creates SUPER_ADMIN from env, forces password change (gap S-2).

## 6. Deploy Pipeline (runtime view)

```yaml
# deploy.yml core steps (push → main):
#   ci gates → buildx push :${{github.sha}} and :latest (arm64+amd64)
#   appleboy/ssh-action →
ssh vm 'cd /opt/hub &&
        write_env_from_secrets &&
        IMAGE_TAG=<sha> docker compose -f docker-compose.prod.yml pull &&
        docker compose run --rm api npx prisma migrate deploy &&
        IMAGE_TAG=<sha> docker compose up -d &&
        ./scripts/smoke.sh'    # polls /api/v1/health + login-page 200; else rollback tag
```

Rollback: previous sha retained on VM (`deploy.sh` keeps `LAST_TAG`); re-up `-d` with old tag; DB rollbacks are manual-forward-fix only (migrations are forward-only — noted risk accepted at this scale).

## 7. Backups & Restore (non-negotiable)

- Nightly 02:30 host cron:
  ```bash
  docker exec hub-postgres pg_dump -U hub -Fc hub > /opt/hub/data/backups/hub_$(date +%F).dump
  rclone copy /opt/hub/data/backups b2:hub-backups --max-age 48h
  find /opt/hub/data/backups -mtime +30 -delete      # 30 daily local
  ```
- B2 bucket lifecycle: keep 30 daily + 12 monthly (lifecycle rule).
- Also weekly `tar` of `/opt/hub/data/resources` to same bucket (files matter as much as DB).
- **Monthly restore drill**: restore latest dump into throwaway container; verify row counts + open app against it. Log result in repo `docs/drill-log.md`.

### Disaster recovery (VM loss)
1. New Oracle VM (§1) → install Docker (§2) → point sslip.io implicitly at new IP (new hostname).
2. Fresh certbot for new hostname (§4).
3. `compose up` with same images → `pg_restore` latest B2 dump → untar resources → redeploy `.env` via pipeline.
4. RPO ≤ 24 h, RTO ≈ 1 hour. Documented acceptable for this product.

## 8. Anti-Reclaim Keep-Alive (Oracle idle policy)

Oracle may reclaim idle Always Free instances (95th-pct CPU <20% etc. across 7 days). Mitigations (both documented; pick one):

1. **Keep-alive cron** (default, already in CI): `keepalive.yml` hits `/api/v1/health` every 3 days — cheap but *CPU-idle* reclaim technically still possible.
2. **PAYG upgrade** (recommended when convenient): upgrade account to Pay-As-You-Go billing; Always-Free resources remain $0 at these sizes and idle reclaim no longer applies. No card charge expected at this footprint.

Also: monthly backup/restore drill itself generates activity.

## 9. Hardening Checklist (5-user posture)

- [x] Only ports 80/443 public; SSH key-only
- [x] nginx rate-limit zones: `limit_req` on `/api/v1/auth/login` (5 r/min burst 5) and general API (30 r/s)
- [x] Security headers: HSTS, X-Content-Type-Options, X-Frame-Options DENY, Referrer-Policy
- [x] Login lockout (10 fails/15 min) at API level (gap S-1 default)
- [x] argon2id password hashing; JWT secrets ≥32 random chars, distinct access/refresh
- [x] Files strictly behind RBAC + `internal` nginx location (never direct URL)
- [x] unattended-upgrades enabled; Docker images rebuilt weekly by scheduled workflow (base-image CVEs)
- [x] UptimeRobot free monitor → `/api/v1/health` (email alert on down)
- [x] Disk-space cron alert (>80% → email)

## 10. Cost Sheet

| Item | Cost |
|---|---|
| Oracle ARM VM + 200GB block | $0 (Always Free) |
| Reserved public IP | $0 (attached to running instance) |
| sslip.io DNS | $0 |
| Let's Encrypt certificates | $0 |
| GHCR private images (this size) | $0 |
| GitHub Actions minutes (private repo, low usage) | $0 within free tier |
| Backblaze B2 (≤ ~10 GB incl. free tier) | $0 |
| UptimeRobot / healthchecks | $0 |
| **Total recurring** | **$0** |

## 11. Operational Runbook Index

| Scenario | Procedure |
|---|---|
| Release | merge to main → pipeline auto-deploys (§6) |
| Bad release | rollback tag (§6); forward-fix migration if needed |
| App down (uptime alert) | ssh → `docker compose ps` → logs → restart; escalate to DR if host lost (§7) |
| Cert expiry alarm | `certbot renew --dry-run`, check systemd timer |
| Disk pressure | prune `docker system prune -af`, rotate oldest backups, expand boot volume (free allowance) |
| Lost admin access | SUPER_ADMIN reset via seeded recovery command using env secret (S-2) |
