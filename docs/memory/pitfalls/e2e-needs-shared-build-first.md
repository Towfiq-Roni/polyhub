---
name: e2e-needs-shared-build-first
description: Run `pnpm --filter @hub/shared build` before `pnpm --filter @hub/api test:e2e`; the shared dist is not built by default.
type: pitfall
---
During the #39 Stage D verification (2026-10-25) the api e2e suite could not run against a fresh tree because the `@hub/shared` package had no built `dist`. The api imports the compiled shared package, and nothing in `test:e2e` builds it first. The same constraint is recorded for CI in tasks/043-ci-cd-github-actions-ci-yml-lint-typeche.md ("CI must run `pnpm --filter @hub/shared build` before `test:e2e` (or add root `pretest:e2e`)").

**Why:** shared is a workspace package consumed via its build output; `dist` is gitignored and `test:e2e` (jest, runInBand) has no pre-step.

**How to apply:** run `corepack pnpm --filter @hub/shared build` before `corepack pnpm --filter @hub/api test:e2e`, locally and in any CI job. If the failure is a module-not-found on `@hub/shared`, this is the cause.
