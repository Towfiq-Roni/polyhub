# Build spec: #48 Dockerfile prisma generate order (2026-10-25)

Sources: tasks/048-*.md, DEC-107, DEC-083/084/086/087, pitfall docker-build-order-prisma-generate.md, skill hub-deploy, apps/api/Dockerfile (read fully), infra/docker-compose.{dev,prod}.yml, Makefile, deploy.sh.

## Objective
`docker build -f apps/api/Dockerfile .` (clean, no scratch edits) must succeed and yield a working runtime image: `prisma generate` runs before `nest build` so `Prisma.*` generated types exist at compile time. Nothing else about runtime/dev behavior changes.

## Analysis (decisions)
1. Minimal fix = swap lines 29/30 of the `build` stage. `prisma generate` needs only the `prisma` CLI + `prisma/schema.prisma` (both present: `COPY . .`, CLI is a dependency per DEC-084). `nest build` has no prebuild hook that generates (apps/api/package.json `build` = `nest build`).
2. Runtime stage copy (lines 47-50) is unaffected: generate still writes to the pnpm virtual-store `@prisma+client@*/node_modules/.prisma` in the build stage, and the bind-mount copy resolves it by glob. Prod `--prod` install keeps the pinned `prisma` CLI (dependencies), so `npx --no-install prisma migrate deploy` in deploy.sh/Makefile still works. No change needed.
3. `dev` stage: has no source at build time, generates at container start (DEC-087). Unaffected; must still build.
4. Layer cache: generate now precedes build, so a schema change invalidates generate+build (same as before for build, since `COPY . .` already busts both). No regression.
5. FOUND ADJACENT DEFECT: `dev` is the LAST stage, and `infra/docker-compose.prod.yml` `api.build` has NO `target:`. So `make prod-build`/`deploy` builds the `dev` stage (no dist, no source; CMD = prisma generate + start:dev) as the prod image. Smallest in-file fix (no infra/ edit): move the `dev` stage block above `runtime` so `runtime` is last and the default target. dev compose already sets `target: dev`. Pitfall note "`--target runtime` required" then becomes stale; update that line. (Alternative `target: runtime` in prod compose rejected: touches infra/, and a bare `docker build` would still be the wrong image.) Needs a DECISIONS entry by the orchestrator (deviation beyond task title) before Stage B.

## Batch 1 (2 files, one hub-implementer delegation)
1. `/Users/mdshakilurrahman/Documents/projects/Personal/polyhub/apps/api/Dockerfile`
   a. In `FROM deps AS build`: put `RUN pnpm --filter @hub/api exec prisma generate` BEFORE `RUN pnpm --filter @hub/api... run build`. Add a one-line comment: generated Prisma types must exist before tsc/nest build.
   b. Move the entire `FROM deps AS dev ... CMD [...]` block (incl. its comments) to sit between `build` and `runtime`, unchanged, so `runtime` is the final stage. Update the header comment to mention `--target dev` for dev, default = runtime. No other edits.
2. `/Users/mdshakilurrahman/Documents/projects/Personal/polyhub/docs/memory/pitfalls/docker-build-order-prisma-generate.md`: replace "Fix lives in task #48 ..." and the "`--target runtime` is required" parenthetical with: fixed by #48 (generate before build; runtime is the last/default stage); keep the "any task touching Prisma schema/`Prisma.*` types must run an unmodified `docker build -f apps/api/Dockerfile .`" rule (use `--target runtime` explicitly is harmless).
   Guard (item 3, tiny): that pitfall line IS the guard. Follow-up, NOT in this spec: add the image-build gate to hub-tester agent/spec template (.claude/ edits are outside this task).

Trust boundaries / money paths: none. Surface: runs in prod deploy path (#43), dev compose `api`, `make prod-build`.
Regression surface: dev compose (`make dev-up` target dev), prod compose default-target image, deploy.sh migrate step, `.dockerignore`.

## DoD gates
Static (hub-reviewer):
- S1 `grep -n "prisma generate\|run build\|^FROM" apps/api/Dockerfile`: in the `build` stage, the `prisma generate` line number < the `run build` line number.
- S2 Last `^FROM` line is `FROM base AS runtime`; `FROM deps AS dev` appears before it; dev CMD still `["sh", "-c", "pnpm exec prisma generate && pnpm start:dev"]`.
- S3 `git diff --stat`: only the Dockerfile + pitfall file changed (no infra/, compose, Makefile, package.json diff attributable to this task; pre-existing dirty files from #47 excluded).
- S4 Runtime stage lines (COPY --from=build, prisma bind-mount copy, `USER node`, HEALTHCHECK, CMD) byte-identical to before.

Empirical (hub-tester; use `docker build` with distinct tags; remove test images/containers after):
- E1 Mutation: `git stash`-free: copy original Dockerfile from `git show HEAD:apps/api/Dockerfile > $SCRATCH/Dockerfile.orig`, run `docker build -f $SCRATCH/Dockerfile.orig --target runtime -t hub-api-orig .` (context root) -> must FAIL with `TS2694` (proves the gate detects the bug). Then fixed: `docker build -f apps/api/Dockerfile -t hub-api-test .` (NO --target) -> exit 0, and `docker image inspect` shows it built the runtime stage: `docker run --rm hub-api-test sh -c 'test -f /repo/apps/api/dist/main.js && echo ok'` -> `ok`.
- E2 `docker build -f apps/api/Dockerfile --target dev -t hub-api-dev-test .` exit 0.
- E3 argon2 loads: `docker run --rm hub-api-test node -e "require('argon2').hash('x').then(h=>console.log(h.slice(0,9)))"` -> `$argon2id`.
- E4 Prisma CLI present: `docker run --rm hub-api-test npx --no-install prisma --version` -> prints Prisma 6.x (matches `^6.19.3`), exit 0. Generated client present: `docker run --rm hub-api-test node -e "const {Prisma}=require('@prisma/client');console.log(typeof Prisma.UserScalarFieldEnum)"` -> `object`.
- E5 Boot against dev compose Postgres: start `infra` dev postgres (`make dev-up` needs infra/.env.dev copied from the example; pitfall make-dev-up-needs-infra-env-dev) or reuse a running one; `docker run -d --name hub-api-t -p 4010:4000 --add-host host.docker.internal:host-gateway -e DATABASE_URL=... -e JWT_ACCESS_SECRET=... (all required vars, inline -e only, no env files created) hub-api-test`. `curl -s -o /dev/null -w %{http_code} localhost:4010/api/v1/health` -> 200; login as seeded admin `POST /api/v1/auth/login` -> 201; `GET /api/v1/users` with Bearer -> 200 and no `passwordHash` in body (Prisma query path). `docker inspect -f '{{.State.Health.Status}}'` -> `healthy` within ~60s.
- E6 Declared NOT run: `make prod-build`, `infra/scripts/smoke.sh`, `deploy.sh` (need infra/.env.prod + TLS; agents must not create). Instead: `docker compose -f infra/docker-compose.prod.yml config --quiet` with a throwaway `--env-file` in the scratchpad is optional; state the prod compose default target now resolves to runtime by S2.
- E7 Cleanup: `docker rm -f hub-api-t; docker rmi hub-api-test hub-api-dev-test hub-api-orig`.
- E8 Host gates still green: `corepack pnpm typecheck` (no source change expected).

Gatekeeper criteria:
- G1 hub-deploy skill: Dockerfile-only change, no secrets, multi-arch-neutral (no arch-specific lines), RAM unaffected (image size within ~5% of 668 MB reported in DEC-107).
- G2 DEC-107/pitfall acceptance: unmodified `docker build -f apps/api/Dockerfile .` exits 0; mutation (HEAD Dockerfile) fails TS2694.
- G3 DEC-083/084/087 preserved: Prisma CLI in runtime, `--no-install` migrate path, dev stage generates at start.
- G4 Adjacent-default-stage decision (item 5) logged in DECISIONS.md and reflected in the pitfall; CLAUDE.md rule "No deviations unless logged".
- G5 No product/schema/infra-compose edits; completion notes in tasks/048 record the E-results and the "not run" list.

Open questions: none. Assumption: moving `dev` stage above `runtime` is acceptable; if the stakeholder prefers `target: runtime` in prod compose instead, drop 1b and edit infra/docker-compose.prod.yml (hub-deploy) in place of it.
