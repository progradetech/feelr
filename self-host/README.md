# Feelr Self-Hosted

Run Feelr on your own infrastructure with Docker. Full feature parity with the hosted service -- all connectors, composable actions, dashboard, and API.

## Quick Start

```bash
# Clone the repository
git clone https://github.com/andrewprograde/feelr.git
cd feelr/self-host

# Run interactive setup (generates .env and feelr.yaml)
./init.sh

# Start Feelr
docker compose up -d

# Verify it is running
curl http://localhost:8080/health
```

The dashboard is available at `http://localhost:8080/dashboard`.

## Prerequisites

- **Docker** 24+ with Docker Compose v2
- **4 GB RAM** minimum (workerd + SQLite)
- **1 GB disk** for application; additional for data storage

## Setup

### Interactive Init Script

The `init.sh` script walks you through setup:

1. **Admin token** -- authenticates dashboard access and API key management. Auto-generated if left empty.
2. **Encryption key** -- AES-256-GCM key for stored connector credentials. Auto-generated if left empty.
3. **Connectors** -- optionally configure GitHub, Slack, Discord, and Stripe tokens.

The script generates two files:
- `.env` -- secrets (admin token, encryption key, connector tokens)
- `feelr.yaml` -- runtime configuration (copied from template)

For non-interactive environments (CI, automation):

```bash
./init.sh --quiet
```

### Manual Setup

If you prefer manual configuration:

```bash
# Copy templates
cp env.template .env
cp feelr.yaml.template feelr.yaml

# Edit .env with your secrets
# Generate tokens with: openssl rand -hex 32
vi .env

# Start
docker compose up -d
```

## Configuration

### feelr.yaml

The main configuration file controls runtime behavior:

```yaml
# Runtime mode (do not change)
runtime: self-hosted

# Gateway port (inside container)
gateway:
  port: 8080

# Billing (disabled for self-hosted by default)
billing:
  enabled: false

# Encryption for stored credentials
encryption:
  enabled: true

# Rate limits per API key tier
rate_limits:
  free:
    requests_per_minute: 30
  pro:
    requests_per_minute: 300
  enterprise:
    requests_per_minute: 3000
  ip:
    requests_per_10s: 100

# SQLite storage location
storage:
  data_dir: /data/feelr
  auto_migrate: true

# Usage data retention
retention:
  days: 90

# Log level: debug, info, warn, error
logging:
  level: info
```

### Environment Variables (.env)

| Variable | Required | Description |
|----------|----------|-------------|
| `FEELR_ADMIN_TOKEN` | Yes | Admin authentication token |
| `FEELR_ENCRYPTION_KEY` | Yes | AES-256-GCM encryption key |
| `GITHUB_TOKEN` | No | GitHub Personal Access Token |
| `FEELR_SLACK_CLIENT_ID` | No | Slack App Client ID |
| `FEELR_SLACK_CLIENT_SECRET` | No | Slack App Client Secret |
| `DISCORD_BOT_TOKEN` | No | Discord Bot Token |
| `STRIPE_API_KEY` | No | Stripe API Key |
| `FEELR_PORT` | No | Override gateway port (default: 8080) |
| `FEELR_AUTO_MIGRATE` | No | Override auto-migration (default: true) |
| `FEELR_DOMAIN` | No | Domain for TLS with Caddy |

## TLS with Caddy

For production deployments with automatic HTTPS:

```bash
# Set your domain in .env
echo "FEELR_DOMAIN=feelr.example.com" >> .env

# Start with TLS profile
docker compose --profile tls up -d
```

Caddy automatically obtains and renews Let's Encrypt TLS certificates. Your domain's DNS must point to the server.

Ports used with TLS:
- **443** -- HTTPS (Caddy reverse proxy to Feelr)
- **80** -- HTTP (Caddy redirect to HTTPS / ACME challenge)

For local development without a real domain, set `FEELR_DOMAIN=localhost` (Caddy generates a self-signed certificate).

## Architecture

```
                              +------------------+
                              |  Caddy (optional) |
                              |  :443 / :80       |
                              +--------+---------+
                                       |
                              +--------v---------+
                              |  workerd runtime  |
                              |  :8080            |
                              |                   |
                              |  Gateway Worker   |
                              |  Dashboard (static)|
                              |  Durable Objects:  |
                              |    TokenCoordinator|
                              |    KvStoreDO       |
                              |    UsageDbDO       |
                              +--------+---------+
                                       |
                              +--------v---------+
                              |  /data/feelr     |
                              |  SQLite databases |
                              +------------------+
```

The self-hosted stack runs on **workerd** (Cloudflare's open-source Workers runtime) managed by **s6-overlay** as the process supervisor inside a single Docker container.

## Data and Backups

All persistent data is stored in the `feelr-data` Docker volume, mounted at `/data/feelr` inside the container.

### Data directory structure

```
/data/feelr/
  do/                    # Durable Object SQLite databases
    token-coordinator/   # OAuth tokens and credentials
    kv-store/            # API keys and KV data
    usage-db/            # Usage analytics and rate limit events
```

### Backup

```bash
# Stop Feelr (recommended for consistency)
docker compose stop

# Back up the data volume
docker run --rm -v feelr-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/feelr-backup-$(date +%Y%m%d).tar.gz -C /data .

# Restart
docker compose up -d
```

### Restore

```bash
docker compose stop

docker run --rm -v feelr-data:/data -v $(pwd):/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/feelr-backup-YYYYMMDD.tar.gz -C /data"

docker compose up -d
```

## Feature Parity

The self-hosted version provides full feature parity with the cloud-hosted service:

| Feature | Cloud | Self-Hosted |
|---------|-------|-------------|
| All 4 connectors (GitHub, Slack, Discord, Stripe) | Yes | Yes |
| Composable action chains | Yes | Yes |
| Dashboard | Yes | Yes |
| API key management | Yes | Yes |
| Rate limiting | Yes | Yes (in-memory) |
| Usage analytics | Yes | Yes (SQLite) |
| Credential encryption | Yes | Yes |
| OAuth token refresh | Yes | Yes |
| Billing | Stripe | Disabled (toggleable) |
| TLS | Cloudflare | Caddy (optional) |
| Storage | KV + D1 + DO | SQLite via Durable Objects |

**Differences:**
- Rate limiting uses an in-memory implementation (resets on container restart) instead of Cloudflare's distributed rate limiting.
- Storage uses SQLite via Durable Objects on local disk instead of Cloudflare KV/D1.
- No multi-region replication -- runs on a single node.

## Troubleshooting

### Container fails to start

Check the logs:

```bash
docker compose logs feelr
```

Common causes:
- **Missing .env file** -- run `./init.sh` or copy from `env.template`
- **Missing feelr.yaml** -- run `./init.sh` or copy from `feelr.yaml.template`
- **Port 8080 already in use** -- set `FEELR_PORT=9090` in `.env`

### Health check fails

```bash
# Check if the container is running
docker compose ps

# Test the health endpoint directly
docker compose exec feelr wget -q -O- http://localhost:8080/health
```

### Cannot access dashboard

- Ensure the container is healthy: `docker compose ps`
- Check you are using the correct port: `http://localhost:${FEELR_PORT:-8080}/dashboard`
- Check browser console for errors (admin token may be invalid)

### Caddy TLS not working

- Ensure DNS for your domain points to the server
- Check Caddy logs: `docker compose logs caddy`
- Verify `FEELR_DOMAIN` is set in `.env`
- Port 80 and 443 must be accessible from the internet for ACME challenges

### Connector authentication errors

- Verify tokens in `.env` are correct
- GitHub: Token needs appropriate scopes (repo, read:org)
- Slack: Both Client ID and Client Secret are required
- Discord: Bot must be invited to the server with appropriate permissions
- Stripe: Use a secret key (sk\_...), not a publishable key

### Reset to clean state

```bash
# Stop and remove everything (including data)
docker compose down -v

# Re-run setup
./init.sh
docker compose up -d
```

## Upgrading

```bash
cd feelr
git pull
cd self-host
docker compose build
docker compose up -d
```

Database migrations run automatically on startup when `auto_migrate: true` is set in `feelr.yaml`.

## Files Reference

| File | Description |
|------|-------------|
| `init.sh` | Interactive setup script |
| `docker-compose.yml` | Docker Compose services definition |
| `Dockerfile` | Multi-stage build (builder + runtime) |
| `config.capnp` | workerd configuration |
| `Caddyfile` | Caddy reverse proxy config |
| `feelr.yaml.template` | Configuration template |
| `env.template` | Environment variables template |
| `s6/` | s6-overlay service definitions |
