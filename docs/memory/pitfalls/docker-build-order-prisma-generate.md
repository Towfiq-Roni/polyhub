---
name: docker-build-order-prisma-generate
description: apps/api/Dockerfile ran `nest build` before `prisma generate`, so the image build fails as soon as code uses Prisma.* generated types; host builds hide it. Image build is a gate.
type: pitfall
---
Found by the #47 Stage C tester (2026-10-25, DEC-107): `docker build --target runtime -f apps/api/Dockerfile .` failed with TS2694 (`Prisma.UserSelect` missing) because the build stage runs `nest build` (line 29) before `prisma generate` (line 30). Reproduced on a clean worktree of the previous commit, so it was a latent regression since #2 introduced the first `Prisma.*` type usage (`users.service.ts`). e2e and host builds stay green because the Prisma client is already generated locally.

**Why:** the generated client types only exist after `prisma generate`; a clean image has none.

**Adjacent defect (found in #48 spec):** `dev` was the LAST stage and `infra/docker-compose.prod.yml` `api.build` has no `target:`, so a prod build (`make prod-build`/deploy) produced the `dev` image (no dist, no source; CMD = prisma generate + start:dev). Fixed in #48: `dev` stage moved above `runtime`, so `runtime` is the last/default stage. Dev compose still sets `target: dev`.

**How to apply:** fixed by #48 (`prisma generate` now runs before `nest build`; `runtime` is the last/default stage). Rule stays: any task touching Prisma schema or `Prisma.*` types must run an unmodified `docker build -f apps/api/Dockerfile .` as an empirical gate (explicit `--target runtime` is harmless).

**Gate:** enforced mechanically since #50 - `python3 tools/check-dockerfile-stages.py` + the IMAGE-BUILD gate in `.claude/agents/hub-tester.md` (trigger paths listed there).
