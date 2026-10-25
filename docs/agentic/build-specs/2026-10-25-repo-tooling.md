# Build Spec — Repo tooling: ESLint + Prettier + husky/lint-staged + commitlint (TASKS.md #39)

**Tags:** goal "Reduced tool sprawl" (TASKS.md #39 row, user directive 2026-09-13); closes DEC-079 (known gap: no ESLint config anywhere, `pnpm lint` errors repo-wide). Also carries a traceability batch for **[E-07/F-27]** Auth (TASKS.md #1 DONE, no tagged tests — per `planning/ENGINEERING_STANDARDS.md` "Traceability (SDD)").
**Not finance-touching** (no ledger/money path) — `accountant-expert` not required. No `apps/api` endpoints added or changed — Swagger/e2e-journey gate families N/A.

## Sources read
- `CLAUDE.md` (Minimal Code Discipline, Delegation Rules ≤3 files/batch, "run `pnpm lint && pnpm typecheck && pnpm test` before done", Conventional Commits).
- `planning/ENGINEERING_STANDARDS.md` — Traceability section: tag test `describe`/`it` titles with feature IDs, run `bash docs/agentic/trace-check.sh`.
- `analysis/development-plan.md` L101-102: "TypeScript strict, no `any` without eslint-disable justification" and "ESLint (typescript-eslint, next/core-web-vitals, prettier as arbiter) — zero warnings policy in CI". §10 DoD: lint+typecheck+test green.
- `analysis/task-breakdown.md` L35: Phase 1 item "ESLint+Prettier, husky/lint-staged, commitlint".
- `docs/memory/DECISIONS.md` DEC-079 (orchestrator accepted gap, deferred to this task).
- Repo state (verified): root `package.json` has `"lint": "pnpm -r lint"`; `apps/api` has `"lint": "eslint ."` but no eslint dep/config; `packages/shared` has NO `lint` script; no `.github/`, no `.husky/`, no prettier/commitlint config; ~38 TS files; TS `^6.0.3` (typescript-eslint peer `>=4.8.4 <6.1.0` — OK for 6.0.x, do NOT bump TS); tsconfig base is NodeNext/strict; `apps/api/prisma/seed*.ts` sit outside `tsconfig.include` (so do NOT use type-aware linting). Existing style: single quotes, semicolons, trailing commas, lines up to ~107 chars. `apps/api/Dockerfile` runs `pnpm install --frozen-lockfile` (incl. `--prod`) with only root manifests copied and no `.git`.

## Objective
Add one root-level flat ESLint 9 config (extendable to future `apps/web`), Prettier, husky pre-commit (lint-staged) + commit-msg (commitlint conventional) hooks, so `pnpm lint` passes repo-wide with zero warnings and existing code is changed minimally (rule config over code edits). Then tag Auth tests with `[F-27]` so trace-check reports no untagged DONE feature for F-27.

## Design decisions (stop at first YAGNI rung)
- Single root `eslint.config.mjs` (ESLint finds it by walking up from each workspace's cwd) — no per-package configs. Web later appends a block (`eslint-config-next` / `next/core-web-vitals`) to the same array; add a `// apps/web: append next/core-web-vitals block here` comment only.
- **Non-type-aware** `typescript-eslint` `recommended` (no `parserOptions.project`) — cheaper, avoids the prisma-dir/tsconfig include mismatch.
- Prettier is the formatting arbiter via `eslint-config-prettier` (disables conflicting rules) — NO `eslint-plugin-prettier`; formatting checked by `prettier --check` separately.
- Zero-warnings: lint scripts use `eslint . --max-warnings 0`.
- Rule tuning (config, not code edits): `@typescript-eslint/no-unused-vars` error with `argsIgnorePattern/varsIgnorePattern/caughtErrorsIgnorePattern: '^_'`; `@typescript-eslint/no-explicit-any` stays `error` for src, set `off` ONLY for `**/*.spec.ts, **/*.e2e-spec.ts` if tests violate it. Any further relaxation must be per-rule, commented with the reason, and listed in the RUNLOG. Implementer first runs lint with strict config, counts findings per rule, then relaxes only rules where fix would need >~5 code edits; remaining small fixes go in Batch 4.
- Husky v9, `prepare` script guarded so Docker/CI installs never fail.
- commitlint `@commitlint/config-conventional`.
- Prettier config calibrated to existing style: `singleQuote: true`, `semi: true`, `trailingComma: "all"`, `printWidth: 120`.

## Batches (≤3 files each; run in order; orchestrator verifies between)

### Batch 1 — ESLint (3 files + lockfile)
Files: `/Users/mdshakilurrahman/Documents/projects/Personal/polyhub/eslint.config.mjs` (new), `/Users/mdshakilurrahman/Documents/projects/Personal/polyhub/package.json`, `/Users/mdshakilurrahman/Documents/projects/Personal/polyhub/packages/shared/package.json`. (`pnpm-lock.yaml` changes mechanically from `pnpm install` — not counted, not hand-edited.)
1. Root `package.json` `devDependencies` add: `eslint` (^9), `@eslint/js` (^9), `typescript-eslint` (^8), `eslint-config-prettier` (^10), `globals` (latest). Install with `pnpm add -wD ...`. Do not add `eslint` to `apps/api` (root binary is hoisted to workspace bins? — pnpm does NOT expose root bins to workspaces' scripts reliably: if `eslint` not found in `apps/api`, instead change workspace `lint` scripts to run through root via `pnpm -w exec eslint . --max-warnings 0`… prefer simplest: add `eslint` as devDependency in `apps/api` and `packages/shared` too, `workspace`-same version; record which was used in RUNLOG).
2. `eslint.config.mjs` (flat, ESM): `export default tseslint.config(...)` with:
   - `{ ignores: ['**/dist/**','**/node_modules/**','**/coverage/**','**/.next/**','apps/api/prisma/migrations/**','design/**','docs/**','resources/**','infra/**','.claude/**'] }`
   - `js.configs.recommended`, `...tseslint.configs.recommended`
   - block for `**/*.ts`: `languageOptions.globals: globals.node` (+ `globals.jest` for spec files), rule tuning as in Design decisions
   - `eslintConfigPrettier` LAST.
   - Comment marker for future web block.
3. `apps/api/package.json`: change `"lint"` to `"eslint . --max-warnings 0"`.
4. `packages/shared/package.json`: add `"lint": "eslint . --max-warnings 0"` (currently missing → `pnpm -r lint` silently skips it).
5. Run `pnpm lint`; apply only rule-config relaxations in `eslint.config.mjs` to get green. If code edits are needed, STOP and report count to orchestrator → Batch 4 (do not edit src here).
**Trust boundary/money/a11y touched:** none. **Regression surface:** `pnpm -r lint` now also covers `packages/shared`; `pnpm install --frozen-lockfile` in `apps/api/Dockerfile` must still succeed (lockfile committed).

### Batch 2 — Prettier (3 files)
Files: `.prettierrc.json` (new), `.prettierignore` (new), `package.json` (root).
1. `.prettierrc.json`: `{ "singleQuote": true, "semi": true, "trailingComma": "all", "printWidth": 120 }`.
2. `.prettierignore`: `dist`, `node_modules`, `coverage`, `.next`, `pnpm-lock.yaml`, `apps/api/prisma/migrations`, `design`, `docs`, `resources`, `analysis`, `planning`, `infra`, `.claude`, `.idea`, `*.md`.
3. Root `package.json`: devDependency `prettier` (^3); scripts `"format": "prettier --write ."`, `"format:check": "prettier --check ."`.
4. Run `pnpm format:check`. If files fail: do NOT mass-reformat in this batch; report the list → Batch 4 (`prettier --write` limited to the reported files, formatting-only diff). If config tweak (e.g. printWidth) removes most diffs, tweak instead.
**Regression surface:** none at runtime.

### Batch 3 — husky + lint-staged + commitlint (3 files + hook files)
Files: `package.json` (root), `commitlint.config.mjs` (new), `.husky/pre-commit` + `.husky/commit-msg` (new; counted together as the hook dir, tiny shell files).
1. Root devDeps: `husky` (^9), `lint-staged` (^15/16), `@commitlint/cli`, `@commitlint/config-conventional` (^19+).
2. Root scripts: `"prepare": "husky || true"` (never fails when husky absent, e.g. `pnpm install --prod` in Docker, or no `.git`).
3. Root `package.json` `"lint-staged"`: `{ "*.{ts,tsx,js,mjs}": ["eslint --max-warnings 0 --fix", "prettier --write"], "*.{json,yml,yaml}": ["prettier --write"] }` (md excluded, matches `.prettierignore`).
4. `commitlint.config.mjs`: `export default { extends: ['@commitlint/config-conventional'] };`
5. `.husky/pre-commit`: first line `[ -n "$CI" ] && exit 0`, then `pnpm exec lint-staged`.
6. `.husky/commit-msg`: first line `[ -n "$CI" ] && exit 0`, then `pnpm exec commitlint --edit "$1"`. Files must be executable (`chmod +x`).
7. Run `pnpm install` once so `prepare` installs hooks (`git config core.hooksPath` → `.husky/_`). Do NOT commit; do not alter git config beyond what husky does.
**Regression surface:** every future commit passes through these hooks; `apps/api/Dockerfile` `pnpm install` stage (root `prepare` runs there — must be exit 0 with no `.git`/husky); future CI workflow (`.github/` absent today) must keep `CI=true` default (GitHub Actions does).

### Batch 4 — Conditional code/format fixes (only if Batches 1-2 reported residual findings)
≤3 files per sub-delegation; each fix must be the minimal edit (remove unused import/var — only ones lint flags; or `prettier --write <file>`). No behavior change; `pnpm typecheck && pnpm test` must stay green. If zero residuals: skip, log "Batch 4 skipped" in RUNLOG.

### Batch 5 — Traceability tags `[F-27]` (tests only, titles only; 3 files)
Files: `apps/api/test/auth.e2e-spec.ts`, `apps/api/src/modules/auth/auth.service.spec.ts`, `apps/api/src/modules/auth/decorators/current-user.decorator.spec.ts`.
- `auth.e2e-spec.ts:45` → `describe('Auth (e2e) [F-27]', ...)` (exact example from ENGINEERING_STANDARDS).
- `auth.service.spec.ts:19` → `describe('AuthService [F-27]', ...)`.
- `current-user.decorator.spec.ts:4` → `describe('getCurrentUserFromContext [F-27]', ...)`.
### Batch 6 — `[F-27]` remaining auth specs (2 files)
Files: `apps/api/src/modules/auth/strategies/jwt-access.strategy.spec.ts` (L6 `describe('JwtAccessStrategy [F-27]'`), `apps/api/src/modules/auth/strategies/jwt-refresh.strategy.spec.ts` (L6 `describe('refreshTokenExtractor [F-27]'`, L26 `describe('JwtRefreshStrategy [F-27]'`).
Rules for 5+6: change ONLY the first string argument of top-level `describe`; tag must be inside square brackets (trace-check regex `\[[^]]*\bF-27\b[^]]*\]`); no other test edits; nested `describe`/`it` untouched (top-level tag covers them; standards require "describe/it" carry the ID — top-level suffices as the feature scope). Do not tag non-auth specs (health, swagger, db-indexes, env, filter, interceptor, prisma seed) with F-27.

## DoD gates

### Static (hub-reviewer)
S1. `ls eslint.config.mjs .prettierrc.json .prettierignore commitlint.config.mjs .husky/pre-commit .husky/commit-msg` all exist; `test -x .husky/pre-commit && test -x .husky/commit-msg`.
S2. `grep -c "eslint-config-prettier\|eslintConfigPrettier" eslint.config.mjs` ≥ 2 and `eslintConfigPrettier` appears after `tseslint.configs.recommended` (last entry).
S3. `grep -n "max-warnings 0" apps/api/package.json packages/shared/package.json` returns one hit each; `grep -n '"lint"' packages/shared/package.json` present.
S4. `grep -n "parserOptions" eslint.config.mjs` → no hit (non-type-aware); `grep -n "eslint-plugin-prettier" package.json` → no hit.
S5. `grep -n "no-explicit-any" eslint.config.mjs` shows `error` for src; any `off`/`warn` is limited to spec globs and carries a comment. Count of `eslint-disable` added in src: `git diff -U0 -- 'apps/**/src' | grep -c "eslint-disable"` = 0.
S6. Root `package.json` has `"prepare": "husky || true"`; both hook files start with `[ -n "$CI" ] && exit 0`.
S7. `grep -rn "F-27" apps --include='*.spec.ts' --include='*.e2e-spec.ts'` shows 6 top-level describes tagged in the form `[F-27]` (auth.e2e, auth.service, current-user.decorator, jwt-access, jwt-refresh ×2 = 6 hits); `git diff --stat` for Batches 5-6 touches only those 5 files, only title lines (`git diff -U0 | grep '^[+-]' | grep -v '^[+-][+-]' | wc -l` = 12).
S8. No new runtime `dependencies` added: `git diff package.json apps/*/package.json packages/*/package.json` shows only `devDependencies`/`scripts`/`lint-staged` changes. `pnpm-lock.yaml` committed-in-diff.
S9. Diff to `apps/**/src` and `apps/api/test` from Batches 1-3 = 0 lines (code edits only in Batch 4/5/6).

### Empirical (hub-tester; run from repo root)
E1. `pnpm install --frozen-lockfile` exits 0 (lockfile consistent). Expected: no "lockfile needs update".
E2. `pnpm lint` exits 0, output shows lint ran for both `@hub/api` and `@hub/shared`, and contains no "warning" lines nor "couldn't find a configuration file".
E3. Falsify lint: create scratch file `apps/api/src/__lint_probe.ts` containing `const unusedProbe: any = 1;` → `pnpm --filter @hub/api lint` exits non-zero reporting `no-unused-vars` and/or `no-explicit-any`; delete the file afterwards (`git status` clean of it).
E4. `pnpm format:check` exits 0 (or documented residuals fixed in Batch 4). Falsify: add `const   x=1` to a scratch ts file → check exits 1.
E5. `pnpm typecheck && pnpm test` exit 0 (unit tests unchanged count; the `[F-27]` rename must not change pass/fail counts — compare pass count before vs after). `pnpm --filter @hub/api test:e2e` still green if DB is up (DEV postgres via `docker compose -f infra/docker-compose.dev.yml up -d`); if DB unavailable, report as skipped, not passed.
E6. Commit-msg hook: in a scratch clone/worktree state (do NOT pollute history): `echo "bad message" | pnpm exec commitlint` exits non-zero (subject/type empty); `echo "chore(tooling): add eslint" | pnpm exec commitlint` exits 0.
E7. Pre-commit hook: stage a scratch file with `const   x=1` and an unused var, run `pnpm exec lint-staged` → non-zero/auto-fixed per config; unstage and delete scratch. `git stash`/`git reset` only on the scratch file.
E8. CI guard: `CI=true sh .husky/pre-commit; echo $?` → 0 immediately without running lint-staged; `CI=true sh .husky/commit-msg x; echo $?` → 0.
E9. Docker-safety: `cd /tmp/<scratch-dir-without-.git> && HUSKY=0 pnpm run prepare` and `pnpm run prepare` outside git → exit 0 (copy root `package.json` only; or `(cd "$(mktemp -d)" && sh -c 'husky || true'; echo $?)` → 0). Do not run a full docker build.
E10. `bash docs/agentic/trace-check.sh` output: section "DONE features with no tagged test" does NOT list `F-27`. Falsify baseline: run before Batch 5 (F-27 listed) and after (absent).

### Gatekeeper criteria (hub-gatekeeper)
G1. DEC-079 closed: `pnpm lint` green repo-wide (CLAUDE.md "Commands": lint+typecheck+test before done; `analysis/development-plan.md` §10 DoD).
G2. `analysis/development-plan.md` L101-102 conformance: typescript-eslint + prettier-as-arbiter + zero-warnings; strict TS untouched (`tsconfig*.json` unmodified).
G3. CLAUDE.md Conventional Commits + Surgical Changes: no unrelated code churn (S9), no new runtime deps, no rule blanket-disabled (S5), every relaxation commented.
G4. `planning/ENGINEERING_STANDARDS.md` Traceability: build spec cites tags (this file, header); F-27 test tags present; `trace-check.sh` clean for F-27.
G5. `analysis/task-breakdown.md` Phase 1 scaffold item (ESLint+Prettier, husky/lint-staged, commitlint) satisfiable; orchestrator ticks it in `PROGRESS.md`, TASKS.md #39 → DONE, and logs a DECISIONS.md entry superseding DEC-079's "known gap" (orchestrator memory step, not implementer).
G6. Hooks never break CI/Docker (E8, E9); `apps/api/Dockerfile` untouched (hub-deploy rules: no infra edits).

## Risks
- typescript-eslint peer `<6.1.0`: TS `^6.0.3` currently OK; do not bump TS in this task.
- pnpm bin resolution for root-installed `eslint` from workspace scripts (Batch 1 step 1 fallback to per-workspace devDep).
- Husky `prepare` runs inside Docker `pnpm install` — guarded by `|| true`; re-verify if `Dockerfile` changes.
- `apps/web` later: append `eslint-config-next` block to same `eslint.config.mjs`, add `lint` script there; no change to hooks.
