#!/usr/bin/env bash
# Deploy hub-prod: pull -> migrate deploy -> up -d -> smoke -> rollback on failure.
#
# Runs from /opt/hub on the VM (cwd). CI (TASKS.md #43) stages the repo
# preserving the infra/ prefix -- /opt/hub/infra/docker-compose.yml,
# /opt/hub/infra/docker-compose.prod.yml, /opt/hub/infra/.env.prod -- the
# same layout as this repo, so this invocation matches the Makefile's
# COMPOSE_PROD exactly (-f infra/... --env-file infra/.env.prod
# --project-directory .). This must stay in lockstep with
# infra/docker-compose.prod.yml's `env_file: infra/.env.prod` (env_file is a
# separate mechanism from --env-file and is not affected by it -- both must
# independently point at the same path). Never run `prisma migrate deploy`
# on container boot -- always this explicit step.
set -euo pipefail

if [ -z "${IMAGE_TAG:-}" ]; then
  echo "ERROR: IMAGE_TAG env var is required (the image tag to deploy)." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE=(docker compose -p hub-prod -f infra/docker-compose.yml -f infra/docker-compose.prod.yml --env-file infra/.env.prod --project-directory .)

echo "Deploying IMAGE_TAG=${IMAGE_TAG}"

"${COMPOSE[@]}" pull
# --no-install: use the image's own version-pinned `prisma` CLI (a runtime
# dependency of apps/api, see apps/api/package.json) and fail loudly if it's
# somehow missing, instead of npx silently auto-fetching registry `latest`
# (which can drift ahead of this repo's Prisma-6-style schema.prisma).
"${COMPOSE[@]}" run --rm api npx --no-install prisma migrate deploy
"${COMPOSE[@]}" up -d

if ! "${SCRIPT_DIR}/smoke.sh"; then
  echo "Smoke check FAILED for IMAGE_TAG=${IMAGE_TAG}." >&2
  if [ -f .last_tag ]; then
    PREVIOUS_TAG="$(cat .last_tag)"
    echo "Rolling back to previous IMAGE_TAG=${PREVIOUS_TAG}." >&2
    IMAGE_TAG="${PREVIOUS_TAG}" "${COMPOSE[@]}" up -d
  else
    echo "No .last_tag on record -- nothing to roll back to." >&2
  fi
  exit 1
fi

echo "${IMAGE_TAG}" > .last_tag
echo "Deploy OK, IMAGE_TAG=${IMAGE_TAG} recorded in .last_tag"
