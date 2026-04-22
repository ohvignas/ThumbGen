FROM node:20-alpine AS base

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- Build ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build args → env vars for Next.js build
ARG GEMINI_API_KEY
ARG IDEOGRAM_API_KEY
ARG NOTION_API_KEY
ARG YOUTUBE_API_KEY
ARG SITE_PASSWORD

ENV GEMINI_API_KEY=$GEMINI_API_KEY
ENV IDEOGRAM_API_KEY=$IDEOGRAM_API_KEY
ENV NOTION_API_KEY=$NOTION_API_KEY
ENV YOUTUBE_API_KEY=$YOUTUBE_API_KEY
ENV SITE_PASSWORD=$SITE_PASSWORD

RUN npm run build

# --- Production ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built app
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Create data directory for local persistence
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
