# BARBERSTRIKE (ex FRANKIBARBER: AFTER HOURS) — game server image.
#
# Build from the WORKSPACE ROOT (frankibarber/), not from apps/server:
#   docker build -f apps/server/Dockerfile -t frankibarber-server .
#   docker run -p 2567:2567 -e CORS_ORIGIN=https://play.example.com frankibarber-server
#
# Node 22 (not 20): @colyseus/core 0.18 references the global `WebSocket` (reconnection path),
# which only exists unflagged from Node 22. Everything else works on 20.

# ---- deps: workspace manifests only, so the layer is cached until a lockfile changes
FROM node:22-alpine AS deps
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @frankibarber/server...

# ---- build: bundle src + inlined @frankibarber/shared into dist/index.js
FROM deps AS build
COPY packages/shared/src packages/shared/src
COPY packages/shared/tsconfig.json packages/shared/
COPY apps/server/src apps/server/src
COPY apps/server/build.mjs apps/server/tsconfig.json apps/server/
RUN pnpm --filter @frankibarber/server build

# ---- prod deps: same lockfile, production only (no esbuild/tsx/vitest)
FROM deps AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter @frankibarber/server...

# ---- runtime
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=2567
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=prod-deps /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/apps/server/dist ./apps/server/dist
USER node
EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null || exit 1
CMD ["node", "apps/server/dist/index.js"]
