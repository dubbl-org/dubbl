# =============================================================================
# Dubbl — Production Dockerfile (multi-stage)
# =============================================================================

# --- Base ---
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# --- Dependencies ---
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# --- Build ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects telemetry by default - disable it
ENV NEXT_TELEMETRY_DISABLED=1

# Dummy build-time values so modules that init at import don't crash
ARG DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ARG AUTH_SECRET="build-secret"
ARG STRIPE_SECRET_KEY="sk_test_placeholder"
ARG STRIPE_WEBHOOK_SECRET="whsec_placeholder"
ENV DATABASE_URL=$DATABASE_URL
ENV AUTH_SECRET=$AUTH_SECRET
ENV STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY
ENV STRIPE_WEBHOOK_SECRET=$STRIPE_WEBHOOK_SECRET

RUN pnpm build

# --- Production ---
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
