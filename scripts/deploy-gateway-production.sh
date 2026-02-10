#!/usr/bin/env bash
# =============================================================================
# Feelr Gateway -- Production Deployment Script (Gradual Rollout)
#
# PURPOSE:
#   Deploy the Feelr gateway to the Cloudflare Workers production environment
#   using gradual rollout (10% canary -> health check -> 100% promotion).
#   Mirrors the CI/CD pipeline in .github/workflows/gateway.yml.
#
# USAGE:
#   ./scripts/deploy-gateway-production.sh
#
# WARNING:
#   CI/CD via .github/workflows/gateway.yml is the PRIMARY deployment mechanism.
#   Use this script only for emergencies or when CI/CD is unavailable.
#   Manual deploys bypass PR review gates, environment approval, and audit trails.
#
# DURABLE OBJECT MIGRATION NOTE:
#   If wrangler.toml has NEW [[migrations]] entries (new DO classes or renamed
#   classes), `versions upload` will FAIL. In that case, you MUST use:
#     cd apps/gateway && npx wrangler deploy --env production
#   This is a known Cloudflare constraint. Gradual rollout is not available
#   for releases that include DO schema changes.
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

if ! command -v jq >/dev/null 2>&1; then
  error "jq is not installed. Install it with: sudo apt install jq (or brew install jq)"
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
# Step 2: Upload new version (without deploying)
# ---------------------------------------------------------------------------

info "Step 2: Uploading new version..."

# `versions upload` creates a new version but does NOT route traffic to it.
# This enables the gradual rollout pattern: upload -> canary -> promote.
cd "$GATEWAY_DIR"

# Build the wrangler command with optional tag/message metadata
UPLOAD_CMD="npx wrangler versions upload --env production"

if [ -n "$GIT_TAG" ]; then
  UPLOAD_CMD="$UPLOAD_CMD --tag $GIT_TAG --message \"Release $GIT_TAG\""
fi

eval "$UPLOAD_CMD"

success "Version uploaded"

# ---------------------------------------------------------------------------
# Step 3: Extract the version ID of the upload we just created
# ---------------------------------------------------------------------------

info "Step 3: Getting version ID..."

# List versions for the production worker and grab the most recent one (index 0).
# The --json flag returns a JSON array sorted by creation time (newest first).
VERSION_ID=$(npx wrangler versions list --env production --json --name feelr-gateway-production | jq -r '.[0].id')

if [ -z "$VERSION_ID" ] || [ "$VERSION_ID" = "null" ]; then
  error "Failed to extract version ID from versions list"
  error "You may need to check wrangler versions list --env production manually"
  exit 1
fi

success "Version ID: $VERSION_ID"

# ---------------------------------------------------------------------------
# Step 4: Deploy at 10% (canary phase)
# ---------------------------------------------------------------------------

info "Step 4: Deploying at 10% (canary)..."

# Route 10% of production traffic to the new version. The remaining 90% continues
# on the current version. This limits blast radius if the new version has issues.
npx wrangler versions deploy "${VERSION_ID}@10%" --env production --yes \
  --message "Canary at 10%"

success "Canary deployed at 10%"

# ---------------------------------------------------------------------------
# Step 5: Health check at 10%
# ---------------------------------------------------------------------------

info "Step 5: Running health check..."

PRODUCTION_URL="https://api.feelr.dev/health"

# More retries than staging because only 10% of traffic hits the new version,
# so we may need multiple attempts to hit the canary.
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
    error "The canary at 10% may be unhealthy. Consider rolling back:"
    error "  ./scripts/rollback-gateway.sh --env production"
    exit 1
  fi

  ATTEMPT=$((ATTEMPT + 1))
  sleep 10
done

# ---------------------------------------------------------------------------
# Step 6: Promote to 100% (full rollout)
# ---------------------------------------------------------------------------

info "Step 6: Promoting to 100%..."

# Route all production traffic to the new version. This completes the deployment.
npx wrangler versions deploy "${VERSION_ID}@100%" --env production --yes \
  --message "Release ${GIT_TAG:-manual} at 100%"

success "Full rollout complete"

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

printf '\n'
success "Production deployment complete!"
printf '\n'
printf '  Production URL: https://api.feelr.dev\n'
printf '  Version ID:     %s\n' "$VERSION_ID"
if [ -n "$GIT_TAG" ]; then
  printf '  Git tag:        %s\n' "$GIT_TAG"
fi
printf '\n'
