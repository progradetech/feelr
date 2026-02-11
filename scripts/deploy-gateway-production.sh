#!/usr/bin/env bash
# =============================================================================
# Feelr Gateway -- Production Deployment Script
#
# PURPOSE:
#   Deploy the Feelr gateway to the Cloudflare Workers production environment
#   using direct deploy + health check. Mirrors the CI/CD pipeline in
#   .github/workflows/gateway.yml.
#
# USAGE:
#   ./scripts/deploy-gateway-production.sh
#
# WARNING:
#   CI/CD via .github/workflows/gateway.yml is the PRIMARY deployment mechanism.
#   Use this script only for emergencies or when CI/CD is unavailable.
#   Manual deploys bypass PR review gates, environment approval, and audit trails.
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

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
GATEWAY_DIR="$REPO_ROOT/apps/gateway"

# ---------------------------------------------------------------------------
# Prerequisite checks
# ---------------------------------------------------------------------------

info "Checking prerequisites..."

if ! command -v pnpm >/dev/null 2>&1; then
  error "pnpm is not installed. Install it with: npm install -g pnpm"
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  error "npx is not available. Ensure Node.js is installed."
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  error "curl is not installed."
  exit 1
fi

if [ ! -d "$GATEWAY_DIR" ]; then
  error "Gateway directory not found at $GATEWAY_DIR"
  exit 1
fi

if [ ! -f "$GATEWAY_DIR/wrangler.toml" ]; then
  error "wrangler.toml not found at $GATEWAY_DIR/wrangler.toml"
  exit 1
fi

success "All prerequisites met"

# ---------------------------------------------------------------------------
# Confirmation prompt -- PRODUCTION is destructive, require explicit consent
# ---------------------------------------------------------------------------

printf '\n'
printf '\033[1;31m  !!  PRODUCTION DEPLOYMENT  !!\033[0m\n'
printf '\n'
warn "This will deploy to PRODUCTION (https://api.feelr.dev)."
warn "CI/CD is the primary deployment path. Use this script only when needed."
printf '\n'

# Determine git tag for version metadata (optional but useful for traceability)
GIT_TAG=""
if command -v git >/dev/null 2>&1; then
  GIT_TAG=$(git -C "$REPO_ROOT" describe --tags --exact-match 2>/dev/null || echo "")
fi

if [ -n "$GIT_TAG" ]; then
  info "Detected git tag: $GIT_TAG"
else
  warn "No git tag detected. Consider tagging the release first (e.g., git tag v1.2.3)"
fi

printf 'Type "yes" to continue: '
read -r CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  error "Deployment cancelled."
  exit 1
fi

printf '\n'

# ---------------------------------------------------------------------------
# Step 1: Install dependencies
# ---------------------------------------------------------------------------

info "Step 1: Installing dependencies..."

cd "$REPO_ROOT"
pnpm install --frozen-lockfile

success "Dependencies installed"

# ---------------------------------------------------------------------------
# Step 2: Deploy to production
# ---------------------------------------------------------------------------

info "Step 2: Deploying to production..."

cd "$GATEWAY_DIR"
npx wrangler deploy --env production

success "Deployed to production"

# ---------------------------------------------------------------------------
# Step 3: Health check
# ---------------------------------------------------------------------------

info "Step 3: Running health check..."

PRODUCTION_URL="https://api.feelr.dev/health"

MAX_ATTEMPTS=5
ATTEMPT=1

while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
  info "Health check attempt $ATTEMPT/$MAX_ATTEMPTS: $PRODUCTION_URL"

  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$PRODUCTION_URL" 2>/dev/null || echo "000")

  if [ "$HTTP_STATUS" = "200" ]; then
    success "Health check passed (HTTP $HTTP_STATUS)"
    break
  fi

  warn "Health check returned HTTP $HTTP_STATUS"

  if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    error "Health check failed after $MAX_ATTEMPTS attempts"
    error "Consider rolling back: ./scripts/rollback-gateway.sh --env production"
    exit 1
  fi

  ATTEMPT=$((ATTEMPT + 1))
  sleep 10
done

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

printf '\n'
success "Production deployment complete!"
printf '\n'
printf '  Production URL: https://api.feelr.dev\n'
if [ -n "$GIT_TAG" ]; then
  printf '  Git tag:        %s\n' "$GIT_TAG"
fi
printf '\n'
