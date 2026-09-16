FROM node:20-slim AS base

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
# Debian/glibc base — better-sqlite3's prebuilt binaries target glibc, so they
# actually load here (Alpine/musl made them fail at runtime with "Exec format
# error" / ERR_DLOPEN_FAILED even when the arch matched). Build tools stay as
# a fallback for any package without a matching prebuild.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# --- Build ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build args → env vars for Next.js build
ARG OPENAI_API_KEY
ARG YOUTUBE_API_KEY
ARG SITE_PASSWORD

ENV OPENAI_API_KEY=$OPENAI_API_KEY
ENV YOUTUBE_API_KEY=$YOUTUBE_API_KEY
ENV SITE_PASSWORD=$SITE_PASSWORD

RUN npm run build

# --- Production ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# Copy built app
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Native module (better-sqlite3) — Next standalone tracing sometimes misses .node files
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/bindings ./node_modules/bindings
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path

# Create data directory for local persistence
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
