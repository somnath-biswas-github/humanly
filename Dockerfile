FROM node:20-alpine AS base
WORKDIR /app

# ── Install dependencies ───────────────────────────────────────────────────
FROM base AS deps
COPY package*.json ./
RUN npm ci --frozen-lockfile

# ── Build ─────────────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── Production image ──────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install only production dependencies
COPY package*.json ./
RUN npm ci --frozen-lockfile --omit=dev

# Copy built assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/shared ./shared

# Uploads volume mount point
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads

# Run as non-root
USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

CMD ["node", "dist/index.js"]
