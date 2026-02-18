# Phase 12: Gateway Infrastructure & Environments - Research

**Researched:** 2026-02-09
**Domain:** Cloudflare Workers multi-environment deployment, Wrangler configuration, resource isolation (KV/D1/DO), Custom Domains with SSL
**Confidence:** HIGH

## Summary

Phase 12 transforms the existing single-environment `wrangler.toml` into a multi-environment configuration with fully isolated staging and production resources (KV namespaces, D1 databases, Durable Objects), per-environment secrets, and a production custom domain (`api.feelr.dev`). This is standard Cloudflare Workers infrastructure work -- well-documented, no custom solutions needed.

The current `wrangler.toml` has all bindings at the top level with placeholder IDs. The transformation requires: (1) creating real Cloudflare resources via `wrangler` CLI commands (KV namespaces and D1 databases for each environment), (2) restructuring `wrangler.toml` to define per-environment bindings since **bindings are non-inheritable** in Wrangler environments, (3) setting per-environment secrets via `wrangler secret put --env`, and (4) configuring `api.feelr.dev` as a Custom Domain on the production environment with auto-provisioned SSL.

A critical architectural insight: when you deploy with `--env staging`, Wrangler creates a **separate Worker** named `feelr-gateway-staging`. When you deploy with `--env production`, it creates `feelr-gateway-production`. These are distinct Workers with their own bindings, secrets, and routing -- the isolation is fundamental to the platform, not something you build. The DO `[[migrations]]` section is top-level only in TOML format but environments can override it in JSONC format; for our case, top-level migrations inherited by both environments is the correct pattern since both need the same `TokenCoordinator` class.

**Primary recommendation:** Structure this as two plans: (1) Create Cloudflare resources and restructure `wrangler.toml` for staging/production with resource isolation, (2) Configure `api.feelr.dev` Custom Domain on production and verify SSL. The first plan is the heavy lift (resource creation, TOML restructuring, secret provisioning); the second is a focused DNS/routing task.

## Standard Stack

### Core

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Wrangler | 4.63.0 | CLI for managing Workers, KV, D1, secrets, deployments | Already installed in project; handles all resource creation and deployment |
| Cloudflare Workers | Workers Paid ($5/mo) | Runtime platform | Already decided in v1.0 (10ms CPU limit on free tier) |
| Cloudflare KV | N/A | Key-value storage for API keys, credentials | Already used by gateway (AUTH_KV binding) |
| Cloudflare D1 | N/A | SQL database for usage analytics | Already used by gateway (USAGE_DB binding) |
| Cloudflare Durable Objects | SQLite-backed | Token refresh coordination | Already used by gateway (TOKEN_COORDINATOR binding) |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| curl | system | Health check verification | Verify `api.feelr.dev/health` returns 200 with valid SSL |
| dig | system | DNS record verification | Verify `api.feelr.dev` resolves to Cloudflare after Custom Domain setup |
| Cloudflare Dashboard | web | Visual verification of Workers, KV, D1, DO resources | Cross-check resource creation, verify Custom Domain SSL status |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `wrangler.toml` (TOML) | `wrangler.jsonc` (JSON) | JSON supports comments and is equally valid; TOML is already used by project and is more concise for this use case |
| Per-environment `[[migrations]]` | Top-level `[[migrations]]` inherited by both | Per-env migrations only needed if environments need different DO classes; same class for both is correct here |
| Separate Cloudflare accounts (staging/prod) | Single account with environment isolation | Separate accounts provide stronger isolation but add operational overhead for a solo developer |
| Staging custom domain (`staging-api.feelr.dev`) | Workers.dev URL for staging | Custom domain for staging is nice-to-have but not required; `.workers.dev` URL is sufficient for staging validation |

## Architecture Patterns

### Target wrangler.toml Structure

```toml
name = "feelr-gateway"
main = "src/index.ts"
compatibility_date = "2026-02-05"

# keep_vars is TOP-LEVEL ONLY -- preserves dashboard-configured vars on deploy
# Secrets are ALWAYS preserved regardless of this setting
keep_vars = true

# DO migrations are top-level -- inherited by all environments
[[migrations]]
tag = "v1"
new_sqlite_classes = ["TokenCoordinator"]

# Cron triggers
[triggers]
crons = ["0 3 * * *"]

# ============================================================
# STAGING ENVIRONMENT
# ============================================================
[env.staging]
workers_dev = true  # Enable .workers.dev URL for staging access

[env.staging.vars]
ENVIRONMENT = "staging"

[[env.staging.kv_namespaces]]
binding = "AUTH_KV"
id = "<STAGING_KV_ID>"

[[env.staging.d1_databases]]
binding = "USAGE_DB"
database_name = "feelr-usage-staging"
database_id = "<STAGING_D1_ID>"

[env.staging.durable_objects]
bindings = [
  { name = "TOKEN_COORDINATOR", class_name = "TokenCoordinator" }
]

[[env.staging.unsafe.bindings]]
name = "RATE_LIMIT_FREE"
type = "ratelimit"
namespace_id = "0"
simple = { limit = 30, period = 60 }

[[env.staging.unsafe.bindings]]
name = "RATE_LIMIT_PRO"
type = "ratelimit"
namespace_id = "0"
simple = { limit = 300, period = 60 }

[[env.staging.unsafe.bindings]]
name = "RATE_LIMIT_ENTERPRISE"
type = "ratelimit"
namespace_id = "0"
simple = { limit = 3000, period = 60 }

[[env.staging.unsafe.bindings]]
name = "RATE_LIMIT_IP"
type = "ratelimit"
namespace_id = "0"
simple = { limit = 100, period = 10 }

# ============================================================
# PRODUCTION ENVIRONMENT
# ============================================================
[env.production]
workers_dev = false  # Disable .workers.dev URL -- production uses custom domain only

[[env.production.routes]]
pattern = "api.feelr.dev"
custom_domain = true

[env.production.vars]
ENVIRONMENT = "production"

[[env.production.kv_namespaces]]
binding = "AUTH_KV"
id = "<PRODUCTION_KV_ID>"

[[env.production.d1_databases]]
binding = "USAGE_DB"
database_name = "feelr-usage-production"
database_id = "<PRODUCTION_D1_ID>"

[env.production.durable_objects]
bindings = [
  { name = "TOKEN_COORDINATOR", class_name = "TokenCoordinator" }
]

[[env.production.unsafe.bindings]]
name = "RATE_LIMIT_FREE"
type = "ratelimit"
namespace_id = "0"
simple = { limit = 30, period = 60 }

[[env.production.unsafe.bindings]]
name = "RATE_LIMIT_PRO"
type = "ratelimit"
namespace_id = "0"
simple = { limit = 300, period = 60 }

[[env.production.unsafe.bindings]]
name = "RATE_LIMIT_ENTERPRISE"
type = "ratelimit"
namespace_id = "0"
simple = { limit = 3000, period = 60 }

[[env.production.unsafe.bindings]]
name = "RATE_LIMIT_IP"
type = "ratelimit"
namespace_id = "0"
simple = { limit = 100, period = 10 }
```

### Pattern 1: Worker Naming with Environments

**What:** When deploying with `--env <name>`, Wrangler creates a separate Worker named `<top-level-name>-<env-name>`.

**When to use:** Always -- this is fundamental behavior, not optional.

**Example:**
- `wrangler deploy --env staging` creates Worker `feelr-gateway-staging`
- `wrangler deploy --env production` creates Worker `feelr-gateway-production`
- Each Worker has its own bindings, secrets, and routing

**Source:** [Cloudflare Workers Environments](https://developers.cloudflare.com/workers/wrangler/environments/)

### Pattern 2: Resource Creation Commands

**What:** Create separate Cloudflare resources for each environment before configuring wrangler.toml.

**Example:**
```bash
# Create KV namespaces
npx wrangler kv namespace create AUTH_KV --env staging
# Output: { id: "abc123..." } -- use this ID in [[env.staging.kv_namespaces]]

npx wrangler kv namespace create AUTH_KV --env production
# Output: { id: "def456..." } -- use this ID in [[env.production.kv_namespaces]]

# Create D1 databases
npx wrangler d1 create feelr-usage-staging
# Output: database_id = "ghi789..." -- use in [[env.staging.d1_databases]]

npx wrangler d1 create feelr-usage-production
# Output: database_id = "jkl012..." -- use in [[env.production.d1_databases]]
```

**Source:** [Cloudflare KV Environments](https://developers.cloudflare.com/kv/reference/environments/), [Cloudflare D1 Environments](https://developers.cloudflare.com/d1/configuration/environments/)

### Pattern 3: Per-Environment Secret Provisioning

**What:** Secrets must be set separately for each environment using `--env` flag.

**Example:**
```bash
# Staging secrets
npx wrangler secret put ENCRYPTION_KEY --env staging
npx wrangler secret put ADMIN_TOKEN --env staging
npx wrangler secret put SLACK_CLIENT_ID --env staging
npx wrangler secret put SLACK_CLIENT_SECRET --env staging

# Production secrets (different values!)
npx wrangler secret put ENCRYPTION_KEY --env production
npx wrangler secret put ADMIN_TOKEN --env production
npx wrangler secret put SLACK_CLIENT_ID --env production
npx wrangler secret put SLACK_CLIENT_SECRET --env production
```

**Critical:** Secrets are always preserved across deploys -- `wrangler deploy` never deletes secrets. The `keep_vars` setting only affects non-secret `vars` set via the dashboard.

**Source:** [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

### Pattern 4: Custom Domain with Auto-SSL

**What:** Configure `api.feelr.dev` as a Custom Domain on the production Worker. Cloudflare auto-creates the DNS record and provisions an Advanced Certificate.

**Example:**
```toml
[[env.production.routes]]
pattern = "api.feelr.dev"
custom_domain = true
```

**Key behavior:**
- Cloudflare automatically creates a DNS record pointing `api.feelr.dev` to the Worker
- An Advanced Certificate is auto-generated for the hostname
- The `.dev` TLD is HSTS-preloaded, so HTTPS is mandatory (Cloudflare handles this)
- All paths on `api.feelr.dev` route to the Worker (unlike Routes, which can be path-specific)

**Prerequisite:** The `feelr.dev` zone must be active in Cloudflare (confirmed in Phase 11).

**Source:** [Cloudflare Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)

### Pattern 5: D1 Migrations Per Environment

**What:** Apply D1 schema migrations to each environment's database separately.

**Example:**
```bash
# Apply migrations to staging D1
npx wrangler d1 migrations apply feelr-usage-staging --env staging

# Apply migrations to production D1
npx wrangler d1 migrations apply feelr-usage-production --env production
```

**Source:** [Cloudflare D1 Migrations](https://developers.cloudflare.com/d1/reference/migrations/)

### Anti-Patterns to Avoid

- **Defining bindings only at top level and expecting env inheritance:** Bindings (KV, D1, DO, vars, unsafe.bindings) are NON-INHERITABLE. If you define them at top level but not under `[env.staging]`, the staging Worker will have NO bindings. This is the single most common mistake.
- **Using `script_name` on DO bindings to share DO state between environments:** This would defeat the purpose of environment isolation. Each environment should have its own DO instances with separate persistent storage.
- **Setting `workers_dev = false` on staging without providing a route:** If you disable the `.workers.dev` URL without specifying a Custom Domain or route, the staging Worker will have no URL to access.
- **Forgetting to apply D1 migrations to both environments:** Each D1 database is independent. Creating the database does not apply schema migrations -- you must run `d1 migrations apply` for each.
- **Putting secrets in `[env.staging.vars]` or `[env.production.vars]`:** The `vars` section is plaintext in the TOML file. Use `wrangler secret put --env <name>` for all sensitive values.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Environment-specific bindings | Custom env-switching logic in code | Wrangler `[env.*]` sections | Wrangler handles complete Worker isolation; code doesn't need to know which env it's in |
| SSL certificate provisioning | Manual cert generation/upload | Custom Domains (`custom_domain = true`) | Cloudflare auto-provisions and auto-renews Advanced Certificates |
| DNS record for api.feelr.dev | Manual DNS record creation in dashboard | Custom Domains auto-create DNS records | When you deploy with `custom_domain = true`, the DNS record is created/updated automatically |
| Secret rotation across deploys | Custom secret management system | Wrangler secrets (always preserved across deploys) | Secrets are encrypted, never deleted by deploy, and managed via `wrangler secret put` |
| Environment variable validation | Custom startup validation code | Wrangler deployment checks | Wrangler validates all bindings exist before deploying; missing bindings cause deploy failure |

**Key insight:** This phase is pure configuration and infrastructure provisioning. There are zero code changes to the gateway application itself. The Worker code already uses abstract runtime interfaces (`KeyValueStore`, `UsageDatabase`, `RateLimiter`, `TokenCoordinatorClient`) -- the environment isolation happens entirely at the Wrangler/platform level.

## Common Pitfalls

### Pitfall 1: Non-Inheritable Bindings Cause Empty Environment

**What goes wrong:** You deploy `wrangler deploy --env staging` and the Worker starts but immediately crashes with "binding not found" errors because KV, D1, and DO bindings are undefined.
**Why it happens:** Bindings (`kv_namespaces`, `d1_databases`, `durable_objects`, `vars`, `unsafe.bindings`) are **non-inheritable** in Wrangler. Defining them at the top level does NOT make them available in environments. Every binding must be explicitly redefined under `[env.staging]` and `[env.production]`.
**How to avoid:** Copy every binding section into each environment. The binding names (`AUTH_KV`, `USAGE_DB`, `TOKEN_COORDINATOR`, etc.) should be identical across environments -- only the resource IDs differ.
**Warning signs:** Worker deploys successfully but returns 500 errors; `wrangler tail --env staging` shows "ReferenceError: AUTH_KV is not defined".

### Pitfall 2: Top-Level Config Becomes Dead Code

**What goes wrong:** After adding environments, the top-level `[vars]`, `[[kv_namespaces]]`, `[[d1_databases]]`, `[durable_objects]`, and `[[unsafe.bindings]]` sections still exist in `wrangler.toml` but are never used because all deploys use `--env staging` or `--env production`.
**Why it happens:** When deploying with `--env`, the environment-specific config is used, not the top level. Top-level bindings only apply to the default (no-env) deployment.
**How to avoid:** Remove top-level bindings after adding environment-specific ones. Keep only inheritable settings at top level: `name`, `main`, `compatibility_date`, `keep_vars`, `[[migrations]]`, `[triggers]`.
**Warning signs:** Running `wrangler deploy` (without `--env`) deploys a Worker with placeholder IDs that crashes. Always use `--env staging` or `--env production`.

### Pitfall 3: Forgot to Create Resources Before Configuring

**What goes wrong:** You put KV/D1 IDs in `wrangler.toml` but the corresponding Cloudflare resources don't exist. Deploy fails with "namespace not found" or "database not found".
**Why it happens:** The `wrangler.toml` references resources by ID, but those resources must be created first via `wrangler kv namespace create` and `wrangler d1 create`.
**How to avoid:** Create resources first, capture the IDs from command output, then paste IDs into `wrangler.toml`.
**Warning signs:** Deploy error messages referencing unknown namespace or database IDs.

### Pitfall 4: D1 Migrations Not Applied to New Database

**What goes wrong:** Worker deploys and starts, but any request touching the database (usage recording, admin endpoints) fails with "table not found" SQL errors.
**Why it happens:** Creating a D1 database gives you an empty database. The `usage` and `rate_limit_events` tables don't exist until you run `wrangler d1 migrations apply`.
**How to avoid:** After creating each D1 database, immediately apply migrations. The gateway requires SQL migration files in the `migrations/` directory (need to create these if they don't exist -- currently the D1 schema is not captured in migration files).
**Warning signs:** 500 errors on `/v1/*` routes; `wrangler tail` shows "D1_ERROR: no such table: usage".

### Pitfall 5: Custom Domain Requires Zone Ownership

**What goes wrong:** Deploying with `custom_domain = true` for `api.feelr.dev` fails with "zone not found" or permission error.
**Why it happens:** Custom Domains require the zone (`feelr.dev`) to be active in the same Cloudflare account. If the zone was set up under a different account or isn't active yet, the deploy fails.
**How to avoid:** Phase 11 confirmed the zone is active (nameservers: `braden.ns.cloudflare.com`, `ruth.ns.cloudflare.com`). Ensure the `wrangler` CLI is authenticated to the same Cloudflare account that owns the `feelr.dev` zone.
**Warning signs:** Deploy error: "Could not create Custom Domain for api.feelr.dev".

### Pitfall 6: Secrets Must Be Set AFTER First Deploy

**What goes wrong:** You try to run `wrangler secret put ENCRYPTION_KEY --env staging` but get an error because the Worker `feelr-gateway-staging` doesn't exist yet.
**Why it happens:** `wrangler secret put` targets a specific Worker by name. The Worker is created on first `wrangler deploy --env staging`. If the Worker doesn't exist, the secret command fails.
**How to avoid:** Deploy first (the Worker will fail health checks without secrets, but it will exist), then set secrets, then redeploy. Alternatively, accept the deployment failure on first deploy and set secrets immediately after.
**Warning signs:** Error: "Worker not found" when running `wrangler secret put --env staging`.

### Pitfall 7: Rate Limit unsafe.bindings Also Non-Inheritable

**What goes wrong:** Rate limiting doesn't work in staging/production even though it's defined at the top level.
**Why it happens:** `[[unsafe.bindings]]` for rate limiting follow the same non-inheritance rules as all other bindings. They must be explicitly defined under each environment.
**How to avoid:** Copy all four `[[unsafe.bindings]]` rate limit configurations into each environment section.
**Warning signs:** Rate limit middleware returns errors or silently passes all requests; `wrangler tail` shows binding-related errors.

### Pitfall 8: Missing D1 Migration Files

**What goes wrong:** Running `wrangler d1 migrations apply` reports "no migrations to apply" because there are no `.sql` files in the `migrations/` directory.
**Why it happens:** The current gateway uses `USAGE_DB` with SQL tables (`usage`, `rate_limit_events`) but may not have formal migration files. The D1 tables might have been created via direct SQL execution during development.
**How to avoid:** Before Phase 12 resource creation, verify that a `migrations/` directory exists with `.sql` files that create the required tables. If not, create the initial migration file capturing the current schema.
**Warning signs:** Empty `migrations/` directory; `wrangler d1 migrations list` shows no pending migrations.

## Code Examples

### Resource Creation Script (Run Once Per Environment)

```bash
#!/bin/bash
# Phase 12: Create Cloudflare resources for staging and production
# Run from apps/gateway/ directory

set -euo pipefail

echo "=== Creating STAGING resources ==="

# KV namespace for staging
echo "Creating staging KV namespace..."
npx wrangler kv namespace create AUTH_KV --env staging
# Save the output ID -> paste into wrangler.toml [[env.staging.kv_namespaces]] id

# D1 database for staging
echo "Creating staging D1 database..."
npx wrangler d1 create feelr-usage-staging
# Save the output database_id -> paste into wrangler.toml [[env.staging.d1_databases]] database_id

echo ""
echo "=== Creating PRODUCTION resources ==="

# KV namespace for production
echo "Creating production KV namespace..."
npx wrangler kv namespace create AUTH_KV --env production
# Save the output ID -> paste into wrangler.toml [[env.production.kv_namespaces]] id

# D1 database for production
echo "Creating production D1 database..."
npx wrangler d1 create feelr-usage-production
# Save the output database_id -> paste into wrangler.toml [[env.production.d1_databases]] database_id

echo ""
echo "=== Done. Paste IDs into wrangler.toml ==="
```

Source: [Cloudflare KV Environments](https://developers.cloudflare.com/kv/reference/environments/), [Cloudflare D1 Environments](https://developers.cloudflare.com/d1/configuration/environments/)

### Secret Provisioning Script (Run After First Deploy)

```bash
#!/bin/bash
# Phase 12: Set secrets for each environment
# Interactive -- will prompt for each secret value

set -euo pipefail
cd apps/gateway

echo "=== Setting STAGING secrets ==="
npx wrangler secret put ENCRYPTION_KEY --env staging
npx wrangler secret put ADMIN_TOKEN --env staging
npx wrangler secret put SLACK_CLIENT_ID --env staging
npx wrangler secret put SLACK_CLIENT_SECRET --env staging

echo ""
echo "=== Setting PRODUCTION secrets ==="
npx wrangler secret put ENCRYPTION_KEY --env production
npx wrangler secret put ADMIN_TOKEN --env production
npx wrangler secret put SLACK_CLIENT_ID --env production
npx wrangler secret put SLACK_CLIENT_SECRET --env production

echo ""
echo "=== Secrets set. Redeploy to activate. ==="
```

Source: [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

### D1 Migration Application

```bash
# Apply schema to staging database
npx wrangler d1 migrations apply feelr-usage-staging --env staging --remote

# Apply schema to production database
npx wrangler d1 migrations apply feelr-usage-production --env production --remote
```

Source: [Cloudflare D1 Migrations](https://developers.cloudflare.com/d1/reference/migrations/)

### Verification Commands

```bash
# Verify staging Worker health
curl -s https://feelr-gateway-staging.<your-subdomain>.workers.dev/health | jq

# Verify production Worker health (Custom Domain)
curl -s https://api.feelr.dev/health | jq

# Verify SSL certificate on api.feelr.dev
curl -sI https://api.feelr.dev/health | grep -i 'HTTP\|server\|cf-ray'

# Verify DNS record for api.feelr.dev
dig api.feelr.dev @1.1.1.1

# Verify data isolation: write to staging KV
npx wrangler kv key put --env staging --binding AUTH_KV "test-key" "staging-value"
# Confirm not in production:
npx wrangler kv key get --env production --binding AUTH_KV "test-key"
# Should return: "Key not found"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Wrangler `kv:namespace` (colon syntax) | Wrangler `kv namespace` (space syntax) | Wrangler 3.60.0 (2024) | CLI commands use space-separated subcommands |
| `new_classes` (KV-backed DO) | `new_sqlite_classes` (SQLite-backed DO) | 2025 | SQLite is now default and recommended; Free plan requires SQLite-backed DOs |
| Wrangler `wrangler.toml` only | `wrangler.toml` OR `wrangler.jsonc` supported | Wrangler 4.x | Both formats work; TOML is more established in ecosystem |
| Manual DNS record creation | Custom Domains auto-create DNS records | 2022+ | `custom_domain = true` in routes eliminates manual DNS management |
| `keep_bindings` flag | `keep_vars` flag | Wrangler 4.x | Controls preservation of dashboard-configured vars on deploy |

**Deprecated/outdated:**
- `wrangler publish`: Replaced by `wrangler deploy` in Wrangler 3.x
- `kv:namespace create` (colon syntax): Use `kv namespace create` (space syntax) in Wrangler 3.60+
- `new_classes` for DO migrations: Use `new_sqlite_classes` for all new Durable Object classes

## Open Questions

1. **D1 migration files DO NOT exist -- must be created (CONFIRMED)**
   - What we know: **No `migrations/` directory exists in `apps/gateway/`.** The gateway uses `CREATE TABLE IF NOT EXISTS` inline in code (`usage-recorder.ts` lines 28-42 and 86-95). Tables: `usage` (7 columns + 4 indexes) and `rate_limit_events` (5 columns + 2 indexes). The exact schemas are exported as `USAGE_TABLE_SCHEMA` and `RATE_LIMIT_EVENTS_TABLE_SCHEMA` constants.
   - What this means: New D1 databases created via `wrangler d1 create` will be completely empty. Without migration files, `wrangler d1 migrations apply` has nothing to apply.
   - Recommendation: **Phase 12 must create an initial D1 migration file (`0001_init.sql`)** with both table schemas before provisioning databases. This is a prerequisite for the databases to function. The migration should be applied to both staging and production D1 databases after creation.

2. **Should staging have a custom domain (e.g., `staging-api.feelr.dev`)?**
   - What we know: The success criteria only require `api.feelr.dev` (production). Staging can use the `.workers.dev` URL.
   - What's unclear: Whether a staging subdomain would be useful for Phase 13 (CI/CD) smoke tests.
   - Recommendation: Use `.workers.dev` URL for staging in Phase 12. A staging custom domain can be added later if needed. Keeps Phase 12 focused.

3. **What Cloudflare account is the zone under, and is the Wrangler CLI authenticated?**
   - What we know: Phase 11 confirmed the `feelr.dev` zone is active at Cloudflare with nameservers `braden.ns.cloudflare.com` and `ruth.ns.cloudflare.com`.
   - What's unclear: Whether `wrangler whoami` would show the correct account, and whether the `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID` is configured.
   - Recommendation: Verify `wrangler whoami` as the first step. If not authenticated, run `wrangler login` before any resource creation.

4. **Are Stripe secrets (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET) needed per environment?**
   - What we know: The gateway `AppEnv` types show these as optional (`?`). They are only used when billing is enabled.
   - What's unclear: Whether billing will be enabled in staging/production at this phase.
   - Recommendation: Skip Stripe secrets for Phase 12. They can be added later when billing is configured. The `plan-enforcer.ts` should gracefully handle missing Stripe bindings.

## Existing Codebase Analysis

### Current wrangler.toml State

The existing `apps/gateway/wrangler.toml` has:
- **Placeholder KV ID:** `id = "placeholder-create-with-wrangler"` (line 17)
- **Placeholder D1 ID:** `database_id = "placeholder-create-with-wrangler"` (line 30)
- **All bindings at top level:** Need to move into `[env.staging]` and `[env.production]`
- **No environments defined:** No `[env.*]` sections exist
- **No routes/custom domains:** No routing configuration
- **DO migration present:** `[[migrations]]` with `new_sqlite_classes = ["TokenCoordinator"]` (correct)
- **4 rate limit bindings:** All `[[unsafe.bindings]]` need duplication into each env
- **Cron trigger present:** `[triggers]` section (inheritable)

### Files That Need Changes

| File | Change | Why |
|------|--------|-----|
| `apps/gateway/wrangler.toml` | Major restructuring: add environments, move bindings, add routes | Core deliverable of Phase 12 |
| `apps/gateway/.dev.vars` or `.dev.vars.staging` | Create for local dev secrets | Needed for `wrangler dev --env staging` |
| `apps/gateway/migrations/0001_init.sql` | **Must create** -- currently missing | D1 schema migration for `usage` + `rate_limit_events` tables (schemas in `usage-recorder.ts`) |
| `.gitignore` | Add `.dev.vars*` and `.env*` patterns | **Currently missing** -- secrets files would be committed without this |

### Files That Do NOT Change

| File | Why No Change |
|------|---------------|
| `apps/gateway/src/index.ts` | Adapter layer already handles binding abstraction |
| `apps/gateway/src/app.ts` | Application code is environment-agnostic |
| `apps/gateway/src/lib/types.ts` | `AppEnv` interface already defines all bindings generically |
| `apps/gateway/src/runtime/factory.ts` | `createCloudBindings()` wraps whatever raw bindings are provided |
| `apps/gateway/package.json` | No new dependencies needed |

### Key Insight: Zero Application Code Changes

The gateway was architected with runtime abstraction from the start (Phase 1 + Phase 9). The `AppEnv` interface uses abstract `KeyValueStore`, `UsageDatabase`, `RateLimiter`, and `TokenCoordinatorClient` types. The `createCloudBindings()` factory wraps raw Cloudflare bindings into these interfaces. Environment isolation is entirely a Wrangler/infrastructure concern -- the application code is identical in both environments.

## Sources

### Primary (HIGH confidence)
- [Cloudflare Workers Environments](https://developers.cloudflare.com/workers/wrangler/environments/) - Environment definition, naming, inheritance rules
- [Cloudflare Wrangler Configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) - Inheritable vs non-inheritable fields, `keep_vars`, full TOML schema
- [Cloudflare Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) - Custom domain config, auto DNS/SSL provisioning
- [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/) - Secret management, `wrangler secret put --env`, preservation behavior
- [Cloudflare KV Environments](https://developers.cloudflare.com/kv/reference/environments/) - Per-environment KV namespace configuration, CLI commands
- [Cloudflare D1 Environments](https://developers.cloudflare.com/d1/configuration/environments/) - Per-environment D1 database configuration
- [Cloudflare D1 Migrations](https://developers.cloudflare.com/d1/reference/migrations/) - Migration creation, application, `--env` flag
- [Cloudflare Durable Objects Environments](https://developers.cloudflare.com/durable-objects/reference/environments/) - DO bindings per env, `script_name`, migration inheritance
- [Cloudflare DO Migrations](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/) - Migration types, `new_sqlite_classes`, top-level vs per-env

### Secondary (MEDIUM confidence)
- [Community: Structuring wrangler.toml for staging/production](https://community.cloudflare.com/t/how-to-structure-wrangler-toml-for-env-staging-production/540735) - Community patterns for multi-env configs
- [Community: Rate limit bindings with environments](https://community.cloudflare.com/t/new-rate-limiting-binding-impossible-to-add-new-env-variables/659433) - Confirmed `unsafe.bindings` non-inheritable behavior

### Verified via Project Files (HIGH confidence)
- `apps/gateway/wrangler.toml` - Current single-environment config with placeholder IDs
- `apps/gateway/src/lib/types.ts` - `AppEnv` interface confirming all required bindings
- `apps/gateway/src/runtime/factory.ts` - `createCloudBindings()` adapter wrapping
- `apps/gateway/src/index.ts` - Worker entry point with adapter layer
- `apps/gateway/src/scheduled.ts` - Cron handler confirming D1 table names (`usage`, `rate_limit_events`)
- `.planning/phases/11-dns-cloudflare-zone-setup-cicd-audit/11-VERIFICATION.md` - Phase 11 confirmed: zone active, nameservers set, SSL Full mode
- `.planning/REQUIREMENTS.md` - Requirements GW-01 through GW-04 and DNS-03

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All tools already used in project; Wrangler is the only tool for this work
- Architecture: HIGH - Environment isolation is core Wrangler functionality, thoroughly documented by Cloudflare
- Pitfalls: HIGH - Non-inheritable bindings is the primary risk, confirmed across multiple official docs and community sources
- Custom Domains: HIGH - Well-documented feature, prerequisite (zone active) confirmed by Phase 11

**Research date:** 2026-02-09
**Valid until:** 2026-03-11 (30 days -- Wrangler config syntax is stable; Cloudflare Workers platform is mature)
