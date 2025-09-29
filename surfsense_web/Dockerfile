## Multi-stage production Dockerfile for Next.js app

# --- builder ---
FROM node:20-alpine AS builder
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Copy config/docs inputs needed for postinstall step
COPY source.config.ts ./
COPY content ./content

# Install all deps (skip postinstall), then run postinstall explicitly
RUN pnpm install --frozen-lockfile --ignore-scripts \
    && pnpm fumadocs-mdx

# Copy source and build
COPY . .
RUN pnpm build


# --- runner ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

# Install pnpm and only production deps
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Copy built artifacts
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["pnpm", "start"]