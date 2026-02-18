# Gateway Worker Secrets

Secrets must be set per environment via `wrangler secret put`.

```bash
# From cloud/gateway/ directory:
npx wrangler secret put <NAME> --env staging -c wrangler.cloud.toml
npx wrangler secret put <NAME> --env production -c wrangler.cloud.toml
```

## Required

| Secret | What it does | How to get it |
|--------|-------------|---------------|
| `STRIPE_SECRET_KEY` | Billing API calls | Stripe Dashboard → API keys → Secret key (`sk_test_...` for staging, `sk_live_...` for production) |
| `ENCRYPTION_KEY` | Encrypts OAuth tokens at rest in KV | Generate with `openssl rand -hex 32` (use different keys per env) |
| `ADMIN_TOKEN` | Authenticates `/internal/*` admin routes (dashboard → gateway) | Generate with `openssl rand -hex 32` (use different keys per env) |

## Optional (connector OAuth)

| Secret | What it does | How to get it |
|--------|-------------|---------------|
| `SLACK_CLIENT_ID` | Slack OAuth flow | Slack API → Your Apps → OAuth & Permissions → Client ID |
| `SLACK_CLIENT_SECRET` | Slack OAuth flow | Slack API → Your Apps → OAuth & Permissions → Client Secret |

Slack secrets are only needed if you want the Slack connector to work. The gateway will start without them but Slack OAuth will fail.

## Quick setup (staging)

```bash
cd cloud/gateway

# Required
npx wrangler secret put STRIPE_SECRET_KEY --env staging -c wrangler.cloud.toml
npx wrangler secret put ENCRYPTION_KEY --env staging -c wrangler.cloud.toml
npx wrangler secret put ADMIN_TOKEN --env staging -c wrangler.cloud.toml

# Optional
npx wrangler secret put SLACK_CLIENT_ID --env staging -c wrangler.cloud.toml
npx wrangler secret put SLACK_CLIENT_SECRET --env staging -c wrangler.cloud.toml
```

## Quick setup (production)

```bash
cd cloud/gateway

# Required
npx wrangler secret put STRIPE_SECRET_KEY --env production -c wrangler.cloud.toml
npx wrangler secret put ENCRYPTION_KEY --env production -c wrangler.cloud.toml
npx wrangler secret put ADMIN_TOKEN --env production -c wrangler.cloud.toml

# Optional
npx wrangler secret put SLACK_CLIENT_ID --env production -c wrangler.cloud.toml
npx wrangler secret put SLACK_CLIENT_SECRET --env production -c wrangler.cloud.toml
```

## Verify secrets are set

```bash
npx wrangler secret list --env staging -c wrangler.cloud.toml
npx wrangler secret list --env production -c wrangler.cloud.toml
```
