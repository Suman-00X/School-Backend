# syntax=docker/dockerfile:1.7
# One image for the API, the worker and one-off tasks (migrations, school onboarding).
#   docker build -t school-backend .
#   docker run --env-file .env school-backend                         # API
#   docker run --env-file .env school-backend node src/worker.js      # worker
#   docker run --env-file .env school-backend node scripts/migrate.js # migrations

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --ignore-scripts

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    STORAGE_LOCAL_DIR=/app/storage
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/*
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node migrations ./migrations
COPY --chown=node:node assets ./assets
RUN mkdir -p /app/storage && chown node:node /app/storage
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# tini forwards SIGTERM so the API drains connections on shutdown
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/server.js"]
