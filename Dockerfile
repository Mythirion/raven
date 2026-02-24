# syntax=docker/dockerfile:1.7

FROM oven/bun:1 AS bunbin

FROM node:20-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY --from=bunbin /usr/local/bin/bun /usr/local/bin/bun
COPY --from=bunbin /usr/local/bin/bunx /usr/local/bin/bunx
COPY package.json ./
RUN bun install

FROM base AS builder
COPY --from=bunbin /usr/local/bin/bun /usr/local/bin/bun
COPY --from=bunbin /usr/local/bin/bunx /usr/local/bin/bunx
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NITRO_PORT=3000
ENV NITRO_HOST=0.0.0.0

RUN groupadd --system raven && useradd --system --gid raven --home-dir /app raven

COPY --from=bunbin /usr/local/bin/bun /usr/local/bin/bun
COPY --from=bunbin /usr/local/bin/bunx /usr/local/bin/bunx
COPY --from=builder /app/.output ./.output
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/nuxt.config.ts ./nuxt.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/src ./src

RUN chmod +x /app/src/docker/entrypoint.sh && mkdir -p /data/attachments && chown -R raven:raven /app /data

USER raven

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/ops/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["/app/src/docker/entrypoint.sh"]
