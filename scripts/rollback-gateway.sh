#!/usr/bin/env bash
# =============================================================================
# Feelr Gateway -- Rollback Script
#
# PURPOSE:
#   Roll back the Feelr gateway to a previous version on Cloudflare Workers.
#   Lists recent versions and prompts for a version ID to roll back to.
#
# USAGE:
#   ./scripts/rollback-gateway.sh --env staging        # Roll back staging
#   ./scripts/rollback-gateway.sh --env production      # Roll back production
#   ./scripts/rollback-gateway.sh --env production --version <VERSION_ID>
#
# WARNING:
#   CI/CD via .github/workflows/gateway.yml is the PRIMARY deployment mechanism.
#   Use this script only for emergencies when a bad deploy needs immediate reversal.
#
# DURABLE OBJECT MIGRATION WARNING:
#   You CANNOT roll back across Durable Object migration boundaries.
#   If a release introduced new [[migrations]] entries in wrangler.toml (e.g., new
#   DO classes, renamed classes, or new SQLite classes), rolling back past that
#   release will fail or cause data inconsistency. Always check the migration
#   history before rolling back.
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
# Parse arguments
# ---------------------------------------------------------------------------

ENV=""
VERSION_ID=""

while [ $# -gt 0 ]; do
  case "$1" in
    --env)
      if [ -z "${2:-}" ]; then
        error "--env requires a value (staging or production)"
        exit 1
      fi
      ENV="$2"
      shift 2
      ;;
    --version)
      if [ -z "${2:-}" ]; then
        error "--version requires a version ID"
        exit 1
      fi
      VERSION_ID="$2"
      shift 2
      ;;
    --help|-h)
      printf 'Usage: %s --env staging|production [--version <VERSION_ID>]\n' "$0"
      printf '  --env      Target environment (required)\n'
      printf '  --version  Version ID to roll back to (optional, will prompt if not provided)\n'
      exit 0
      ;;
    *)
      error "Unknown argument: $1"
      exit 1
      ;;
  esac
done

# Environment is required for rollback (no safe default)
if [ -z "$ENV" ]; then
  error "--env is required (staging or production)"
  error "Usage: $0 --env staging|production [--version <VERSION_ID>]"
  exit 1
fi

if [ "$ENV" != "staging" ] && [ "$ENV" != "production" ]; then
  error "Invalid environment: $ENV (must be 'staging' or 'production')"
  exit 1
fi

# ---------------------------------------------------------------------------
# Prerequisite checks
# ---------------------------------------------------------------------------

info "Checking prerequisites..."

if ! command -v npx >/dev/null 2>&1; then
  error "npx is not available. Ensure Node.js is installed."
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  error "jq is not installed. Install it with: sudo apt install jq (or brew install jq)"
  exit 1
fi

if [ ! -d "$GATEWAY_DIR" ]; then
  error "Gateway directory not found at $GATEWAY_DIR"
  exit 1
fi

success "All prerequisites met"

# ---------------------------------------------------------------------------
# Banner and warnings
# ---------------------------------------------------------------------------

printf '\n'
printf '\033[1;31m  !!  GATEWAY ROLLBACK  !!\033[0m\n'
printf '\n'
warn "Environment: $ENV"
warn "CI/CD is the primary deployment path. Use rollback only for emergencies."
printf '\n'
printf '\033[1;33m  DURABLE OBJECT WARNING:\033[0m\n'
printf '  Cannot rollback across Durable Object migration boundaries.\n'
printf '  If the version you are rolling back past introduced new [[migrations]]\n'
printf '  in wrangler.toml, the rollback will fail or cause data inconsistency.\n'
printf '\n'

# ---------------------------------------------------------------------------
# Step 1: List recent versions
# ---------------------------------------------------------------------------

info "Step 1: Listing recent versions..."

cd "$GATEWAY_DIR"

# Determine the worker name for the target environment
WORKER_NAME="feelr-gateway-${ENV}"

# Fetch the version list as JSON. Each entry has id, tag, message, created_on.
VERSIONS_JSON=$(npx wrangler versions list --env "$ENV" --json --name "$WORKER_NAME" 2>/dev/null || echo "[]")

# Display recent versions for the operator to choose from
VERSIONS_COUNT=$(echo "$VERSIONS_JSON" | jq 'length')

if [ "$VERSIONS_COUNT" -eq 0 ] || [ "$VERSIONS_COUNT" = "null" ]; then
  error "No versions found for $WORKER_NAME"
  error "Are you authenticated with Cloudflare? Try: npx wrangler whoami"
  exit 1
fi

printf '\n'
printf '  Recent versions for %s:\n' "$WORKER_NAME"
printf '  %-40s %-15s %s\n' "VERSION ID" "TAG" "CREATED"
printf '  %s\n' "$(printf '%.0s-' {1..80})"

# Show up to 10 most recent versions
DISPLAY_COUNT=$((VERSIONS_COUNT > 10 ? 10 : VERSIONS_COUNT))

for i in $(seq 0 $((DISPLAY_COUNT - 1))); do
  VID=$(echo "$VERSIONS_JSON" | jq -r ".[$i].id // \"unknown\"")
  VTAG=$(echo "$VERSIONS_JSON" | jq -r ".[$i].tag // \"-\"")
  VCREATED=$(echo "$VERSIONS_JSON" | jq -r ".[$i].created_on // \"unknown\"")
  printf '  %-40s %-15s %s\n' "$VID" "$VTAG" "$VCREATED"
done

printf '\n'

# ---------------------------------------------------------------------------
# Step 2: Select version
# ---------------------------------------------------------------------------

if [ -z "$VERSION_ID" ]; then
  # No version provided via argument -- prompt the operator
  printf 'Enter the version ID to roll back to: '
  read -r VERSION_ID

  if [ -z "$VERSION_ID" ]; then
    error "No version ID provided. Rollback cancelled."
    exit 1
  fi
fi

info "Selected version: $VERSION_ID"

# ---------------------------------------------------------------------------
# Step 3: Confirm rollback
# ---------------------------------------------------------------------------

printf '\n'
warn "You are about to roll back $WORKER_NAME to version: $VERSION_ID"

printf 'Type "yes" to confirm rollback: '
read -r CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  error "Rollback cancelled."
  exit 1
fi

# Prompt for a reason (helps with audit trail)
printf 'Reason for rollback (optional): '
read -r REASON
REASON="${REASON:-No reason provided}"

printf '\n'

# ---------------------------------------------------------------------------
# Step 4: Execute rollback
# ---------------------------------------------------------------------------

info "Step 4: Executing rollback..."

# wrangler rollback reverts to a specific version ID. The --yes flag skips
# wrangler's own confirmation prompt (we already confirmed above).
npx wrangler rollback "$VERSION_ID" --env "$ENV" --yes \
  --message "Manual rollback: $REASON"

success "Rollback complete"

# ---------------------------------------------------------------------------
# Step 5: Health check
# ---------------------------------------------------------------------------

info "Step 5: Running health check..."

if [ "$ENV" = "staging" ]; then
  HEALTH_URL="https://feelr-gateway-staging.feelr.workers.dev/health"
else
  HEALTH_URL="https://api.feelr.dev/health"
fi

MAX_ATTEMPTS=3
ATTEMPT=1

while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
  info "Health check attempt $ATTEMPT/$MAX_ATTEMPTS: $HEALTH_URL"

  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$HEALTH_URL" 2>/dev/null || echo "000")

  if [ "$HTTP_STATUS" = "200" ]; then
    success "Health check passed (HTTP $HTTP_STATUS)"
    break
  fi

  warn "Health check returned HTTP $HTTP_STATUS"

  if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    warn "Health check did not pass after $MAX_ATTEMPTS attempts"
    warn "The rollback may still be propagating. Check manually: curl $HEALTH_URL"
  fi

  ATTEMPT=$((ATTEMPT + 1))
  sleep 5
done

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

printf '\n'
success "Gateway rollback complete ($ENV)!"
printf '\n'
printf '  Environment:  %s\n' "$ENV"
printf '  Rolled back to: %s\n' "$VERSION_ID"
printf '  Reason:       %s\n' "$REASON"
printf '\n'
