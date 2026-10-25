---
name: docker-build-order-prisma-generate
description: apps/api/Dockerfile ran `nest build` before `prisma generate`, so the image build fails as soon as code uses Prisma.* generated types; host builds hide it. Image build is a gate.
type: pitfall
---
Found by the #47 Stage C tester (2026-10-25, DEC-107): `docker build --target runtime -f apps/api/Dockerfile .` failed with TS2694 (`Prisma.UserSelect` missing) because the build stage runs `nest build` (line 29) before `prisma generate` (line 30). Reproduced on a clean worktree of the previous commit, so it was a latent regression since #2 introduced the first `Prisma.*` type usage (`users.service.ts`). e2e and host builds stay green because the Prisma client is already generated locally.

**Why:** the generated client types only exist after `prisma generate`; a clean image has none.

**How to apply:** any task touching Prisma schema or `Prisma.*` types must run an unmodified `docker build --target runtime -f apps/api/Dockerfile .` (the last stage is `dev`, so `--target runtime` is required) as an empirical gate. Fix lives in task #48 (swap the two RUN lines; load `hub-deploy`).
