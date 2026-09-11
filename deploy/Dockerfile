# BARBERSTRIKE — jeden obraz: zbudowany klient + serwer gry w jednym procesie.
#
# WDROŻENIE — to jest komenda, która podmienia działającą grę (z katalogu workspace):
#   git pull
#   docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build
#
# NIE `docker build`. Samo `docker build -t barberstrike .` buduje obraz i na tym kończy: nie
# zatrzymuje kontenera, nie startuje nowego i nie nazywa obrazu tak, jak nazywa go compose — więc
# `git pull` + `docker build` zostawia na serwerze dokładnie tę wersję, która działała wcześniej.
# Zdarzyło się to dwa razy, stąd ten komentarz. Pełna instrukcja: deploy/DEPLOY.md §"Aktualizacja".
#
# Sam build (bez wdrożenia), jeśli chcesz tylko sprawdzić, czy obraz się składa:
#   docker build -f deploy/Dockerfile --build-arg VITE_SERVER_URL=wss://barberstrike.click -t barberstrike .
#
# Różnica wobec apps/server/Dockerfile: tamten budował sam serwer, więc kontener nie miał czego
# serwować pod "/" i grę trzeba by hostować osobno. Tu klient ląduje w obrazie, serwer znajduje go
# przez BS_CLIENT_DIR i strona oraz WebSocket są tym samym originem — zero CORS, zero mixed content.
#
# Node 22 (nie 20): @colyseus/core 0.18 sięga po globalny `WebSocket` w ścieżce reconnectu.

# ---- deps: same manifesty, więc warstwa trzyma się cache'u do zmiany lockfile'a
FROM node:22-alpine AS deps
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
COPY packages/shared/package.json packages/shared/
COPY packages/skins/package.json packages/skins/
RUN pnpm install --frozen-lockfile

# ---- build: klient (vite) + serwer (esbuild, shared inlined)
FROM deps AS build
ARG VITE_SERVER_URL=""
ENV VITE_SERVER_URL=$VITE_SERVER_URL
ENV NODE_OPTIONS=--max-old-space-size=2048
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/skins packages/skins
COPY apps/server/src apps/server/src
COPY apps/server/build.mjs apps/server/tsconfig.json apps/server/
COPY apps/client apps/client
RUN pnpm --filter @frankibarber/client build \
 && pnpm --filter @frankibarber/server build

# ---- prod deps: ten sam lockfile, bez vite/esbuild/vitest
FROM deps AS prod-deps
# CI=true: ta warstwa przechodzi z pełnego node_modules na produkcyjne, więc pnpm chce najpierw
# wyczyścić katalog — a bez terminala pyta o zgodę i przerywa (ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY).
ENV CI=true
RUN pnpm install --frozen-lockfile --prod --filter @frankibarber/server...

# ---- runtime
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=2567
# Serwer sam szuka klienta obok siebie, ale w obrazie układ katalogów jest inny niż w repo,
# więc wskazujemy go wprost — inaczej wystartuje bez strony i "/" zwróci 404.
ENV BS_CLIENT_DIR=/app/client
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=prod-deps /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/client/dist ./client
USER node
EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null || exit 1
CMD ["node", "apps/server/dist/index.js"]
