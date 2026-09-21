# Build Spec — TASKS.md #41 (reopened, DEC-086): Dev Compose Full Containerized Parity (api + nginx + postgres)

Date: 2026-09-14 · Planner: hub-planner · Skills loaded: `hub-deploy`, `nestjs-best-practices` (dev hot-reload stage) · Authoritative sources read: `docs/memory/DECISIONS.md` DEC-086 (stakeholder directive, full text), `docs/agentic/build-specs/2026-09-13-infra-dev-prod.md` (original #41/#42 spec — ground truth for existing shape), `.claude/skills/hub-deploy/SKILL.md`, live repo state: `apps/api/Dockerfile`, `infra/docker-compose.{yml,dev.yml,prod.yml}`, `infra/nginx/default.conf.template`, `Makefile`, `infra/.env.{dev,prod}.example`, `.gitignore`, `.dockerignore`, `apps/api/package.json`, `apps/api/src/config/env.validation.ts`, `pnpm-workspace.yaml`, `packages/shared/package.json`, `tsconfig.base.json`, and RUNLOG.md's account of the original build's four bug-fix cycles (argon2/Node-version pin, prisma-CLI-at-runtime, nginx networking, env_file path convention) — none of that history is touched by this task, but it explains why `apps/api/Dockerfile`'s `base` stage is pinned to `node:22-alpine` and why `deps`/`build`/`runtime` look the way they do; this spec must not regress any of it.

Not finance-touching — `accountant-expert`/`hub-ledger` not loaded, correctly.

## 1. Objective

Dev's current shape (`postgres`-only in Compose, `api` run on host via `pnpm dev`, no nginx, no TLS in dev at all) doesn't match prod's topology. Per DEC-086's stakeholder directive ("Everything should follow the same architecture. So, for dev it should also run nginx" — full containerize chosen over an HTTP-only/host-run-api alternative), dev compose gains a containerized `api` (hot-reload via bind mount, same Dockerfile, new `dev` build target) and `nginx` (same unmodified template as prod, self-signed auto-generated dev cert swapped in for real Let's Encrypt certs), so `make dev-up` now brings up the same three-service topology as prod, locally, with zero new nginx config and zero behavioral change to any existing `apps/api` source.

## 2. Ground truth this spec relies on

- DEC-086 (verbatim reasoning): dev reopened with expanded scope — `apps/api/Dockerfile` gains a `dev` stage (hot-reload, `nest start --watch`, bind-mounted source); `infra/docker-compose.dev.yml` gains `api` (`DATABASE_URL` now targets the `postgres` **service name**, not `localhost` — but only inside `infra/.env.dev`, the file the *containerized* api reads; `apps/api/.env`, read by host-run `pnpm dev`/`test:e2e`, is untouched and keeps `localhost`, both workflows coexist) and `nginx` (same template, self-signed dev cert); `infra/.env.dev.example` needs the full app env set, not just Postgres creds.
- Existing `apps/api/Dockerfile` stages, verified by direct read, must not be touched except by *appending* a new stage: `base` (`node:22-alpine`, pinned for a documented, hard-won reason — argon2 segfaults under Node 20.x, see RUNLOG 2026-09-14T00:32) → `deps` (full `pnpm install`, i.e. **including devDependencies**, so `@nestjs/cli` — needed for `nest start --watch` — is already present here, no extra install step needed for the new `dev` stage) → `build` → `runtime`.
- `apps/api/package.json` confirms `"start:dev": "nest start --watch"` already exists (no new script needed) and no `nest-cli.json` file exists in the repo — Nest CLI's built-in defaults (`sourceRoot: src`, entry `main`) apply, matching the actual `apps/api/src/main.ts` layout, so `nest start --watch` works unmodified from `apps/api`'s own directory with no new CLI config file.
- `packages/shared`'s `main` field points at `dist/index.js` (not `src`) — `@hub/shared` must already be built for `apps/api` to import it at all, dev or prod. `packages/shared/dist` already exists on the host (verified by direct `ls`). This is a pre-existing condition of the whole monorepo (even today's host-run `pnpm dev` has no live-rebuild path for `packages/shared`, since `packages/shared/package.json` has no `"dev"` script) — **not a regression this task introduces or is scoped to fix**. Hot-reload in scope here is `apps/api/src` only, matching what host-run `pnpm dev` already delivers today.
- `pnpm-workspace.yaml` + direct inspection confirm pnpm workspaces produce **real directories** (not just symlinks) at `node_modules/`, `apps/api/node_modules/`, and `packages/shared/node_modules/` — each holds its own symlinks into the shared `.pnpm` store. A whole-repo bind mount at runtime will, for any subpath the host doesn't have populated (or has populated with host-arch/platform binaries, e.g. argon2's native addon built for a non-Linux or non-musl host), silently replace or corrupt the image's own known-good `pnpm install` output unless each of those three `node_modules` paths is shadowed by its own named volume mounted **on top of** the whole-repo bind mount. This is the standard, simpler of the two options the task posed (vs. mounting only `apps/api/src` + `packages/shared/src` + config files individually) — chosen because Nest's config-file-less setup and `@hub/shared`'s `dist`-only resolution make the narrower mount fragile (would also need to individually enumerate `tsconfig.json`/`tsconfig.build.json`(absent)/`package.json`/`packages/shared/dist`, with no single source of truth for "did I mount everything nest needs").
- `infra/docker-compose.prod.yml`'s existing `api`/`nginx` service shapes (build context `.`, no `ports:` on `api`, explicit `networks: [hub-net]` on every service, `nginx` mounts the template + `/etc/letsencrypt` + `resources_data`, `environment: {APP_HOSTNAME: ${APP_HOSTNAME}}`) are the pattern to mirror — reusing the identical `infra/nginx/default.conf.template` unmodified is load-bearing (DEC-086 + task framing both say "no code duplication").
- `infra/docker-compose.yml` (base) already declares top-level `networks: {hub-net: {driver: bridge}}` and `postgres` with a `pg_isready` healthcheck — nothing here needs to change; `api`/`nginx` in the dev overlay attach to the same pre-existing `hub-net`.
- `apps/api/src/config/env.validation.ts` is the exact required-env contract the containerized dev `api` must satisfy: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `WEB_ORIGIN` have no defaults (missing = boot throw); `JWT_ACCESS_TTL`(default `1d`), `JWT_REFRESH_TTL`(default `7d`), `LOCKOUT_MAX_ATTEMPTS`(default `10`), `LOCKOUT_WINDOW_MINUTES`(default `15`), `COOKIE_SECURE`(default `false`), `PORT`(default `4000`) have defaults but CLAUDE.md's fixed design (access 15m/refresh 7d) should be set explicitly in the dev env rather than relying on the code's stale `1d` default — flag, don't silently "fix" the code default (out of scope; note only).
- `.gitignore` already ignores `infra/.env.dev`/`infra/.env.prod`/`infra/.env` (rendered files) — needs one more addition for the new generated dev cert directory.
- Nothing in `infra/docker-compose.prod.yml`, `infra/scripts/deploy.sh`, `infra/docker-compose.yml` (base), or the `deps`/`build`/`runtime` stages of `apps/api/Dockerfile` is in scope — explicit non-goal per the task framing, verified by re-reading all of them first so "don't touch" is enforced from direct knowledge, not assumption.

## 3. Design decisions this spec locks in

1. **Hot-reload mount strategy: whole-repo bind mount + three shadow volumes for `node_modules`.** `infra/docker-compose.dev.yml`'s `api` service mounts `.:/repo` (host repo root → container `/repo`, matching the Dockerfile's `WORKDIR /repo` build context convention) plus three named volumes stacked on top: `api_node_modules_root:/repo/node_modules`, `api_node_modules_app:/repo/apps/api/node_modules`, `shared_node_modules:/repo/packages/shared/node_modules`. These volumes are empty-then-auto-populated by Docker from the image's own `deps`-stage content the first time each is created (standard Docker volume behavior: a named volume mounted over a path that has content in the image gets seeded from that image content on first use) — so the container always runs on its own known-good `pnpm install`, never a host-platform-mismatched one, regardless of whether the host has run `pnpm install` itself. List the bind mount before the shadow volumes in the YAML (conventional ordering, not load-bearing but keeps intent readable).
2. **New `dev` stage branches from `deps`, not `runtime`.** `deps` already ran a full (non-`--prod`) `pnpm install`, so `@nestjs/cli` (a devDependency, required for `nest start --watch`) is already present — zero extra install commands needed. The stage does `WORKDIR /repo/apps/api` + `CMD ["pnpm", "start:dev"]` and nothing else structurally new; it deliberately has **no `COPY . .`** (source arrives only via the runtime bind mount in #1, never baked into the dev image — that's what makes hot-reload work without a rebuild).
3. **Dev stage stays root (no `USER node`).** Prod's `runtime` stage sets `USER node` for real deployment hardening (S7 gate in the original spec) — that requirement is about production images shipped to the VM, not local dev-only containers. Forcing `USER node` here risks bind-mount permission friction against arbitrary host UIDs with no compensating security benefit (this image is never pushed/deployed). Deliberate, documented relaxation — `ponytail: dev container runs as root, local-machine-only, no image ever leaves the dev host → if this ever needs to run multi-tenant or shared, revisit`.
4. **Dev overlay does not add `mem_limit:` or `restart:` to any service.** Prod's `mem_limit`/`restart: unless-stopped` values encode the Oracle VM's real steady-state RAM ceiling and always-on requirement (hub-deploy skill, deployment-plan.md §5) — a developer's own machine has neither constraint, and dev containers are expected to be manually stopped/started, not auto-restarted. This mirrors the *existing* dev `postgres` service, which already has neither key. Not a violation of hub-deploy's RAM guidance — that guidance targets the deployed VM; this spec still reports total dev-container RSS at empirical-gate time for visibility (E9, informational, non-blocking).
5. **Self-signed dev cert lives at `infra/certs/dev/live/localhost/{fullchain,privkey}.pem`, gitignored, generated by a new idempotent `Makefile` file-target.** Chosen over a shell script (no new file needed — `openssl req` is already the right one-line stdlib-equivalent tool, per the Karpathy YAGNI ladder) and over a manual "developer runs openssl by hand" instruction (task explicitly forbids that). The path shape (`live/<hostname>/...`) deliberately mirrors Let's Encrypt's own on-disk layout so the **same unmodified nginx template**'s `ssl_certificate /etc/letsencrypt/live/${APP_HOSTNAME}/fullchain.pem;` line resolves correctly in both prod (real certbot output) and dev (this generated stand-in) — this is what makes reusing the template verbatim possible. `APP_HOSTNAME` is hardcoded to the literal `localhost` directly in `docker-compose.dev.yml`'s `nginx` service `environment:` block (not plumbed through `infra/.env.dev`) — it is a fixed dev-only value, no reason to make it configurable (YAGNI).
6. **Idempotency mechanism: Make's own file-existence rule, not a hand-rolled `[ -f ... ] ||` guard.** `infra/certs/dev/live/localhost/fullchain.pem:` is declared as a real Make target (not `.PHONY`) whose recipe runs `mkdir -p $(dir $@)` then a single `openssl req -x509 -nodes -newkey rsa:2048 -days 825 -keyout .../privkey.pem -out .../fullchain.pem -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost"`. Make only re-runs a file-target's recipe if the file is missing or older than a declared prerequisite; this target has no prerequisites, so once the file exists Make treats it as up to date forever — genuinely idempotent by construction, zero extra shell logic. `dev-cert` is a thin `.PHONY` alias depending on that file target (so `make dev-cert` reads naturally); `dev-up` gains `dev-cert` as a prerequisite so the cert auto-generates on first `make dev-up` with no separate manual step.
7. **Dev nginx publishes both `8080:80` and `8443:443`** (not just 443) — mirrors prod's own two-port shape (`80` redirects to `443`) for genuine architectural parity per DEC-086's literal "everything should follow the same architecture," and lets the empirical gates prove the redirect block (currently untestable in prod without a real VM) actually works, locally, for the first time. Ports chosen to avoid collision with common local-dev defaults (3000/4000/5432/8000/8001 etc. all avoided).
8. **`resources_data_dev` named volume added**, mounted read-write on `api` and read-only on `nginx` at `/data/resources`, mirroring prod's `resources_data` exactly. No upload feature exists yet (same as prod's original forward-wiring rationale, spec 2026-09-13 §3.5) — this only prevents the reused, unmodified `/files/` `location` block from pointing at a nonexistent path inside the dev nginx container; it adds no new application behavior.
9. **`infra/.env.dev.example` additions use the same "one allowed non-blank example file" precedent** the original spec set for Postgres creds — dev JWT/lockout/super-admin values are real (throwaway, local-only, never internet-reachable) strings, not blanks, because a developer must be able to `cp` and go without inventing secrets themselves. `DATABASE_URL` here targets `postgres` (the Compose service name) — this is a **new, second** `DATABASE_URL`-shaped value distinct from `apps/api/.env`'s existing `localhost`-targeted one; both files keep coexisting for their respective consumers (containerized api vs. host-run `pnpm dev`/`test:e2e`).

## 4. Batches (build in this order; ≤3 files each)

### Batch A — `apps/api/Dockerfile` dev stage (1 file, edit — additive only)

1. **`apps/api/Dockerfile`** — append a new stage **after** the existing `runtime` stage (do not insert it earlier in the file; do not reorder or edit any existing line):
   ```dockerfile
   FROM deps AS dev
   WORKDIR /repo/apps/api
   HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
     CMD wget -q -O- http://localhost:${PORT:-4000}/api/v1/health || exit 1
   CMD ["pnpm", "start:dev"]
   ```
   No `USER`, no `COPY . .`, no `ENV NODE_ENV` (leave Node's own default `development` behavior — Nest's `--watch` mode expects it). Verify with `git diff apps/api/Dockerfile` showing only appended lines, zero changed lines above the diff hunk.

### Batch B — Dev compose services + cert ignore + full dev env (3 files: 1 edit, 1 edit, 1 edit)

1. **`infra/docker-compose.dev.yml`** (edit) — add two new top-level services and extend `volumes:`:
   ```yaml
   services:
     postgres:
       # (unchanged — existing ports/volumes block stays exactly as-is)

     api:
       build:
         context: .
         dockerfile: apps/api/Dockerfile
         target: dev
       env_file: infra/.env.dev
       depends_on:
         postgres:
           condition: service_healthy
       networks:
         - hub-net
       volumes:
         - .:/repo
         - api_node_modules_root:/repo/node_modules
         - api_node_modules_app:/repo/apps/api/node_modules
         - shared_node_modules:/repo/packages/shared/node_modules
         - resources_data_dev:/data/resources

     nginx:
       image: nginx:1.27-alpine
       depends_on:
         - api
       environment:
         APP_HOSTNAME: localhost
       ports:
         - "8080:80"
         - "8443:443"
       networks:
         - hub-net
       volumes:
         - ./infra/nginx/default.conf.template:/etc/nginx/templates/default.conf.template:ro
         - ./infra/certs/dev:/etc/letsencrypt:ro
         - resources_data_dev:/data/resources:ro

   volumes:
     pgdata_dev:
     resources_data_dev:
     api_node_modules_root:
     api_node_modules_app:
     shared_node_modules:
   ```
   No `ports:` on `api` (nginx fronts it, matches prod exactly), no `mem_limit:`/`restart:` on either new service (Design Decision #4). Do **not** touch the existing `postgres` service block.
2. **`.gitignore`** (edit) — under the existing `# secrets & env` section, add `infra/certs/dev/` directly below the existing `infra/.env*` lines (generated cert material, never committed — same category as the rendered env files it sits next to).
3. **`infra/.env.dev.example`** (edit) — keep the existing Postgres section verbatim; append a new section:
   ```
   # Containerized dev api (infra/docker-compose.dev.yml's `api` service reads
   # this via env_file — NOT the same file as apps/api/.env, which host-run
   # `pnpm dev`/`test:e2e` reads and keeps pointed at localhost). Throwaway
   # local-only values, same precedent as the Postgres block above.
   DATABASE_URL=postgresql://hub:hub_dev_local_only@postgres:5432/hub_dev
   JWT_ACCESS_SECRET=dev_access_secret_change_me
   JWT_ACCESS_TTL=15m
   JWT_REFRESH_SECRET=dev_refresh_secret_change_me
   JWT_REFRESH_TTL=7d
   LOCKOUT_MAX_ATTEMPTS=10
   LOCKOUT_WINDOW_MINUTES=15
   SUPER_ADMIN_EMAIL=admin@hub.dev
   SUPER_ADMIN_PASSWORD=dev_super_admin_password_change_me
   COOKIE_SECURE=false
   PORT=4000
   WEB_ORIGIN=https://localhost:8443
   ```
   Note `DATABASE_URL` here targets `postgres` (the Compose service DNS name), deliberately different from `apps/api/.env`'s `localhost`-targeted value — both are correct for their respective consumer.
   **Superseded (DEC-088)**: the `JWT_ACCESS_TTL=15m` line above (and this section's earlier ground-truth note at §2 calling `1d` "stale") was itself working from a stale value — `1d` is the actually-correct, already-decided convention (DEC-073/ADR-0012, supersedes DEC-012's original 15m) and is what `infra/.env.dev.example` correctly ships. Use `JWT_ACCESS_TTL=1d`.

### Batch C — Makefile cert target + dev-up wiring (1 file, edit)

1. **`Makefile`** (edit):
   - Add a file-target rule (Design Decision #6):
     ```makefile
     infra/certs/dev/live/localhost/fullchain.pem:
     	mkdir -p $(dir $@)
     	openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
     	  -keyout infra/certs/dev/live/localhost/privkey.pem \
     	  -out $@ \
     	  -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost"
     ```
   - Add `dev-cert: infra/certs/dev/live/localhost/fullchain.pem` (`.PHONY`).
   - Change `dev-up:` to `dev-up: dev-cert` (prerequisite, so cert auto-generates on first run, never regenerates after) and update its echo line to also mention the new nginx URL, e.g. `@echo "web: https://localhost:8443  (self-signed dev cert — browser will warn, that's expected)"`, keeping the existing `apps/api/.env` reminder line for the still-valid host-run workflow.
   - Extend the `.PHONY:` line to include `dev-cert`.
   - Leave `dev-down`/`dev-logs`/`dev-psql` untouched — `dev-logs` already tails all services (no service name argument, `$(COMPOSE_DEV) logs -f`), `dev-psql` is unaffected by the new services (still targets `postgres` directly).
   - **Superseded during verification (DEC-087's sibling fix, not itself a DECISIONS-worthy deviation — pure tooling correctness):** `dev-up`'s compose invocation gained `--build` (`$(COMPOSE_DEV) up -d --build`) after Batch C's own verification found `docker compose up -d` alone silently reuses a stale cached `api` image on Dockerfile changes. Cheap no-op via layer caching when nothing changed.

## 5. Regression surface

- `apps/api/Dockerfile`'s `base`/`deps`/`build`/`runtime` stages: zero line changes — `git diff` must show a pure append. Any diff above the new `FROM deps AS dev` line is out of scope and must be reverted.
- `infra/docker-compose.prod.yml`, `infra/scripts/deploy.sh`, `infra/docker-compose.yml` (base), `infra/nginx/default.conf.template`: zero diff, verified via `git diff --stat` showing these paths absent from the changeset entirely.
- `apps/api/.env` (host dev env, gitignored/local): untouched — still points `DATABASE_URL` at `localhost`, still drives `pnpm --filter api test:e2e`.
- `Makefile`'s existing `dev-down`/`dev-logs`/`dev-psql`/`prod-*`/`migrate`/`smoke` targets and `COMPOSE_DEV`/`COMPOSE_PROD` variables: unchanged in behavior — only `dev-up`'s prerequisite line and echo text change, plus new additive `dev-cert`/file-target rules.
- `pnpm typecheck && pnpm test && pnpm --filter api test:e2e` must still show 54 unit / 31 e2e passing (DEC-080/RUNLOG 2026-09-14T00:32 baseline) — nothing in this spec touches `apps/api/src/**` or `apps/api/prisma/**`.
- Original spec's E1/E5 empirical gates (`docker compose ... config --services` service lists) are **superseded** by this spec's E1/E-equivalent below — the dev service list grows from `postgres` alone to `api, nginx, postgres`; this is the intended, DEC-086-mandated change, not a regression.
- **S5 below is superseded (DEC-087)**: verification found the `dev` stage's plain `CMD ["pnpm", "start:dev"]` never generated a Prisma client (only `build` does, which `dev` doesn't inherit) — fixed to `CMD ["sh", "-c", "pnpm exec prisma generate && pnpm start:dev"]`. The correct current gate is: `grep -n 'CMD \["sh", "-c", "pnpm exec prisma generate && pnpm start:dev"\]' apps/api/Dockerfile` → present, positioned after `FROM deps AS dev`.

## 6. Definition of Done gates

### Static gates (hub-reviewer — exact grep/pattern)

- **S1 (Dockerfile append-only)**: `git diff apps/api/Dockerfile` shows only added lines (no `-` lines) — proves Batch A didn't touch `base`/`deps`/`build`/`runtime`.
- **S2 (dev stage present, correctly sourced)**: `grep -n "^FROM deps AS dev$"` in `apps/api/Dockerfile` → exactly one match; `grep -c "^FROM "` → `5` (was 4).
- **S3 (dev stage has no baked source, no secrets)**: between the `FROM deps AS dev` line and EOF, `grep -c "COPY"` → `0`; `grep -E "^(ARG|ENV).*(SECRET|PASSWORD)"` → `0` matches (whole file, unchanged from before).
- **S4 (dev stays root, prod stays non-root)**: `grep -c "^USER node$" apps/api/Dockerfile` → `1` total (only in `runtime`, none added in `dev`).
- **S5 (dev hot-reload CMD)**: `grep -n 'CMD \["pnpm", "start:dev"\]' apps/api/Dockerfile` → present, positioned after the `FROM deps AS dev` line.
- **S6 (no ports leak in dev either)**: per-service `awk` extraction of `infra/docker-compose.dev.yml` shows `ports:` only under `postgres` and `nginx` — absent under `api`.
- **S7 (no restart/mem_limit added to dev)**: `grep -E "restart:|mem_limit:" infra/docker-compose.dev.yml` → zero matches.
- **S8 (dev api targets the `dev` build stage)**: `grep -n "target: dev" infra/docker-compose.dev.yml` → present under `api`'s `build:` block.
- **S9 (node_modules shadow volumes present)**: `grep -E "api_node_modules_root|api_node_modules_app|shared_node_modules" infra/docker-compose.dev.yml` → each name appears exactly twice (once as a service volume mount, once under top-level `volumes:`).
- **S10 (dev cert path is NOT the real host `/etc/letsencrypt`)**: `grep -n "infra/certs/dev:/etc/letsencrypt:ro" infra/docker-compose.dev.yml` → present; `grep -E "^\s*-\s*/etc/letsencrypt:/etc/letsencrypt" infra/docker-compose.dev.yml` → zero matches (must never accidentally mount the host's real cert store).
- **S11 (generated certs gitignored)**: `grep -n "infra/certs/dev/" .gitignore` → present.
- **S12 (dev env has the full app contract)**: `grep -E "^(DATABASE_URL|JWT_ACCESS_SECRET|JWT_ACCESS_TTL|JWT_REFRESH_SECRET|JWT_REFRESH_TTL|LOCKOUT_MAX_ATTEMPTS|LOCKOUT_WINDOW_MINUTES|SUPER_ADMIN_EMAIL|SUPER_ADMIN_PASSWORD|COOKIE_SECURE|PORT|WEB_ORIGIN)=" infra/.env.dev.example` → all twelve keys present.
- **S13 (dev `DATABASE_URL` targets the service name, not localhost)**: `grep -E "^DATABASE_URL=postgresql://.*@postgres:5432/hub_dev" infra/.env.dev.example` → one match.
- **S14 (Makefile cert target is idempotent-by-construction)**: `grep -n "^infra/certs/dev/live/localhost/fullchain.pem:$" Makefile` → present as a real (non-`.PHONY`) file-target line; `grep -n "^dev-cert:" Makefile` → present, depends on that exact path; `grep -n "^dev-up: dev-cert$" Makefile` → present.
- **S15 (`.PHONY` line updated)**: `grep -n "^\.PHONY:" Makefile` includes `dev-cert`.
- **S16 (non-goal fence — no prod/base/nginx-template diff)**: `git diff --stat` output contains none of `infra/docker-compose.prod.yml`, `infra/docker-compose.yml`, `infra/scripts/deploy.sh`, `infra/nginx/default.conf.template`.

No swagger/API-journey-test gate family applies — this task adds no `apps/api` HTTP routes.

### Empirical gates (hub-tester — locally runnable, exact commands + expected output)

- **E1 (service list grows correctly)**: `docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml --env-file infra/.env.dev config --services | sort` → exactly three lines: `api`, `nginx`, `postgres`.
- **E2 (cert generates once, idempotent after)**: `rm -rf infra/certs/dev` (clean slate) → `make dev-cert` → `infra/certs/dev/live/localhost/fullchain.pem` and `privkey.pem` both exist; `openssl x509 -in infra/certs/dev/live/localhost/fullchain.pem -noout -subject` → contains `CN = localhost`. Record `stat -c %Y` (mtime) of `fullchain.pem`. Run `make dev-cert` again → mtime unchanged (proves no regeneration).
- **E3 (three-service bring-up, all healthy/running)**: `cp infra/.env.dev.example infra/.env.dev && make dev-up` → within 60s, `docker compose -p hub-dev -f infra/docker-compose.yml -f infra/docker-compose.dev.yml ps --format json` shows `postgres` and `api` both `"Health": "healthy"`; `nginx` shows `"State": "running"` (base `nginx:1.27-alpine` image ships no built-in `HEALTHCHECK`, matching prod's own nginx service — "running", not "healthy", is the correct and only expected state, same as prod).
- **E4 (hot-reload actually works, no rebuild)**: with E3's stack running, edit `apps/api/src/health/health.controller.ts` on the host (e.g. append a harmless comment or tweak a literal in the response), watch `docker compose -p hub-dev logs -f api` for Nest's webpack watcher to report a rebuild (`File change detected`/successful recompile), confirm via `curl -sk https://localhost:8443/api/v1/health` that the process actually restarted and served fresh code (if a response-visible change was made) — all without running `docker compose build` or `restart` in between. Revert the edit afterward and confirm the watcher rebuilds back to the clean state.
- **E5 (nginx fronts the api correctly, health via TLS)**: `curl -sk https://localhost:8443/api/v1/health` → HTTP 200, same response envelope shape as `apps/api`'s existing health e2e spec asserts (e.g. `{"data":{"status":"ok"}}` — match whatever `apps/api/test/health.e2e-spec.ts` currently asserts, don't invent a different shape).
- **E6 (login route hits the rate-limited location, not the 503 placeholder)**: `curl -sk -X POST https://localhost:8443/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"nope@example.com","password":"wrong"}'` → a real api response (401/400-shaped JSON), never HTTP 503 (proves the `location = /api/v1/auth/login` block matches before falling through to `location /`).
- **E7 (http→https redirect works, new in dev)**: `curl -sI http://localhost:8080/` → `HTTP/1.1 301 Moved Permanently` with a `Location: https://localhost/...` header (first time this exact prod-only behavior becomes locally testable).
- **E8 (idempotent teardown/bring-up)**: `make dev-down` → no containers under `docker compose -p hub-dev ... ps`; `make dev-up` again → succeeds cleanly, same three services healthy/running again, no name/port/volume conflicts.
- **E9 (RAM visibility, informational only, non-blocking)**: during E3, `docker compose -p hub-dev ... ps -q | xargs docker stats --no-stream --format '{{.Name}}: {{.MemUsage}}'` → report the three numbers in the test output for visibility; do not fail the gate on any particular value (Design Decision #4).
- **E10 (no regression)**: `pnpm typecheck && pnpm test && pnpm --filter api test:e2e` → 54 unit / 31 e2e passing, unchanged from the pre-task baseline (RUNLOG 2026-09-14T00:32).
- Full teardown after the run: `make dev-down`, remove `infra/.env.dev` and `infra/certs/dev/` (both gitignored, throwaway), confirm via `git status --porcelain` that nothing new is tracked.

### Gatekeeper criteria (hub-gatekeeper — standalone, maps to authoritative sources)

- **G1**: `infra/docker-compose.dev.yml`'s merged service set (`postgres`, `api`, `nginx`) matches DEC-086's literal directive — same Dockerfile, same nginx template, same TLS-fronted routing in dev, self-signed cert swapped for real Let's Encrypt certs, locally built image instead of GHCR pull.
- **G2**: hub-deploy skill constraints honored for the *added* dev containers — only `nginx` publishes host ports (`api`/`postgres`'s existing host port predates this task and is unchanged); no secret is baked into any image layer; migrations still never run on container boot (unaffected by this diff — `dev` stage's `CMD` is `pnpm start:dev`, never `migrate deploy`).
- **G3**: `infra/nginx/default.conf.template` is reused byte-for-byte unmodified (`git diff` empty for that path) — "no code duplication" requirement satisfied structurally, not just by claim.
- **G4**: non-goal fence held — `infra/docker-compose.prod.yml`, `infra/scripts/deploy.sh`, `infra/docker-compose.yml` (base), and `apps/api/Dockerfile`'s `deps`/`build`/`runtime` stages show zero diff; `apps/web` still doesn't exist and nginx's `/` 503 placeholder is untouched (no fake web service invented in dev).
- **G5**: TASKS.md #41 (as reopened by DEC-086) is genuinely satisfiable/closeable from this diff alone — dev now has real containerized `api`+`nginx` parity with prod, hot-reload verified working, not merely YAML that parses.
- **G6**: the hot-reload mechanism (whole-repo bind mount + three named shadow volumes) is a real, verified-working pattern (E4), not a theoretical one — gatekeeper should treat an E4 failure as an automatic REROUTE regardless of any other gate's pass state, since "hot-reload doesn't work" is the single named failure mode DEC-086's directive is most exposed to.

## 7. Open questions

None — every requirement in DEC-086 and the task prompt maps to either the original spec's established conventions (reused verbatim where unchanged) or an explicit, documented design decision above (mount strategy, cert mechanism, port choice, root-vs-non-root, RAM/restart policy). Nothing here contradicts an authoritative doc.
