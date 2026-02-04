# Use Node.js 20 LTS to build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage with Node.js
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy the built application
COPY --from=builder /app/build ./build

# Create user_media directory and set permissions
RUN mkdir -p ./build/client/user_media && chown -R node:node ./build

# Switch to non-root user
USER node

# Set environment variable for larger body size limit (50MB for video uploads)
ENV BODY_SIZE_LIMIT=52428800

# Expose the port the app runs on
EXPOSE 3000

# Start the SvelteKit server
CMD ["node", "build/index.js"]