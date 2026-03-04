# Stage 1: Build Client
FROM docker.m.daocloud.io/node:20-alpine AS client-build

WORKDIR /app/client

# Use npmmirror for faster builds in China
RUN npm config set registry https://registry.npmmirror.com

# Copy dependency definitions
COPY client/package*.json ./

# Install dependencies (including devDependencies for build)
RUN npm ci

# Copy client source code
COPY client/ .

# Build the client
RUN npm run build

# Stage 2: Setup Server
FROM docker.m.daocloud.io/node:20-alpine AS server-build

WORKDIR /app/server

# Use npmmirror for faster builds in China
RUN npm config set registry https://registry.npmmirror.com

# Copy dependency definitions
COPY server/package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy server source code
COPY server/ .

# Stage 3: Final Production Image
FROM docker.m.daocloud.io/node:20-alpine

# Use npmmirror for faster builds in China (for apk if needed)
# RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# No extra packages needed for pure node runtime
# RUN apk --no-cache add ...

WORKDIR /app

# Copy built server node_modules and code
COPY --from=server-build /app/server /app/

# Copy built client assets to server's public directory
COPY --from=client-build /app/client/dist /app/public

# Create directory for persistent data
RUN mkdir -p /app/data && chown -R node:node /app/data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5002
ENV DATA_DIR=/app/data

# Switch to non-root user for security
USER node

# Expose the port
EXPOSE 5002

# Healthcheck using native Node.js script (saves space by avoiding curl)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD ["node", "healthcheck.js"]

# Start the application
CMD ["node", "index.js"]
