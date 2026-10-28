# Build spec: #50 image-build gate (hub-planner, 2026-10-25)

Task: `tasks/050-*.md` (read via `python3 tools/task.py show 50`). Sources: DEC-107/108, `docs/memory/pitfalls/docker-build-order-prisma-generate.md`, `tasks/048` Stage D notes, `.claude/agents/{hub-tester,hub-planner,hub-gatekeeper,hub-implementer}.md`, `.claude/CHANGELOG.md` line 1 (bump rule), `tools/tests/test-protect-paths.sh` (test convention), current `apps/api/Dockerfile` (stages: base, deps, build, dev, runtime; runtime LAST; build stage: `prisma generate` then `run build`).

## 1. Objective
Make an unmodified `docker build -f apps/api/Dockerfile .` a standing, mechanically-triggered empirical gate (hub-tester, hub-gatekeeper) plus a stdlib static check of the Dockerfile's stage layout that #43 (CI) can call later, so a repeat of the #2->#48 regression (build before generate; default final stage silently `dev`) cannot pass the chain. No product code touched.

## 2. Assumptions (defaults, no open questions)
- A1 Script is Python 3 stdlib (`tools/check-dockerfile-stages.py`), matching `tools/task.py`; invoked `python3 tools/check-dockerfile-stages.py [path]` (default `apps/api/Dockerfile`, resolved relative to repo root). Exit 0 = ok, 1 = assertion failed, 2 = usage/file missing. Stdout one line per check `PASS|FAIL <name>`.
- A2 Not wired to any git hook or `pnpm test` (commits stay fast). Wired only into hub-tester checklist; #43 calls it later.
- A3 Orchestrator (not planner/implementer) appends DEC-109 to `docs/memory/DECISIONS.md` and runs `task.py start 50 --spec docs/agentic/build-specs/2026-10-25-image-build-gate.md` before Batch 1. Draft DEC text in section 7.
- A4 Version bump 0.1.0 -> 0.2.0 (MINOR: new CLI tool + new tester check).
- A5 Pitfall file gets ONE line pointing to the gate (yes, decided).

## 3. Script contract: `tools/check-dockerfile-stages.py`
Parse Dockerfile lines; ignore blank lines and lines whose first non-space char is `#`; join no continuations (single-line matching is enough). Stage = region from a `^FROM ` line to the next `^FROM ` (case-insensitive FROM/AS). Checks:
1. `last-stage-is-runtime`: the LAST `FROM` line matches `(?i)\bAS\s+runtime\s*$`.
2. `generate-before-build`: inside the stage named `build` (FROM ... AS build), a non-comment line containing `prisma generate` occurs at a lower line number than a non-comment line matching `run build`. Both must exist (missing either = FAIL). Scope to the build stage so the `dev` stage `CMD ... prisma generate && pnpm start:dev` (later line) cannot satisfy or confuse it.
3. `runtime-runs-dist`: within the runtime stage, a non-comment `CMD` line contains `dist/main.js`.
Exit 1 if any FAIL. Stdlib only (`re`, `sys`, `pathlib`). Under ~60 lines.

## 4. Batches (<=3 files each, dependency order)

### Batch 1 (2 files) - the tool and its test
1. `tools/check-dockerfile-stages.py` (new, executable bit `chmod +x`): implement section 3.
2. `tools/tests/test-check-dockerfile-stages.sh` (new, executable): follow `test-protect-paths.sh` style (`set -u`, REPO via dirname, `PASS/FAIL name` lines, summary line, exit 1 on any fail). Fixtures built in a mktemp dir from the REAL `apps/api/Dockerfile` via python/sed transforms (so test tracks the real file). Cases:
   - T1 real Dockerfile -> exit 0, three PASS lines.
   - T2 MUTATION A: append `FROM base AS extra\nCMD ["true"]` after runtime -> exit 1, output contains `FAIL last-stage-is-runtime`.
   - T3 MUTATION B: swap the `prisma generate` and `run build` RUN lines in the build stage -> exit 1, `FAIL generate-before-build`.
   - T4 delete the `prisma generate` line -> exit 1 `FAIL generate-before-build`.
   - T5 only a COMMENT contains `prisma generate` before build (replace the real RUN with `# prisma generate`) -> exit 1 (proves comments ignored).
   - T6 move `dev` stage back below runtime (original #48 defect shape: dev last) -> exit 1 `FAIL last-stage-is-runtime`.
   - T7 runtime CMD changed to `node server.js` -> exit 1 `FAIL runtime-runs-dist`.
   - T8 nonexistent path -> exit 2.
   Test must not touch the real Dockerfile (copy only) and must clean its tmpdir.
Verify (implementer): `bash tools/tests/test-check-dockerfile-stages.sh; echo $?` -> all PASS, 0; `python3 tools/check-dockerfile-stages.py; echo $?` -> 0; `git status --porcelain apps/api/Dockerfile` empty.

### Batch 2 (3 files) - agent rules (harness edits, deliberate)
3. `.claude/agents/hub-tester.md`: add under "### 2. Task-specific empirical checks" a new bullet **Image-build gate (mechanical trigger)**:
   - Trigger: run `{ git diff --name-only HEAD; git diff --name-only --cached; git ls-files -o --exclude-standard; } | sort -u` (plus `git diff --name-only <base>..HEAD` when the delegation names a range). Gate REQUIRED if ANY path matches: `^apps/api/prisma/schema\.prisma$`, `^apps/api/Dockerfile$`, `^\.dockerignore$`, `^apps/api/package\.json$`, `^package\.json$`, `^pnpm-lock\.yaml$`, `^pnpm-workspace\.yaml$`, `^packages/shared/package\.json$`, OR any `^apps/api/src/.*\.ts$` file whose content matches `Prisma\.|@prisma/client` (`grep -lE 'Prisma\.|@prisma/client' <file>`). No match => report `IMAGE-BUILD: not triggered (no matching path)`; never skip silently.
   - Steps: (a) `python3 tools/check-dockerfile-stages.py` must exit 0 (static layout). (b) `docker build -f apps/api/Dockerfile -t hub-api-gate:<task-id> .` from repo root with NO `--target` (exit 0; a `--target runtime` build does not substitute). (c) `docker run --rm hub-api-gate:<id> sh -c 'test -f /repo/apps/api/dist/main.js && echo ok'` -> `ok`. (d) Boot check: `docker run -d --name hub-api-gate-<id> --add-host host.docker.internal:host-gateway -p 4010:4000 -e ... ` with every required env var passed inline via `-e` (DATABASE_URL host `host.docker.internal` against the dev Postgres, JWT secrets/TTLs, etc. - read `apps/api/src/config` / `infra/.env.dev.example` for names, values from the example), NEVER create or edit any `.env*` file. Assert `curl localhost:4010/api/v1/health` = 200; `POST /api/v1/auth/login` with seeded admin = 201; `GET /api/v1/users` with Bearer = 200 and body has no `passwordHash`/`password` key. (e) Cleanup ALWAYS, pass or fail: `docker rm -f hub-api-gate-<id>; docker rmi hub-api-gate:<id>`. Docker/Postgres unavailable => UNVERIFIABLE (never PASS).
   - Add `IMAGE-BUILD: <triggered paths> -> static ✓/✗ · build ✓/✗ · dist ✓/✗ · health/login/users ✓/✗ · cleaned ✓/✗` to the Output format block as an EMPIRICAL line item.
4. `.claude/agents/hub-planner.md`: in "### 4. Set the DoD gates" append a paragraph after the apps/api endpoints families: "**Any task whose changed paths match the hub-tester image-build trigger list (copy the list from `.claude/agents/hub-tester.md`) ALSO gets an explicit empirical gate `IMAGE-BUILD`** - name the unmodified `docker build -f apps/api/Dockerfile .` + boot checks + cleanup, never left to inference. Tasks touching `apps/api/Dockerfile` also get a static gate `python3 tools/check-dockerfile-stages.py` exit 0." Do not duplicate the full list (single source = hub-tester.md).
5. `.claude/agents/hub-gatekeeper.md`: in its audit procedure (before "### 5. Verdict"), add: "If the diff matches the image-build trigger list in `.claude/agents/hub-tester.md`, run `python3 tools/check-dockerfile-stages.py` and an unmodified `docker build -f apps/api/Dockerfile .` yourself (no --target), boot-check health/login/users, clean up images/containers; failure or UNVERIFIABLE => REROUTE/UNVERIFIABLE for that gate." Do NOT edit `hub-implementer.md` (implementer verifies via its own spec gates; no change needed - tester/gatekeeper own the empirical gate).
Verify: `grep -c 'IMAGE-BUILD' .claude/agents/hub-tester.md .claude/agents/hub-planner.md .claude/agents/hub-gatekeeper.md` each >=1; `grep -n 'check-dockerfile-stages' .claude/agents/*.md` shows tester+planner+gatekeeper; tester file still has frontmatter intact (`head -5`).

### Batch 3 (3 files) - version, changelog, pitfall pointer
6. `.claude/VERSION`: `0.2.0` (single line, trailing newline as before).
7. `.claude/CHANGELOG.md`: keep line 1 (bump rule) untouched; insert ABOVE `## 0.1.0` a `## 0.2.0 - 2026-10-25` section: "New tool `tools/check-dockerfile-stages.py` (+ `tools/tests/test-check-dockerfile-stages.sh`): asserts last FROM is runtime, generate before build in build stage, runtime CMD runs dist/main.js; CI (#43) reuses it. hub-tester/hub-planner/hub-gatekeeper: mechanical IMAGE-BUILD gate (path-trigger list in hub-tester.md; unmodified docker build + boot check). Why: #2->#48 image build was broken for weeks and default stage silently `dev`; host builds and e2e cannot see it (DEC-107/108/109)." Match 0.1.0 section style.
8. `docs/memory/pitfalls/docker-build-order-prisma-generate.md`: append ONE line at end: "**Gate:** enforced mechanically since #50 - `python3 tools/check-dockerfile-stages.py` + the IMAGE-BUILD gate in `.claude/agents/hub-tester.md` (trigger paths listed there)." Do not touch frontmatter or `docs/memory/pitfalls/INDEX.md`.
Verify: `cat .claude/VERSION` = `0.2.0`; `grep -n '^## 0.2.0' .claude/CHANGELOG.md`; `tail -1 docs/memory/pitfalls/docker-build-order-prisma-generate.md`.

Orchestrator (not a batch): DEC-109 append, `task.py start 50 --spec ...` before Batch 1, `task.py done 50` after gatekeeper PASS.

## 5. Trust boundary / regression surface
- No money path, no UI, no apps/** or packages/** edits (require-task gate not triggered, but task still started). Touches harness agent prompts: the three agent files are read by every future chain run; wording errors change gate behaviour, so reviewer must check the trigger list is identical wherever quoted (single source in hub-tester.md).
- `.claude/` edits: confirm `protect-paths` hook does not block (it only blocks .env*, .git/, existing migrations, root TASKS.md). Existing `tools/tests/*.sh` must still pass (`for t in tools/tests/test-*.sh; do bash $t || echo FAIL $t; done`).
- Script depends on the Dockerfile's line shapes (`AS runtime`, `AS build`, `prisma generate`, `run build`); a future legit Dockerfile refactor must update the script in the same change (state in script header comment).

## 6. DoD gates

### Static (hub-reviewer)
- S1 `python3 tools/check-dockerfile-stages.py` exit 0 on HEAD tree; `head -1 tools/check-dockerfile-stages.py` = `#!/usr/bin/env python3`; `grep -nE '^(import|from) ' tools/check-dockerfile-stages.py` shows only stdlib modules (re, sys, pathlib/os).
- S2 `bash tools/tests/test-check-dockerfile-stages.sh` exit 0 and contains cases for: append-stage mutation, swap generate/build mutation, comment-only generate, dev-last, bad CMD, missing file (`grep -c '^case\|PASS\|FAIL'` plus reading the file).
- S3 `git diff --name-only` for the task is exactly: the 2 tools files, `.claude/agents/hub-{tester,planner,gatekeeper}.md`, `.claude/VERSION`, `.claude/CHANGELOG.md`, the pitfall file (+ `docs/memory/DECISIONS.md`, `tasks/050-*.md`, `tasks/INDEX.md`, RUNLOG by orchestrator). Empty diff for `apps/`, `packages/`, `infra/`, `.husky/`, `.claude/settings.json`, `package.json`, lockfile.
- S4 `grep -n 'IMAGE-BUILD' .claude/agents/hub-tester.md` finds trigger list containing all of: `schema\.prisma`, `apps/api/Dockerfile`, `pnpm-lock\.yaml`, `apps/api/package\.json`, `@prisma/client`, and the words `no --target`/`NO \`--target\``, `host.docker.internal`, `docker rmi`, `never create`/`NEVER create` `.env`.
- S5 `cat .claude/VERSION` = `0.2.0`; CHANGELOG has `## 0.2.0` above `## 0.1.0`; line 1 unchanged (`git diff` shows no removal on line 1).
- S6 `grep -n 'Gate' docs/memory/pitfalls/docker-build-order-prisma-generate.md` one new line; `git diff --stat` for that file = +1/-0.
- S7 DEC-109 exists in DECISIONS.md and cites DEC-107/108 and `.claude/VERSION` bump. `git status --porcelain | grep -E '\.env'` empty.
- S8 no new dependency: `git diff --name-only | grep -E 'package.json|pnpm-lock'` empty.

### Empirical (hub-tester)
- E1 Run `for t in tools/tests/test-*.sh; do bash "$t" >/dev/null 2>&1 && echo ok $t || echo FAIL $t; done` -> all ok (new + 5 existing).
- E2 Real-file pass: `python3 tools/check-dockerfile-stages.py; echo $?` -> three `PASS` lines, `0`.
- E3 Mutation A (independent of Batch 1 test): `cp apps/api/Dockerfile $SCRATCH/Dockerfile.m1; printf '\nFROM base AS extra\nCMD ["true"]\n' >> $SCRATCH/Dockerfile.m1; python3 tools/check-dockerfile-stages.py $SCRATCH/Dockerfile.m1; echo $?` -> `FAIL last-stage-is-runtime`, exit 1.
- E4 Mutation B: copy Dockerfile, swap the two RUN lines (`prisma generate` / `run build`) with python; run script -> `FAIL generate-before-build`, exit 1.
- E5 Historical regression: `git show cc25605~1:apps/api/Dockerfile > $SCRATCH/Dockerfile.old; python3 tools/check-dockerfile-stages.py $SCRATCH/Dockerfile.old; echo $?` -> exit 1 (`cc25605~1` is the pre-#48 commit; it resolves to `36a887b`, which did not touch the Dockerfile, so both refs give the byte-identical broken file from `9334c8f`: build-before-generate, dev last. Verified 2026-10-25: exit 1, FAIL last-stage-is-runtime + generate-before-build).
- E6 Image gate dry-run on THIS task's tree to prove the documented procedure works: run the exact steps in the new hub-tester IMAGE-BUILD bullet (unmodified build no --target, dist ok, boot, health 200, login 201, /users 200 no `passwordHash`), then confirm cleanup: `docker ps -a --filter name=hub-api-gate` empty and `docker images hub-api-gate` empty; `git status --porcelain | grep -E '\.env'` empty. Docker/Postgres unavailable => UNVERIFIABLE.
- E7 Trigger mechanics sanity: simulate with `printf 'apps/api/prisma/schema.prisma\n' | grep -E '<tester regex list>'` matches; `printf 'apps/web/src/x.tsx\n' | grep -E ...` does not; `printf '.claude/VERSION\n'` does not. (Confirms list is not over/under-broad.) For this task itself the gate is "not triggered" by paths, so E6 is a procedure proof, not a requirement.
- E8 `pnpm lint && pnpm typecheck && pnpm test` still green (no source change; confirms nothing collateral).

### Gatekeeper criteria (standalone audit)
- G1 Task #50 text (`python3 tools/task.py show 50`) + DEC-107/108 + `docs/memory/pitfalls/docker-build-order-prisma-generate.md`: the gate is mechanical (path list, not judgment) and requires an UNMODIFIED build (no `--target`).
- G2 `.claude/CHANGELOG.md` line 1 bump rule: new tool + new check => MINOR; VERSION/CHANGELOG consistent at 0.2.0.
- G3 CLAUDE.md: surgical (only listed files), no new deps, no hook wiring change (`.claude/settings.json` untouched => not MAJOR), no `.env` files created, no push, harness change logged in DEC-109.
- G4 Gatekeeper re-runs E2-E4 itself and the tools test suite; confirms mutations fail the assertion.
- G5 hub-tester.md remains valid (frontmatter, existing sections intact), and planner/gatekeeper reference the tester list instead of duplicating it.

## 7. DEC-109 draft (orchestrator appends)
`DEC-109 - 2026-10-25 - #50 image-build gate (harness 0.2.0) - Spec docs/agentic/build-specs/2026-10-25-image-build-gate.md. Added tools/check-dockerfile-stages.py (last FROM = runtime; prisma generate before run build within build stage; runtime CMD runs dist/main.js) + pipe test with mutation cases, and an IMAGE-BUILD empirical gate in hub-tester/hub-planner/hub-gatekeeper with a path-pattern trigger list (single source hub-tester.md). Not a git hook (commit speed); #43 CI will call the script. Implementer prompt unchanged by design. MINOR bump 0.1.0 -> 0.2.0. Rationale: #2->#48 regression invisible to host builds and e2e (DEC-107/108).`

## 8. Counts
3 batches (2 + 3 + 3 files). Gates: static 8, empirical 8, gatekeeper criteria 5.
