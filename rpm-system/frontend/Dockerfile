# =============================================================================
# FRONTEND DOCKERFILE - React + Vite (served via Nginx)
# Multi-stage build for optimized production image
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build
# -----------------------------------------------------------------------------
    FROM node:20-alpine AS builder
    WORKDIR /app
    
    # Install dependencies for native modules if needed
    RUN apk add --no-cache libc6-compat
    
    # Copy package files
    COPY package.json package-lock.json ./
    
    # Install dependencies (including devDependencies for build)
    RUN npm ci
    
    # Copy source code
    COPY . .
    
    # Copy nginx config files (needed for later stage)
    COPY docker/nginx/nginx.conf /tmp/nginx.conf
    COPY docker/nginx/default.conf /tmp/default.conf
    
    # Build arguments for environment variables (injected at build time for Vite)
    ARG VITE_API_URL
    ENV VITE_API_URL=${VITE_API_URL}
    
    # Build the application
    RUN npm run build
    
    # -----------------------------------------------------------------------------
    # Stage 2: Production with Nginx
    # -----------------------------------------------------------------------------
    FROM nginx:alpine AS runner
    
    # Install wget for health checks
    RUN apk add --no-cache wget
    
    # Remove default nginx config
    RUN rm /etc/nginx/conf.d/default.conf
    
    # Copy custom nginx config from builder stage
    COPY --from=builder /tmp/nginx.conf /etc/nginx/nginx.conf
    COPY --from=builder /tmp/default.conf /etc/nginx/conf.d/default.conf
    
    # Copy built static files from Vite build
    COPY --from=builder /app/dist /usr/share/nginx/html
    
    # Create non-root user for security (optional but recommended)
    RUN chown -R nginx:nginx /usr/share/nginx/html && \
        chown -R nginx:nginx /var/cache/nginx && \
        chown -R nginx:nginx /var/log/nginx && \
        touch /var/run/nginx.pid && \
        chown -R nginx:nginx /var/run/nginx.pid
    
    EXPOSE 3012
    
    # Health check
    HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
      CMD wget --no-verbose --tries=1 --spider http://localhost:3012/health || exit 1
    
    CMD ["nginx", "-g", "daemon off;"]
    