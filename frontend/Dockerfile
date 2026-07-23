# Lexion Frontend Dockerfile
# Nuxt 4 app (ssr: false) — but NOT purely static: server/api/youtube/search.get.ts
# is a real Nitro server route holding a server-only secret, so the runtime stage
# must run Nitro's Node server, not a static file server (nginx would drop that route).
#
# Build context must be the repo ROOT (see docker-compose.yml), not frontend/, because
# this is a pnpm workspace member and needs the root workspace manifests to install.

FROM node:22-slim AS builder

WORKDIR /app

RUN corepack enable

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY frontend ./frontend

RUN pnpm install --frozen-lockfile

WORKDIR /app/frontend
RUN pnpm build

FROM node:22-slim AS runtime

WORKDIR /app

ENV NITRO_PORT=3000 \
    NITRO_HOST=0.0.0.0

COPY --from=builder /app/frontend/.output ./.output

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
