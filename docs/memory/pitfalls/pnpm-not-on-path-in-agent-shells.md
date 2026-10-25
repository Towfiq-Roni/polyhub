---
name: pnpm-not-on-path-in-agent-shells
description: Run pnpm as `corepack pnpm` (or a PATH shim) in agent shells; bare `pnpm` may not resolve.
type: pitfall
---
2026-10-25, TASKS #39 repo-tooling batches: `pnpm` was not on PATH in agent shells. DEC-090 recorded it as an environment note: use `corepack pnpm` or a PATH shim.

**Why:** agent shells do not get pnpm on PATH (DEC-090); pnpm is reachable through corepack.

**How to apply:** before running gates, try `pnpm -v`; if missing, use `corepack pnpm <args>` or create a PATH shim. Do not treat command-not-found as a gate failure.
