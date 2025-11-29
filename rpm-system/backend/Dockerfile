# =============================================================================
# BACKEND DOCKERFILE - Node.js API Server
# Multi-stage build for optimized production image
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Dependencies
# -----------------------------------------------------------------------------
    FROM node:20-alpine AS deps
    WORKDIR /app
    
    # Install build dependencies for native modules
    RUN apk add --no-cache python3 make g++ libc6-compat
    
    # Copy package files
    COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
    
    # Install ALL dependencies (including devDependencies for build)
    RUN \
      if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
      elif [ -f package-lock.json ]; then npm ci; \
      elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i --frozen-lockfile; \
      else npm install; \
      fi
    
    # -----------------------------------------------------------------------------
    # Stage 2: Builder
    # -----------------------------------------------------------------------------
    FROM node:20-alpine AS builder
    WORKDIR /app
    
    # Copy dependencies
    COPY --from=deps /app/node_modules ./node_modules
    COPY . .
    
    # Build TypeScript (if applicable)
    RUN npm run build || true
    
    # Remove devDependencies for production
    RUN npm prune --production
    
    # -----------------------------------------------------------------------------
    # Stage 3: Production Runner
    # -----------------------------------------------------------------------------
    FROM node:20-alpine AS runner
    WORKDIR /app
    
    # Set production environment
    ENV NODE_ENV=production
    ENV PORT=3013
    
    # Install only runtime dependencies
    RUN apk add --no-cache dumb-init wget
    
    # Create non-root user
    RUN addgroup --system --gid 1001 nodejs && \
        adduser --system --uid 1001 nodeuser
    
    # Copy necessary files from builder
    COPY --from=builder --chown=nodeuser:nodejs /app/node_modules ./node_modules
    COPY --from=builder --chown=nodeuser:nodejs /app/dist ./dist
    COPY --from=builder --chown=nodeuser:nodejs /app/package.json ./package.json
    
    # If not using TypeScript, copy src directly:
    # COPY --from=builder --chown=nodeuser:nodejs /app/src ./src
    
    # Copy migration files if they exist
    COPY --from=builder --chown=nodeuser:nodejs /app/migrations ./migrations 2>/dev/null || true
    COPY --from=builder --chown=nodeuser:nodejs /app/prisma ./prisma 2>/dev/null || true
    
    USER nodeuser
    
    EXPOSE 3013
    
    # Health check
    HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
      CMD wget --no-verbose --tries=1 --spider http://localhost:3013/health || exit 1
    
    # Use dumb-init to handle PID 1 properly
    ENTRYPOINT ["dumb-init", "--"]
    
    # Start the application
    CMD ["node", "dist/index.js"]
    