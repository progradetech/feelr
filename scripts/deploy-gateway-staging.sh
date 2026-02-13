#!/usr/bin/env bash
# =============================================================================
# Feelr Gateway -- Staging Deployment Script
#
# PURPOSE:
#   Deploy the Feelr gateway to the Cloudflare Workers staging environment.
#   This is a manual fallback for when CI/CD (GitHub Actions gateway.yml) is
#   unavailable or for first-time setup.
#
# USAGE:
#   ./scripts/deploy-gateway-staging.sh
#
# WARNING:
#   CI/CD via .github/workflows/gateway.yml is the PRIMARY deployment mechanism.
#   Use this script only for emergencies, debugging, or initial setup.
#   Manual deploys bypass PR review gates and audit trails.
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Color output helpers (matches self-host/init.sh style)
# ---------------------------------------------------------------------------

info() {
  printf '\033[1;34m==>\033[0m %s\n' "$1"
}

success() {
  printf '\033[1;32m==>\033[0m %s\n' "$1"
}

warn() {
  printf '\033[1;33m==>\033[0m %s\n' "$1"
}

error() {
  printf '\033[1;31mError:\033[0m %s\n' "$1" >&2
}

# ---------------------------------------------------------------------------
# Resolve repository root
# ---------------------------------------------------------------------------

# Navigate to repository root regardless of where the script is invoked from
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
GATEWAY_DIR="$REPO_ROOT/apps/gateway"

# ---------------------------------------------------------------------------
# Prerequisite checks
# ---------------------------------------------------------------------------

info "Checking prerequisites..."

# pnpm is required for dependency installation
if ! command -v pnpm >/dev/null 2>&1; then
  error "pnpm is not installed. Install it with: npm install -g pnpm"
  exit 1
fi

# wrangler is required for Cloudflare Workers deployment
if ! command -v npx >/dev/null 2>&1; then
  error "npx is not available. Ensure Node.js is installed."
  exit 1
fi

# Verify the gateway directory exists (sanity check for repo structure)
if [ ! -d "$GATEWAY_DIR" ]; then
  error "Gateway directory not found at $GATEWAY_DIR"
  error "Are you running this from the Feelr repository root?"
  exit 1
fi

# Verify wrangler.toml exists (needed for deployment configuration)
if [ ! -f "$GATEWAY_DIR/wrangler.toml" ]; then
  error "wrangler.toml not found at $GATEWAY_DIR/wrangler.toml"
  exit 1
fi

success "All prerequisites met"

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------

printf '\n'
printf '\033[1m  Feelr Gateway -- Staging Deploy\033[0m\n'
printf '  ================================\n'
printf '\n'
warn "CI/CD is the primary deployment path. Use this script only when needed."
printf '\n'

# ---------------------------------------------------------------------------
# Step 1: Install dependencies
# ---------------------------------------------------------------------------

info "Step 1: Installing dependencies..."

# Install all workspace dependencies (frozen lockfile ensures reproducible builds)
cd "$REPO_ROOT"
pnpm install --frozen-lockfile

success "Dependencies installed"

# ---------------------------------------------------------------------------
# Step 2: Deploy to staging
# ---------------------------------------------------------------------------

info "Step 2: Deploying to Cloudflare Workers (staging)..."

# Deploy using wrangler with the staging environment configuration
# This uses env.staging from wrangler.toml which enables workers_dev URL
cd "$GATEWAY_DIR"
npx wrangler deploy --env staging

success "Deployed to staging"

# ---------------------------------------------------------------------------
# Step 3: Health check
# ---------------------------------------------------------------------------

info "Step 3: Running health check..."

# The staging URL follows the pattern: <worker-name>-staging.<subdomain>.workers.dev
# We use the known staging URL from wrangler.toml / gateway.yml
STAGING_URL="https://feelr-gateway-staging.feelr.workers.dev/health"

# Retry up to 3 times with 5-second delays (staging may need a moment to propagate)
MAX_ATTEMPTS=3
ATTEMPT=1

while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
  info "Health check attempt $ATTEMPT/$MAX_ATTEMPTS: $STAGING_URL"

  # Use curl with a 10-second timeout; capture HTTP status code
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$STAGING_URL" 2>/dev/null || echo "000")

  if [ "$HTTP_STATUS" = "200" ]; then
    success "Health check passed (HTTP $HTTP_STATUS)"
    break
  fi

  warn "Health check returned HTTP $HTTP_STATUS"

  if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    error "Health check failed after $MAX_ATTEMPTS attempts"
    error "The deploy may still be propagating. Check manually: curl $STAGING_URL"
    exit 1
  fi

  ATTEMPT=$((ATTEMPT + 1))
  sleep 5
done

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

printf '\n'
success "Staging deployment complete!"
printf '\n'
printf '  Staging URL: https://feelr-gateway-staging.feelr.workers.dev\n'
printf '  Health:      %s\n' "$STAGING_URL"
printf '\n'
