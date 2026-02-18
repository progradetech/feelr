#!/usr/bin/env bash
# =============================================================================
# Feelr Dashboard -- Deployment Script (Azure Static Web Apps)
#
# PURPOSE:
#   Deploy the Feelr dashboard (Next.js static export) to Azure Static Web Apps.
#   Supports both staging and production environments.
#
# USAGE:
#   ./scripts/deploy-dashboard.sh                  # Deploy to staging (default)
#   ./scripts/deploy-dashboard.sh --env staging     # Deploy to staging
#   ./scripts/deploy-dashboard.sh --env production  # Deploy to production
#
# ENVIRONMENT VARIABLES:
#   SWA_DASHBOARD_DEPLOYMENT_TOKEN  -- Azure SWA deployment token (required)
#     Retrieve with: az staticwebapp secrets list --name feelr-dashboard \
#                      --query "properties.apiKey" -o tsv
#
# WARNING:
#   CI/CD via .github/workflows/dashboard.yml is the PRIMARY deployment mechanism.
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

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DASHBOARD_DIR="$REPO_ROOT/apps/dashboard"

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------

ENV="staging"

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
    --help|-h)
      printf 'Usage: %s [--env staging|production]\n' "$0"
      printf '  --env    Target environment (default: staging)\n'
      exit 0
      ;;
    *)
      error "Unknown argument: $1"
      exit 1
      ;;
  esac
done

# Validate the environment argument
if [ "$ENV" != "staging" ] && [ "$ENV" != "production" ]; then
  error "Invalid environment: $ENV (must be 'staging' or 'production')"
  exit 1
fi

# ---------------------------------------------------------------------------
# Set environment-specific variables
# ---------------------------------------------------------------------------

# The dashboard needs to know which gateway to call at build time.
# This is baked into the static export via Next.js public env vars.
if [ "$ENV" = "staging" ]; then
  NEXT_PUBLIC_GATEWAY_URL="https://feelr-gateway-staging.feelr.workers.dev"
else
  NEXT_PUBLIC_GATEWAY_URL="https://api.feelr.dev"
fi

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

if [ ! -d "$DASHBOARD_DIR" ]; then
  error "Dashboard directory not found at $DASHBOARD_DIR"
  exit 1
fi

# SWA deployment token is required -- check env var
if [ -z "${SWA_DASHBOARD_DEPLOYMENT_TOKEN:-}" ]; then
  error "SWA_DASHBOARD_DEPLOYMENT_TOKEN is not set."
  error "Retrieve it with:"
  error "  az staticwebapp secrets list --name feelr-dashboard --query \"properties.apiKey\" -o tsv"
  error "Then export it:"
  error "  export SWA_DASHBOARD_DEPLOYMENT_TOKEN=\"<token>\""
  exit 1
fi

success "All prerequisites met"

# ---------------------------------------------------------------------------
# Confirmation for production
# ---------------------------------------------------------------------------

printf '\n'
printf '\033[1m  Feelr Dashboard -- %s Deploy\033[0m\n' "$(echo "$ENV" | tr '[:lower:]' '[:upper:]')"
printf '  ==========================================\n'
printf '\n'
warn "CI/CD is the primary deployment path. Use this script only when needed."
printf '\n'

if [ "$ENV" = "production" ]; then
  warn "This will deploy to PRODUCTION."
  printf 'Type "yes" to continue: '
  read -r CONFIRM
  if [ "$CONFIRM" != "yes" ]; then
    error "Deployment cancelled."
    exit 1
  fi
  printf '\n'
fi

# ---------------------------------------------------------------------------
# Step 1: Install dependencies
# ---------------------------------------------------------------------------

info "Step 1: Installing dependencies..."

cd "$REPO_ROOT"
pnpm install --frozen-lockfile

success "Dependencies installed"

# ---------------------------------------------------------------------------
# Step 2: Build dashboard
# ---------------------------------------------------------------------------

info "Step 2: Building dashboard (gateway URL: $NEXT_PUBLIC_GATEWAY_URL)..."

# NEXT_PUBLIC_GATEWAY_URL is read by Next.js at build time and embedded in the
# static export. This controls which API endpoint the dashboard calls.
export NEXT_PUBLIC_GATEWAY_URL
pnpm turbo run build --filter=@feelr/dashboard

success "Dashboard built"

# ---------------------------------------------------------------------------
# Step 3: Copy SWA configuration
# ---------------------------------------------------------------------------

info "Step 3: Copying SWA config to output directory..."

# Azure SWA needs staticwebapp.config.json in the deployment root for
# routing rules, headers, and fallback configuration.
if [ -f "$DASHBOARD_DIR/staticwebapp.config.json" ]; then
  cp "$DASHBOARD_DIR/staticwebapp.config.json" "$DASHBOARD_DIR/out/"
  success "SWA config copied"
else
  warn "staticwebapp.config.json not found -- deploying without custom config"
fi

# ---------------------------------------------------------------------------
# Step 4: Deploy to Azure SWA
# ---------------------------------------------------------------------------

info "Step 4: Deploying to Azure Static Web Apps ($ENV)..."

# Build the swa deploy command. For staging, we use --env staging which creates
# a staging slot. For production, we deploy to the default (production) slot.
SWA_CMD="npx @azure/static-web-apps-cli deploy $DASHBOARD_DIR/out"
SWA_CMD="$SWA_CMD --deployment-token $SWA_DASHBOARD_DEPLOYMENT_TOKEN"

if [ "$ENV" = "staging" ]; then
  SWA_CMD="$SWA_CMD --env staging"
fi

eval "$SWA_CMD"

success "Deployed to $ENV"

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

printf '\n'
success "Dashboard deployment complete ($ENV)!"
printf '\n'
printf '  Gateway URL:  %s\n' "$NEXT_PUBLIC_GATEWAY_URL"
printf '  Environment:  %s\n' "$ENV"
printf '\n'
