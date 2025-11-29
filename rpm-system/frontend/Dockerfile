# Build stage
FROM node:18-alpine as build

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Accept build argument for API URL
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

# Build with error handling
RUN npm run build || (echo "Build failed!" && exit 1)

# Verify build output
RUN if [ ! -d /app/dist ] || [ ! -f /app/dist/index.html ]; then \
      echo "ERROR: Build output is missing or incomplete!" && \
      ls -la /app/ && \
      ls -la /app/dist/ 2>/dev/null || echo "dist directory does not exist" && \
      exit 1; \
    fi

# Production stage
FROM nginx:alpine

# Install wget for healthcheck
RUN apk add --no-cache wget

COPY --from=build /app/dist /usr/share/nginx/html

# Verify build output exists
RUN if [ ! -f /usr/share/nginx/html/index.html ]; then \
      echo "ERROR: index.html not found in build output!" && \
      ls -la /usr/share/nginx/html/ && \
      exit 1; \
    fi

COPY nginx.conf /etc/nginx/conf.d/default.conf

# Test nginx configuration
RUN nginx -t

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
