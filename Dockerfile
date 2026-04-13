# Multi-stage: build on Alpine+libc6-compat; runner is plain node:alpine. libc6-compat only for `next build` on musl.

FROM node:20-alpine3.20 AS build-base
RUN apk add --no-cache libc6-compat \
  || (sleep 3 && apk update && apk add --no-cache libc6-compat)

FROM build-base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM build-base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG PUBLIC_BASE_URL
ENV PUBLIC_BASE_URL=${PUBLIC_BASE_URL}
ARG ADMIN_TOKEN=__next_build_placeholder__
ENV ADMIN_TOKEN=${ADMIN_TOKEN}
ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Dev: compose mounts .:/app; keep node_modules in a named volume. Build: --target dev-runtime
FROM build-base AS dev-runtime
WORKDIR /app
ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json* ./
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 4405
CMD ["sh", "-c", "npm run dev -- --hostname 0.0.0.0 --port ${PORT:-4405}"]

# Production: standalone only (default stage for `docker build` / compose `web`).
FROM node:20-alpine3.20 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
