# syntax=docker/dockerfile:1
# Build context MUST be the repo root (pnpm workspace — apps/api alone
# cannot `pnpm install`), e.g.:
#   docker build -f apps/api/Dockerfile -t hub-api:test .

FROM node:22-alpine AS base
# Node 20.x here (any 20.x patch, alpine or glibc/slim alike) segfaults
# (SIGSEGV, exit 139) loading argon2's own bundled prebuilt native addon —
# verified directly: `require()`-ing prebuilds/linux-x64/argon2.{glibc,musl}.node
# crashes under node:20-alpine and node:20-slim but loads cleanly under
# node:22-alpine/-slim and node:24. That crash is *why* the previous fix
# needed a from-source compile at all (node-gyp-build's own install-time
# self-test fails the same way, so it falls back to `node-gyp rebuild`,
# which then depended on a flaky mid-build fetch of Node headers). Bumping
# the base image (repo's `package.json` only requires Node >=20, so this is
# in-range) makes argon2's shipped prebuilt binary load directly — no
# node-gyp, no compile toolchain, no network fetch mid-build, ever.
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @hub/api... run build
RUN pnpm --filter @hub/api exec prisma generate

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo/package.json /repo/pnpm-workspace.yaml /repo/pnpm-lock.yaml ./
COPY --from=build /repo/apps/api/package.json apps/api/package.json
COPY --from=build /repo/packages/shared packages/shared
COPY --from=build /repo/apps/api/prisma apps/api/prisma
RUN pnpm install --frozen-lockfile --prod --filter @hub/api...
COPY --from=build /repo/apps/api/dist apps/api/dist
# `prisma generate`'s output (the generated client + native query-engine
# binary) lands inside pnpm's hashed virtual store, not a fixed
# apps/api/node_modules/.prisma path (pnpm hoists/symlinks per workspace,
# it doesn't flatten node_modules like npm) — the hash is identical here
# to the build stage's because both installed from the same lockfile, but
# it's still resolved at build time rather than hardcoded so a lockfile
# change can't silently go stale.
RUN --mount=type=bind,from=build,source=/repo/node_modules/.pnpm,target=/tmp/build-pnpm \
    src="$(find /tmp/build-pnpm -maxdepth 1 -iname '@prisma+client@*' -type d)/node_modules/.prisma" && \
    dst="$(find node_modules/.pnpm -maxdepth 1 -iname '@prisma+client@*' -type d)/node_modules/.prisma" && \
    rm -rf "$dst" && cp -r "$src" "$dst"

WORKDIR /repo/apps/api
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O- http://localhost:${PORT:-4000}/api/v1/health || exit 1

CMD ["node", "dist/main.js"]

FROM deps AS dev
WORKDIR /repo/apps/api
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O- http://localhost:${PORT:-4000}/api/v1/health || exit 1
# `dev` deliberately has no `COPY . .` — real source (incl. this stage's own
# prisma/schema.prisma) only exists once docker-compose.dev.yml's `.:/repo`
# bind mount is live at container start, which is what makes hot-reload
# work. So `prisma generate` can't run at image build time here (there's no
# schema to read yet) — it has to run in the start command, after the mount
# is live. This also means editing schema.prisma on the host and restarting
# (not rebuilding) the dev container regenerates the client — desirable,
# since dev iterates on the schema without a rebuild loop.
CMD ["sh", "-c", "pnpm exec prisma generate && pnpm start:dev"]
