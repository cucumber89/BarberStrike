# BARBERSTRIKE — the whole game in one image: the Colyseus server AND the built client, served
# from the same process on one port (see apps/server/src/hosting.ts for why it has to be one
# origin). This is the image for Hugging Face Spaces, Fly.io, Render, Railway or any VPS.
#
#   docker build -t barberstrike .
#   docker run -p 2567:2567 barberstrike            # open http://localhost:2567
#
# PORT is read at runtime (Hugging Face Spaces sets 7860; Fly/Render set their own). The client
# talks to the origin it was loaded from, so nothing else needs configuring.
#
# Node 22, not 20: @colyseus/core 0.18 references the global `WebSocket` (reconnection path),
# which only exists unflagged from Node 22.

# ---- deps: workspace manifests only, so the layer is cached until a lockfile changes
FROM node:22-alpine AS deps
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# No TTY in a build: without this pnpm refuses to purge node_modules for the --prod re-install
# below (ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY — the first Render deploy died on it).
ENV CI=true
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

# ---- build: server bundle (dist/index.js) + static client (dist/, unused models pruned)
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY apps/client apps/client
RUN pnpm --filter @frankibarber/server build && pnpm --filter @frankibarber/client build

# ---- prod deps: same lockfile, production only, server workspace only
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
COPY --from=build /app/apps/client/dist ./apps/client/dist
USER node
EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null || exit 1
CMD ["node", "apps/server/dist/index.js"]
