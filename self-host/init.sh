#!/bin/sh
# Feelr Self-Hosted -- Interactive Init Script
#
# Generates .env and feelr.yaml for a self-hosted Feelr deployment.
# POSIX sh for maximum portability (no bash-isms).
#
# Usage:
#   ./init.sh           # Interactive mode
#   ./init.sh --quiet   # Non-interactive, auto-generate all secrets

set -e

# ---------------------------------------------------------------------------
# Helpers
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

prompt() {
  # prompt VARNAME "message" "default"
  _var="$1"
  _msg="$2"
  _default="$3"
  if [ "$QUIET" = "1" ]; then
    eval "$_var=\"$_default\""
    return
  fi
  if [ -n "$_default" ]; then
    printf '%s [%s]: ' "$_msg" "$_default"
  else
    printf '%s: ' "$_msg"
  fi
  read -r _answer
  if [ -z "$_answer" ]; then
    eval "$_var=\"$_default\""
  else
    eval "$_var=\"$_answer\""
  fi
}

prompt_yn() {
  # prompt_yn "message" "default_y_or_n" -> sets REPLY to y or n
  _msg="$1"
  _default="$2"
  if [ "$QUIET" = "1" ]; then
    REPLY="$_default"
    return
  fi
  if [ "$_default" = "y" ]; then
    printf '%s [Y/n]: ' "$_msg"
  else
    printf '%s [y/N]: ' "$_msg"
  fi
  read -r _answer
  case "$_answer" in
    [Yy]*) REPLY="y" ;;
    [Nn]*) REPLY="n" ;;
    "") REPLY="$_default" ;;
    *) REPLY="$_default" ;;
  esac
}

generate_secret() {
  openssl rand -hex 32 2>/dev/null || {
    # Fallback if openssl is not available
    if command -v head >/dev/null 2>&1 && [ -r /dev/urandom ]; then
      head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' | head -c 64
      echo
    else
      error "Cannot generate secret: openssl and /dev/urandom both unavailable"
      exit 1
    fi
  }
}

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------

QUIET=0
for arg in "$@"; do
  case "$arg" in
    --quiet|-q) QUIET=1 ;;
    --help|-h)
      printf 'Usage: %s [--quiet]\n' "$0"
      printf '  --quiet, -q  Non-interactive mode (auto-generate all secrets)\n'
      exit 0
      ;;
    *)
      error "Unknown argument: $arg"
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Resolve script directory (portable)
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------

printf '\n'
printf '\033[1m  Feelr Self-Hosted Setup\033[0m\n'
printf '  ========================\n'
printf '\n'

# ---------------------------------------------------------------------------
# Check prerequisites
# ---------------------------------------------------------------------------

info "Checking prerequisites..."

HAS_DOCKER=0
HAS_COMPOSE=0

if command -v docker >/dev/null 2>&1; then
  HAS_DOCKER=1
else
  warn "Docker not found. You will need Docker to run Feelr."
fi

if docker compose version >/dev/null 2>&1; then
  HAS_COMPOSE=1
elif command -v docker-compose >/dev/null 2>&1; then
  HAS_COMPOSE=1
else
  warn "Docker Compose not found. You will need it to run Feelr."
fi

# ---------------------------------------------------------------------------
# Step 1: Admin Token
# ---------------------------------------------------------------------------

printf '\n'
info "Step 1: Admin Token"
printf '  The admin token authenticates dashboard access and API key management.\n'
printf '  Leave empty to auto-generate a secure token.\n'
printf '\n'

prompt ADMIN_TOKEN "Admin token (leave empty to auto-generate)" ""

if [ -z "$ADMIN_TOKEN" ]; then
  ADMIN_TOKEN="$(generate_secret)"
  success "Generated admin token: ${ADMIN_TOKEN}"
fi

# ---------------------------------------------------------------------------
# Step 2: Encryption Key
# ---------------------------------------------------------------------------

printf '\n'
info "Step 2: Encryption Key"
printf '  AES-256-GCM encryption key for stored connector credentials.\n'
printf '  Leave empty to auto-generate a secure key.\n'
printf '\n'

prompt ENCRYPTION_KEY "Encryption key (leave empty to auto-generate)" ""

if [ -z "$ENCRYPTION_KEY" ]; then
  ENCRYPTION_KEY="$(generate_secret)"
  success "Generated encryption key: ${ENCRYPTION_KEY}"
fi

# ---------------------------------------------------------------------------
# Step 3: Connectors (optional)
# ---------------------------------------------------------------------------

GITHUB_TOKEN=""
SLACK_CLIENT_ID=""
SLACK_CLIENT_SECRET=""
DISCORD_BOT_TOKEN=""
STRIPE_API_KEY=""

printf '\n'
info "Step 3: Connector Configuration (optional)"
printf '  You can configure connectors now or later via the dashboard.\n'
printf '\n'

prompt_yn "Configure connectors now?" "n"

if [ "$REPLY" = "y" ]; then
  printf '\n'
  printf '  All connector tokens are optional. Press Enter to skip any.\n'
  printf '\n'

  # GitHub
  prompt GITHUB_TOKEN "  GitHub Personal Access Token (ghp_...)" ""
  if [ -n "$GITHUB_TOKEN" ]; then
    success "GitHub token set"
  fi

  # Slack
  prompt SLACK_CLIENT_ID "  Slack App Client ID" ""
  prompt SLACK_CLIENT_SECRET "  Slack App Client Secret" ""
  if [ -n "$SLACK_CLIENT_ID" ]; then
    success "Slack credentials set"
  fi

  # Discord
  prompt DISCORD_BOT_TOKEN "  Discord Bot Token" ""
  if [ -n "$DISCORD_BOT_TOKEN" ]; then
    success "Discord bot token set"
  fi

  # Stripe
  prompt STRIPE_API_KEY "  Stripe API Key (sk_...)" ""
  if [ -n "$STRIPE_API_KEY" ]; then
    success "Stripe API key set"
  fi
fi

# ---------------------------------------------------------------------------
# Step 4: Generate .env
# ---------------------------------------------------------------------------

printf '\n'
info "Generating .env file..."

if [ -f ".env" ]; then
  warn "Existing .env found. Backing up to .env.backup"
  cp .env .env.backup
fi

cat > .env << ENVEOF
# Feelr Self-Hosted Secrets
# Generated by init.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Required: Admin token for dashboard and API key management
FEELR_ADMIN_TOKEN=${ADMIN_TOKEN}

# Required: Encryption key for credential storage (AES-256-GCM)
FEELR_ENCRYPTION_KEY=${ENCRYPTION_KEY}
ENVEOF

# Append connector tokens only if set
if [ -n "$GITHUB_TOKEN" ]; then
  printf '\n# GitHub connector\nGITHUB_TOKEN=%s\n' "$GITHUB_TOKEN" >> .env
fi

if [ -n "$SLACK_CLIENT_ID" ]; then
  printf '\n# Slack connector\nFEELR_SLACK_CLIENT_ID=%s\nFEELR_SLACK_CLIENT_SECRET=%s\n' \
    "$SLACK_CLIENT_ID" "$SLACK_CLIENT_SECRET" >> .env
fi

if [ -n "$DISCORD_BOT_TOKEN" ]; then
  printf '\n# Discord connector\nDISCORD_BOT_TOKEN=%s\n' "$DISCORD_BOT_TOKEN" >> .env
fi

if [ -n "$STRIPE_API_KEY" ]; then
  printf '\n# Stripe connector\nSTRIPE_API_KEY=%s\n' "$STRIPE_API_KEY" >> .env
fi

# Restrict permissions
chmod 600 .env

success ".env created (permissions: 600)"

# ---------------------------------------------------------------------------
# Step 5: Copy feelr.yaml
# ---------------------------------------------------------------------------

printf '\n'
info "Setting up feelr.yaml configuration..."

if [ -f "feelr.yaml" ]; then
  warn "Existing feelr.yaml found. Keeping current configuration."
else
  if [ -f "feelr.yaml.template" ]; then
    cp feelr.yaml.template feelr.yaml
    success "feelr.yaml created from template"
  else
    error "feelr.yaml.template not found. Please ensure you are in the self-host directory."
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

printf '\n'
printf '  \033[1;32m========================================\033[0m\n'
printf '  \033[1;32m  Feelr setup complete!\033[0m\n'
printf '  \033[1;32m========================================\033[0m\n'
printf '\n'

printf '  \033[1mNext steps:\033[0m\n'
printf '\n'
printf '  1. Start Feelr:\n'
printf '\n'
printf '     docker compose up -d\n'
printf '\n'
printf '  2. Verify it is running:\n'
printf '\n'
printf '     curl http://localhost:8080/health\n'
printf '\n'
printf '  3. Open the dashboard:\n'
printf '\n'
printf '     http://localhost:8080/dashboard\n'
printf '\n'
printf '  4. (Optional) Enable TLS with Caddy:\n'
printf '\n'
printf '     # Set your domain in .env:\n'
printf '     echo "FEELR_DOMAIN=feelr.example.com" >> .env\n'
printf '\n'
printf '     # Start with TLS profile:\n'
printf '     docker compose --profile tls up -d\n'
printf '\n'

printf '  \033[1mImportant:\033[0m\n'
printf '  - Save your admin token securely. It is in .env\n'
printf '  - Save your encryption key. Losing it means losing stored credentials.\n'
printf '  - Configuration: Edit feelr.yaml for rate limits, retention, etc.\n'
printf '\n'
