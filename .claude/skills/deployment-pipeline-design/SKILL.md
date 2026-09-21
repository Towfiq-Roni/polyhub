---
name: deployment-pipeline-design
description: Design multi-stage CI/CD pipelines with approval gates, security checks, and deployment orchestration. Use when designing or debugging hub's GitHub Actions workflows (ci.yml/deploy.yml/keepalive.yml), rollout/rollback strategy, health-check depth, or deployment gates. Adapted from wshobson/agents deployment-pipeline-design.
license: MIT
---

> Vendored from [wshobson/agents](https://github.com/wshobson/agents) `plugins/cicd-automation/skills/deployment-pipeline-design/` — references kept in `references/`. Hub overrides at bottom win.

# Deployment Pipeline Design

Architecture patterns for multi-stage CI/CD pipelines with approval gates, deployment strategies, and environment promotion workflows.

## Purpose

Design robust, secure deployment pipelines that balance speed with safety through proper stage organization, automated quality gates, and progressive delivery strategies. Covers both structural pipeline architecture and operational patterns for reliable production deployments.

## What You Provide / What This Produces

**Provide:** app type · deployment target · environment topology · rollout requirements · gate constraints · monitoring sources.
**Produces:** stage definitions & caching strategy · rollout pattern with config · health-check setup (shallow vs deep) · gate definitions · rollback plan.

## When to Use

- Design CI/CD architecture for a new service or platform migration
- Implement deployment gates between environments
- Configure pipelines with mandatory security scanning
- Establish progressive delivery (canary / blue-green)
- Debug pipelines where stages succeed but production behavior is wrong
- Reduce MTTR by automating rollback on degradation

## Troubleshooting (high-value classics)

### Health check passes in pipeline but service is unhealthy
Shallow `/ping` returns 200 even when the database is down. Use a **deep readiness check** that verifies actual dependencies.

### Canary never promotes to 100%
Analysis needs a failure condition and `inconclusiveLimit` — fail fast instead of hanging. (K8s-specific; see hub notes.)

### Staging succeeds but production job never starts
Missing environment protection reviewers — approval gate waits silently. In GitHub Actions set **Settings → Environments → production → Required reviewers**.

### Docker cache busted every run
`COPY . .` before dependency install invalidates everything. Manifests first:
```dockerfile
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
```

### Rollback leaves migrations applied to old code
Keep migrations backward-compatible (additive) for ≥1 release cycle; destructive changes only after old code is fully retired everywhere.

## Advanced Topics
See [`references/advanced-strategies.md`](references/advanced-strategies.md) (platform configs, multi-region, DB-migration rollback strategies) and [`references/details.md`](references/details.md) (pattern details).

---

# Hub Adaptation (project-specific)

1. **Reality: ONE VM, ONE environment, docker-compose.** No staging env, no K8s/ECS/serverless, no traffic splitting. Canary/blue-green/multi-region patterns are **reference reading only** — do not build them here (ponytail: YAGNI at ≤5 users). Our equivalent of progressive delivery: smoke test (`/api/v1/health` + login 200) immediately after `compose up`, auto-rollback to `LAST_TAG` on failure.
2. **Deep health check is mandatory:** `/api/v1/health` must verify Postgres connectivity (`SELECT 1`) — not return blind 200. Pipeline smoke depends on it being truthful.
3. **Gates that apply:** PR = lint→typecheck→unit→e2e (ci.yml); main = images→GHCR→migrate deploy→up→smoke (deploy.yml); cron keepalive. Human "approval gate" = me approving the merge — do not add GitHub Environment reviewers unless asked.
4. **Migrations:** forward-only (`prisma migrate deploy`) per CLAUDE.md — the upstream undo-scripts pattern is superseded; destructive changes require a DEC entry and only after old code is gone from the VM.
5. **Docker layer-caching rule is binding** for our api/web Dockerfiles; multi-arch buildx must not defeat caching (use GHA cache mounts).
6. Workflow changes always pair with the `hub-deploy` skill ($0 constraints, secrets rules).
