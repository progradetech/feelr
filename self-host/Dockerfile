# Feelr Self-Hosted -- Multi-stage Docker build
#
# Stage 1 (builder): Build dashboard static export + gateway esbuild bundle
# Stage 2 (runtime): Minimal Debian image with workerd + s6-overlay
#
# Usage:
#   docker build -t feelr/feelr .    (from self-host/ directory)
#   docker compose up
#
# The final image contains:
#   - workerd (Cloudflare Workers runtime)
#   - s6-overlay v3 (process supervisor)
#   - Bundled gateway JS (apps/gateway/dist/self-hosted-entry.js)
#   - Dashboard static files (apps/dashboard/out/)
#   - Configuration templates and s6 service definitions

# ---------------------------------------------------------------------------
# Stage 1: Builder -- Node.js to build dashboard + bundle gateway
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /build

# Copy workspace config files first for layer caching
COPY package.json ./package.json
COPY pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY pnpm-lock.yaml ./pnpm-lock.yaml
COPY turbo.json ./turbo.json

# Copy package.json files for all workspace packages
COPY apps/gateway/package.json ./apps/gateway/package.json
COPY apps/dashboard/package.json ./apps/dashboard/package.json
COPY packages/tsconfig/package.json ./packages/tsconfig/package.json
COPY packages/connector-sdk/package.json ./packages/connector-sdk/package.json
COPY connectors/github/package.json ./connectors/github/package.json
COPY connectors/slack/package.json ./connectors/slack/package.json
COPY connectors/stripe/package.json ./connectors/stripe/package.json
COPY connectors/discord/package.json ./connectors/discord/package.json

# Install dependencies (lockfile-only for reproducibility)
RUN pnpm install --frozen-lockfile

# Copy full source
COPY apps/ ./apps/
COPY packages/ ./packages/
COPY connectors/ ./connectors/

# Build dashboard static export (output: apps/dashboard/out/)
RUN cd apps/dashboard && npx next build

# Install esbuild for gateway bundling and workerd for runtime extraction
RUN pnpm add -w -D esbuild workerd

# Bundle gateway for self-hosted workerd
# --external:cloudflare:workers leaves the import for workerd runtime resolution
RUN pnpm exec esbuild apps/gateway/src/self-hosted-entry.ts \
    --bundle \
    --outfile=apps/gateway/dist/self-hosted-entry.js \
    --format=esm \
    --platform=neutral \
    --target=esnext \
    --main-fields=module,main \
    --external:cloudflare:workers \
    --minify

# Extract workerd native binary to a known location for the runtime stage
RUN cp "$(find /build/node_modules -name 'workerd' -path '*/workerd-linux-64/bin/*' -o -name 'workerd' -path '*/workerd-linux-arm64/bin/*' | head -1)" /build/workerd-bin \
    && chmod +x /build/workerd-bin

# ---------------------------------------------------------------------------
# Stage 2: Runtime -- Minimal image with workerd + s6-overlay
# ---------------------------------------------------------------------------
FROM debian:bookworm-slim AS runtime

# s6-overlay version
ARG S6_OVERLAY_VERSION=3.2.0.2

# Install s6-overlay v3
ADD https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz /tmp/
ADD https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-x86_64.tar.xz /tmp/
RUN apt-get update && apt-get install -y --no-install-recommends \
    xz-utils \
    ca-certificates \
    wget \
    && tar -C / -Jxpf /tmp/s6-overlay-noarch.tar.xz \
    && tar -C / -Jxpf /tmp/s6-overlay-x86_64.tar.xz \
    && rm -f /tmp/s6-overlay-*.tar.xz \
    && apt-get purge -y xz-utils \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Copy workerd binary from builder (installed via npm with Node 22 which handles platform deps)
COPY --from=builder /build/workerd-bin /usr/local/bin/workerd

# Create application directories
RUN mkdir -p /app /opt/feelr/dashboard /data/feelr/do /etc/feelr

# Copy built artifacts from builder stage
# Place gateway bundle next to config.capnp so workerd embed resolves it
COPY --from=builder /build/apps/gateway/dist/self-hosted-entry.js /etc/feelr/dist/self-hosted-entry.js
COPY --from=builder /build/apps/dashboard/out/ /opt/feelr/dashboard/

# Copy workerd configuration
# embed path "./dist/self-hosted-entry.js" resolves relative to config.capnp location
COPY self-host/config.capnp /etc/feelr/config.capnp

# Copy s6-overlay service definitions
COPY self-host/s6/s6-rc.d/ /etc/s6-overlay/s6-rc.d/
COPY self-host/s6/cont-init.d/ /etc/cont-init.d/

# Copy config templates
COPY self-host/feelr.yaml.template /etc/feelr/feelr.yaml.template
COPY self-host/env.template /etc/feelr/env.template

# Make all scripts executable
RUN find /etc/s6-overlay/s6-rc.d -name 'run' -exec chmod +x {} \; \
    && find /etc/s6-overlay/s6-rc.d -name 'finish' -exec chmod +x {} \; \
    && find /etc/cont-init.d -name '*.sh' -exec chmod +x {} \;

# Health check: gateway /health endpoint on port 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
    CMD wget -q --spider http://localhost:8080/health || exit 1

EXPOSE 8080

# Data volume for persistent storage (DO SQLite, config)
VOLUME /data/feelr

# s6-overlay as init system
ENTRYPOINT ["/init"]
