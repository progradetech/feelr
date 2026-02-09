# Architecture Patterns: Deployment & CI/CD Infrastructure

**Domain:** Deployment pipelines, CI/CD, DNS, and container infrastructure for a multi-runtime monorepo
**Researched:** 2026-02-09
**Confidence:** HIGH (verified with official Cloudflare, Turborepo, Docker, and Azure docs)

---

## Recommended Architecture

Feelr's deployment architecture maps four distinct deployment targets to three infrastructure providers, unified by a single monorepo CI/CD pipeline in GitHub Actions. The critical insight: **each service has a different deployment mechanism** (Wrangler for Workers, Docker for Azure, GoReleaser for CLI), so the CI/CD layer must orchestrate heterogeneous deploys with correct dependency ordering.

```
                         GitHub Actions (CI/CD Hub)
                        /          |            \
                       /           |             \
         wrangler deploy    docker push      goreleaser
              |                 |    \             |
              v                 v     v            v
      Cloudflare Workers    Docker Hub        GitHub Releases
      (api.feelr.dev)       /       \         + Homebrew Tap
              |            v         v
        KV + D1 + DO    Azure       Azure
                       App Svc    App Svc
                    (app.feelr.dev) (feelr.dev)

         DNS: Namecheap -> Cloudflare (api subdomain)
              Namecheap -> Azure (app + root domain)
```

### Deployment Target Matrix

| Service | Target | Mechanism | Image/Artifact | Custom Domain |
|---------|--------|-----------|----------------|---------------|
| **Gateway** | Cloudflare Workers | `wrangler deploy` | JS bundle (automatic) | api.feelr.dev (CF Custom Domain) |
| **Dashboard** | Azure App Service | Docker Hub pull | Nginx + static files | app.feelr.dev (CNAME to Azure) |
| **Docs** | Azure App Service | Docker Hub pull | Nginx + static files | feelr.dev (A + TXT record to Azure) |
| **CLI** | GitHub Releases | GoReleaser | Multi-platform binaries | N/A (download from GitHub) |
| **Self-host image** | Docker Hub | docker build/push | workerd + s6-overlay | N/A (user-managed) |

### Why Docker Hub (Not Azure Container Registry)

Use Docker Hub because the self-host image already needs to be on Docker Hub for community users to `docker pull`. Pushing dashboard and docs images there too means one registry, one set of credentials, simpler CI. Azure App Service supports Docker Hub natively -- no ACR needed for this scale.

---

## Component Boundaries: New vs Modified

### New Components (To Build)

| Component | Purpose | Location |
|-----------|---------|----------|
| **CI workflow: gateway** | Test + deploy Workers on push to main | `.github/workflows/gateway.yml` |
| **CI workflow: dashboard** | Build Docker image, push, trigger Azure restart | `.github/workflows/dashboard.yml` |
| **CI workflow: docs** | Build Docker image, push, trigger Azure restart | `.github/workflows/docs.yml` |
| **CI workflow: pr-check** | Lint + typecheck + test on PR (all affected packages) | `.github/workflows/pr-check.yml` |
| **Dashboard Dockerfile** | Multi-stage: pnpm build static export -> Nginx | `apps/dashboard/Dockerfile` |
| **Docs Dockerfile** | Multi-stage: pnpm build static export -> Nginx | `apps/docs/Dockerfile` |
| **Wrangler staging env** | `[env.staging]` block in wrangler.toml | `apps/gateway/wrangler.toml` |
| **Wrangler production env** | `[env.production]` block in wrangler.toml | `apps/gateway/wrangler.toml` |

### Modified Components

| Component | Change | Why |
|-----------|--------|-----|
| `apps/gateway/wrangler.toml` | Add `[env.staging]` and `[env.production]` with per-env KV/D1/DO bindings and custom domain routes | Bindings are NOT inheritable in Wrangler -- each env needs explicit KV IDs, D1 IDs, DO bindings |
| `.github/workflows/release.yml` | Extend to also build + push self-host Docker image on tag | Self-host image should be published alongside CLI binaries on release |
| `turbo.json` | Add `lint` task, refine `deploy` outputs | CI needs explicit lint task; deploy needs per-env awareness |
| `apps/dashboard/next.config.ts` | Potentially switch from `output: 'export'` to `output: 'standalone'` for SSR support, OR keep static and use build-arg for API URL | See "Critical Decision" section below |

---

## Critical Decision: Dashboard Static Export vs Standalone

**Current state:** The dashboard uses `output: 'export'` (fully static, Nginx-servable). The API URL is baked in at build time via `NEXT_PUBLIC_GATEWAY_URL`.

**Implication:** The Docker image is environment-specific. Building with `NEXT_PUBLIC_GATEWAY_URL=https://api.feelr.dev` creates an image that ONLY works for production. A staging image needs a separate build with a different URL.

**Recommendation: Keep static export.** The dashboard is a simple SPA that calls the gateway API. There is no SSR, no server-side data fetching, no need for Node.js at runtime. Static export with Nginx results in:
- Tiny image (~25MB vs ~150MB+ for standalone)
- Zero runtime dependencies (no Node.js process to crash)
- Trivially cacheable
- The build-arg approach for API URL is standard for static SPAs

The tradeoff (separate builds per environment) is acceptable because you only have two environments (staging + production), and builds are fast (~30s for a static export).

---

## Wrangler Environment Architecture

**Confidence: HIGH** (verified with official Cloudflare docs on environments and non-inheritable bindings)

Wrangler environments create separate Workers named `<worker>-<env>`. Bindings (KV, D1, DO, vars, secrets) are NOT inherited and must be explicitly declared per environment.

### Recommended wrangler.toml Structure

```toml
name = "feelr-gateway"
main = "src/index.ts"
compatibility_date = "2026-02-05"

# Top-level = development (wrangler dev)
[vars]
ENVIRONMENT = "development"

[[kv_namespaces]]
binding = "AUTH_KV"
id = "placeholder-create-with-wrangler"

[durable_objects]
bindings = [
  { name = "TOKEN_COORDINATOR", class_name = "TokenCoordinator" }
]

[[d1_databases]]
binding = "USAGE_DB"
database_name = "feelr-usage"
database_id = "placeholder-create-with-wrangler"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["TokenCoordinator"]

# ---------- Staging ----------
[env.staging]
vars = { ENVIRONMENT = "staging" }

[[env.staging.kv_namespaces]]
binding = "AUTH_KV"
id = "<staging-kv-id>"

[env.staging.durable_objects]
bindings = [
  { name = "TOKEN_COORDINATOR", class_name = "TokenCoordinator" }
]

[[env.staging.d1_databases]]
binding = "USAGE_DB"
database_name = "feelr-usage-staging"
database_id = "<staging-d1-id>"

[[env.staging.routes]]
pattern = "staging-api.feelr.dev"
custom_domain = true

# Rate limiting bindings (must be redeclared per env)
[[env.staging.unsafe.bindings]]
name = "RATE_LIMIT_FREE"
type = "ratelimit"
namespace_id = "0"
simple = { limit = 30, period = 60 }

# ... (all other rate limit bindings)

# ---------- Production ----------
[env.production]
vars = { ENVIRONMENT = "production" }

[[env.production.kv_namespaces]]
binding = "AUTH_KV"
id = "<production-kv-id>"

[env.production.durable_objects]
bindings = [
  { name = "TOKEN_COORDINATOR", class_name = "TokenCoordinator" }
]

[[env.production.d1_databases]]
binding = "USAGE_DB"
database_name = "feelr-usage"
database_id = "<production-d1-id>"

[[env.production.routes]]
pattern = "api.feelr.dev"
custom_domain = true

# Rate limiting bindings
[[env.production.unsafe.bindings]]
name = "RATE_LIMIT_FREE"
type = "ratelimit"
namespace_id = "0"
simple = { limit = 30, period = 60 }

# ... (all other rate limit bindings)
```

### Worker Secrets Per Environment

Secrets are set via `wrangler secret put` and are scoped per environment:

```bash
# Production secrets
npx wrangler secret put ENCRYPTION_KEY --env production
npx wrangler secret put ADMIN_TOKEN --env production
npx wrangler secret put SLACK_CLIENT_ID --env production
npx wrangler secret put SLACK_CLIENT_SECRET --env production
npx wrangler secret put STRIPE_SECRET_KEY --env production

# Staging secrets (different values)
npx wrangler secret put ENCRYPTION_KEY --env staging
npx wrangler secret put ADMIN_TOKEN --env staging
# ... etc
```

### D1 Migrations in CI

D1 migrations run via `wrangler d1 migrations apply` and must target the correct environment:

```bash
# Apply migrations to production D1
npx wrangler d1 migrations apply feelr-usage --env production

# Apply migrations to staging D1
npx wrangler d1 migrations apply feelr-usage-staging --env staging
```

In CI, the confirmation prompt is automatically skipped. If a migration fails, it is rolled back and the previous state remains.

---

## Docker Image Architecture

### Dashboard Dockerfile (Static Export + Nginx)

**Confidence: HIGH** (standard pattern for Next.js static exports)

```dockerfile
# apps/dashboard/Dockerfile
# Multi-stage: turbo prune -> pnpm build -> Nginx serve

# -- Stage 1: Prune monorepo --
FROM node:22-alpine AS pruner
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
RUN pnpm add -g turbo
WORKDIR /app
COPY . .
RUN turbo prune @feelr/dashboard --docker

# -- Stage 2: Build static export --
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Install dependencies from pruned lockfile (layer cache)
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

# Copy full source
COPY --from=pruner /app/out/full/ .

# Build-time API URL injection
ARG NEXT_PUBLIC_GATEWAY_URL=https://api.feelr.dev
ENV NEXT_PUBLIC_GATEWAY_URL=$NEXT_PUBLIC_GATEWAY_URL

RUN pnpm turbo build --filter=@feelr/dashboard

# -- Stage 3: Nginx serve --
FROM nginx:alpine AS runner
COPY --from=builder /app/apps/dashboard/out /usr/share/nginx/html

# Custom nginx config for SPA routing
COPY apps/dashboard/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### Why turbo prune

The `turbo prune --docker` command creates a minimal subset of the monorepo containing only the packages needed to build `@feelr/dashboard`. This:
- Reduces Docker build context from the entire monorepo to only relevant packages
- Separates `package.json` files (for dependency install caching) from source code
- Ensures `pnpm install` layer is cached unless actual dependencies change

### Nginx Configuration for SPA

Both dashboard and docs use `output: 'export'` which produces static HTML/JS/CSS. Nginx needs a fallback rule for client-side routing:

```nginx
# apps/dashboard/nginx.conf
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # Gzip static assets
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 256;

    # Cache static assets aggressively
    location /_next/static/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA fallback: serve index.html for client-side routes
    location / {
        try_files $uri $uri.html $uri/ /index.html;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
}
```

### Docs Dockerfile (Identical Pattern)

The docs site uses the same pattern (Nextra static export + Nginx). The Dockerfile is nearly identical, targeting `@feelr/docs` instead:

```dockerfile
# apps/docs/Dockerfile
FROM node:22-alpine AS pruner
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
RUN pnpm add -g turbo
WORKDIR /app
COPY . .
RUN turbo prune @feelr/docs --docker

FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo build --filter=@feelr/docs

FROM nginx:alpine AS runner
COPY --from=builder /app/apps/docs/out /usr/share/nginx/html
COPY apps/docs/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### Image Size Estimates

| Image | Base | Expected Size | Rationale |
|-------|------|---------------|-----------|
| Dashboard | nginx:alpine | ~25-35MB | Static HTML/JS/CSS only, no Node runtime |
| Docs | nginx:alpine | ~20-30MB | Smaller than dashboard (less JS) |
| Self-host | debian:bookworm-slim | ~150-200MB | Includes workerd binary (~90MB) + s6-overlay |

---

## CI/CD Pipeline Architecture

### Workflow Strategy: Separate Workflows Per Service

**Recommendation: One workflow per deployment target.** Not a single unified workflow because:

1. **Different triggers:** Gateway deploys on push to main. Docker images deploy on push to main but with path filters. CLI releases on tag push.
2. **Different toolchains:** Wrangler for Workers, Docker for containers, GoReleaser for Go binaries.
3. **Different secrets:** Cloudflare API token vs Docker Hub credentials vs Homebrew tap token.
4. **Independent failure:** A dashboard build failure should not block gateway deployment.

### Workflow: PR Check (All Services)

```yaml
# .github/workflows/pr-check.yml
name: PR Check

on:
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Required for --affected

      - uses: pnpm/action-setup@v4
        with:
          version: 9.15.0

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      # Run all checks but only for affected packages
      - run: pnpm turbo typecheck test --affected

  cli-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version-file: cli/go.mod
      - run: cd cli && go vet ./... && go test ./...
```

### Workflow: Gateway Deploy

```yaml
# .github/workflows/gateway.yml
name: Deploy Gateway

on:
  push:
    branches: [main]
    paths:
      - 'apps/gateway/**'
      - 'packages/connector-sdk/**'
      - 'connectors/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9.15.0

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      # Run tests before deploying
      - run: pnpm turbo test --filter=@feelr/gateway

      # Apply D1 migrations first
      - name: Apply D1 migrations
        run: npx wrangler d1 migrations apply feelr-usage --env production
        working-directory: apps/gateway
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

      # Deploy to production
      - name: Deploy to Cloudflare Workers
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: apps/gateway
          command: deploy --env production
```

**Critical path filter:** The gateway workflow triggers on changes to `apps/gateway/`, `packages/connector-sdk/`, or `connectors/` because connectors are bundled INTO the gateway. A connector change requires a gateway redeploy.

### Workflow: Dashboard Deploy

```yaml
# .github/workflows/dashboard.yml
name: Deploy Dashboard

on:
  push:
    branches: [main]
    paths:
      - 'apps/dashboard/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_HUB_USER }}
          password: ${{ secrets.DOCKER_HUB_TOKEN }}

      - uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/dashboard/Dockerfile
          push: true
          tags: |
            ${{ secrets.DOCKER_HUB_USER }}/feelr-dashboard:latest
            ${{ secrets.DOCKER_HUB_USER }}/feelr-dashboard:${{ github.sha }}
          build-args: |
            NEXT_PUBLIC_GATEWAY_URL=https://api.feelr.dev
          cache-from: type=gha
          cache-to: type=gha,mode=max

      # Trigger Azure App Service to pull new image
      - name: Restart Azure App Service
        run: |
          curl -X POST "${{ secrets.AZURE_DASHBOARD_WEBHOOK_URL }}" \
            -H "Content-Length: 0"
```

### Workflow: Docs Deploy

Same pattern as dashboard, targeting `apps/docs/` path filter, `feelr-docs` image name, and `AZURE_DOCS_WEBHOOK_URL` secret.

### Workflow: Release (Existing + Extended)

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - "v*"

permissions:
  contents: write

jobs:
  cli-release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-go@v5
        with:
          go-version-file: cli/go.mod
      - uses: goreleaser/goreleaser-action@v6
        with:
          args: release --clean
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          HOMEBREW_TAP_GITHUB_TOKEN: ${{ secrets.HOMEBREW_TAP_GITHUB_TOKEN }}

  self-host-image:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_HUB_USER }}
          password: ${{ secrets.DOCKER_HUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: self-host/Dockerfile
          push: true
          tags: |
            ${{ secrets.DOCKER_HUB_USER }}/feelr:latest
            ${{ secrets.DOCKER_HUB_USER }}/feelr:${{ github.ref_name }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

---

## Turborepo + Monorepo CI Patterns

### How `--affected` Works in GitHub Actions

**Confidence: HIGH** (verified with Turborepo official docs)

Turborepo detects the CI environment automatically via `GITHUB_BASE_REF` (for PRs) and `GITHUB_EVENT_PATH` (for pushes). The `--affected` flag compares the current commit against the base and only runs tasks for packages with changes.

```bash
# In PR context: compares PR head vs PR base
pnpm turbo typecheck test --affected

# In push context: compares push commit vs parent
pnpm turbo build --affected
```

**Limitation:** `--affected` works at the package level. If `connector-sdk` changes, ALL packages that depend on it (gateway, all connectors) are marked affected. This is correct behavior but means connector-sdk changes trigger a full test run.

### Build Caching Strategy

| Layer | Mechanism | Scope |
|-------|-----------|-------|
| **pnpm install** | GitHub Actions cache (`actions/setup-node` with `cache: pnpm`) | Caches `node_modules` based on lockfile hash |
| **Turbo task cache** | Local `.turbo` directory OR Vercel Remote Cache | Caches build/test/typecheck outputs per package |
| **Docker layer cache** | GitHub Actions cache (`cache-from: type=gha`) | Caches Docker build layers between CI runs |
| **turbo prune** | Reduces Docker context to only relevant packages | Speeds up COPY and install steps |

### Selective Deploy vs Selective Test

**Testing:** Use `--affected` on PRs. Run ALL affected package tests.
**Deploying:** Use path filters on workflows. Each service deploys independently based on which files changed.

These are complementary, not redundant:
- `--affected` determines WHICH tests to run within the PR check workflow
- Path filters determine WHICH deploy workflows trigger on push to main

---

## Deployment Dependency Order

### Initial Setup Order (First-Time DNS + Infrastructure)

This is the one-time setup order when standing up the infrastructure:

```
Step 1: Cloudflare Zone Setup
  - Transfer feelr.dev DNS to Cloudflare (or add zone)
  - Required for Workers Custom Domains
  - Cloudflare manages api.feelr.dev subdomain

Step 2: Create Cloudflare Resources
  - wrangler kv namespace create AUTH_KV (staging + production)
  - wrangler d1 create feelr-usage (staging + production)
  - wrangler secret put ENCRYPTION_KEY (staging + production)
  - Record all IDs for wrangler.toml

Step 3: Deploy Gateway to Cloudflare Workers
  - wrangler deploy --env production
  - This creates the Custom Domain for api.feelr.dev
  - Cloudflare auto-creates DNS record + SSL cert
  - Verify: curl https://api.feelr.dev/health

Step 4: Create Azure App Service Instances
  - feelr-dashboard (container, Linux, B1 tier)
  - feelr-docs (container, Linux, B1 tier)
  - Both start with placeholder nginx image

Step 5: Configure Azure Custom Domains
  - app.feelr.dev -> CNAME to feelr-dashboard.azurewebsites.net
  - feelr.dev -> A record to Azure IP + TXT verification record
  - Configure in Namecheap Advanced DNS (NOT Cloudflare for these)
  - Azure provides free managed SSL for custom domains

Step 6: Build + Push Docker Images
  - Build dashboard image -> Docker Hub
  - Build docs image -> Docker Hub
  - Configure Azure App Service to pull from Docker Hub

Step 7: Enable Continuous Deployment
  - Get webhook URL from Azure Deployment Center for each app
  - Store as GitHub secrets: AZURE_DASHBOARD_WEBHOOK_URL, AZURE_DOCS_WEBHOOK_URL
  - Enable "Continuous deployment" toggle in Azure
```

### DNS Architecture

**Critical nuance:** The domain must be split across two DNS providers.

```
Namecheap DNS Records:

  feelr.dev         A      -> <Azure App Service IP>
  feelr.dev         TXT    -> <Azure domain verification ID>
  app.feelr.dev     CNAME  -> feelr-dashboard.azurewebsites.net
  api.feelr.dev     --     -> (managed by Cloudflare, see below)

Cloudflare DNS (zone must exist for Workers Custom Domains):

  api.feelr.dev     --     -> Auto-created by wrangler deploy (Custom Domain)
```

**Option A (Simpler): Full Cloudflare DNS.** Transfer ALL DNS to Cloudflare. This means the nameservers at Namecheap point to Cloudflare. Then:
- api.feelr.dev: Workers Custom Domain (auto-managed)
- app.feelr.dev: CNAME proxied through Cloudflare -> Azure
- feelr.dev: A record proxied through Cloudflare -> Azure

**Option B (Split DNS): Partial Cloudflare.** Only add the zone to Cloudflare for Workers Custom Domain, keep Namecheap as primary DNS. This is more complex and fragile.

**Recommendation: Option A (Full Cloudflare DNS).** It is simpler, gives you Cloudflare's WAF and DDoS protection for ALL domains for free, and avoids split-brain DNS. The cost is zero (free plan). Change Namecheap nameservers to Cloudflare's assigned nameservers, then manage all records in Cloudflare.

### Ongoing Deploy Order (Per Push to Main)

After initial setup, deployments are independent. No ordering constraint because:
- Gateway is the API backend. It does not depend on dashboard/docs being available.
- Dashboard is a static SPA. It does not depend on docs.
- Docs is fully independent of everything.

The only ordering constraint that matters: **D1 migrations must run BEFORE gateway deploy.** This is handled within the gateway workflow (migration step before deploy step).

```
On push to main:
  [if apps/gateway/** or connectors/** or packages/connector-sdk/** changed]
    -> gateway.yml: migrate D1 -> deploy Workers

  [if apps/dashboard/** changed]
    -> dashboard.yml: build Docker -> push -> webhook Azure

  [if apps/docs/** changed]
    -> docs.yml: build Docker -> push -> webhook Azure

  These run in PARALLEL. No cross-workflow dependency needed.
```

### On Tag Push (Release):

```
On push tag v*:
  [cli-release job]: GoReleaser -> GitHub Releases + Homebrew
  [self-host-image job]: Docker build -> Docker Hub push

  These also run in PARALLEL.
```

---

## GitHub Actions Secrets Inventory

| Secret | Used By | Purpose |
|--------|---------|---------|
| `CLOUDFLARE_API_TOKEN` | gateway.yml | Wrangler deploy + D1 migrations |
| `CLOUDFLARE_ACCOUNT_ID` | gateway.yml | Wrangler account targeting |
| `DOCKER_HUB_USER` | dashboard.yml, docs.yml, release.yml | Docker Hub login |
| `DOCKER_HUB_TOKEN` | dashboard.yml, docs.yml, release.yml | Docker Hub login (access token, NOT password) |
| `AZURE_DASHBOARD_WEBHOOK_URL` | dashboard.yml | Trigger Azure to pull new dashboard image |
| `AZURE_DOCS_WEBHOOK_URL` | docs.yml | Trigger Azure to pull new docs image |
| `GITHUB_TOKEN` | release.yml | GoReleaser GitHub Releases (auto-provided) |
| `HOMEBREW_TAP_GITHUB_TOKEN` | release.yml | Push to andrewprograde/homebrew-feelr |

---

## Patterns to Follow

### Pattern 1: Path-Filtered Workflows

**What:** Each deployment workflow uses `paths:` filter to only trigger when relevant files change.
**When:** All deploy workflows on push to main.
**Why:** Prevents unnecessary deploys. A README change should not redeploy the gateway.

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'apps/gateway/**'
      - 'packages/connector-sdk/**'
      - 'connectors/**'
```

**Important consideration for gateway:** Include `connectors/**` and `packages/connector-sdk/**` in the gateway's path filter because connectors are bundled into the gateway Worker. A connector code change without redeploying the gateway means the change is not live.

### Pattern 2: Webhook-Based Azure Deployment

**What:** After pushing a Docker image to Docker Hub, POST to Azure's webhook URL to trigger a pull + restart.
**When:** Dashboard and docs deploys.
**Why:** Simpler than installing Azure CLI in CI. Azure App Service provides a webhook URL in Deployment Center that triggers image pull when POSTed to.

```yaml
- name: Trigger Azure restart
  run: curl -X POST "${{ secrets.AZURE_DASHBOARD_WEBHOOK_URL }}" -H "Content-Length: 0"
```

### Pattern 3: Build-Time Environment Injection for Static Exports

**What:** Pass environment-specific values as Docker build args for static Next.js exports.
**When:** Dashboard builds.
**Why:** `NEXT_PUBLIC_*` variables are inlined at build time in static exports. The Docker image is environment-specific by design.

```yaml
build-args: |
  NEXT_PUBLIC_GATEWAY_URL=https://api.feelr.dev
```

For staging, a separate build with `NEXT_PUBLIC_GATEWAY_URL=https://staging-api.feelr.dev` would be needed.

### Pattern 4: D1 Migrations Before Deploy

**What:** Run `wrangler d1 migrations apply` as a step BEFORE `wrangler deploy` in the gateway workflow.
**When:** Every gateway deploy.
**Why:** New Worker code may depend on new database schema. Deploying code before migrating the database causes runtime errors.

**Safety:** D1 migrations are atomic. If a migration fails, it rolls back. The Worker code does NOT deploy (the CI step fails, blocking subsequent steps).

### Pattern 5: Docker Layer Caching with GHA

**What:** Use GitHub Actions cache backend for Docker BuildKit layer caching.
**When:** All Docker builds.
**Why:** Dramatically speeds up repeat builds. The `pnpm install` layer (the slowest step) is cached unless the lockfile changes.

```yaml
- uses: docker/build-push-action@v6
  with:
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Single Unified Deploy Workflow

**What:** One massive workflow that deploys gateway, dashboard, docs, and CLI together.
**Why bad:** Couples unrelated deployments. A dashboard CSS change blocks on gateway tests. A gateway failure blocks docs deploy. Makes debugging CI failures harder.
**Instead:** Separate workflows per target with path filters.

### Anti-Pattern 2: Using `turbo deploy` for Everything

**What:** Running `pnpm turbo deploy` and expecting Turborepo to handle all deployment targets.
**Why bad:** Turborepo is a task runner, not a deployment orchestrator. It does not know how to wrangler deploy, docker push, or goreleaser release. The `deploy` task in turbo.json runs package-level scripts, but deployment needs CI-level orchestration (secrets, environments, webhooks).
**Instead:** Use Turborepo for build/test/typecheck. Use GitHub Actions workflows for deployment orchestration.

### Anti-Pattern 3: Skipping turbo prune for Docker

**What:** Copying the entire monorepo into Docker build context.
**Why bad:** Docker context upload is slow (all node_modules, .git, etc). Layer caching breaks on any file change. The image includes unnecessary files.
**Instead:** Use `turbo prune @feelr/dashboard --docker` to create a minimal context with only relevant packages and a pruned lockfile.

### Anti-Pattern 4: Hardcoding API URLs in Code

**What:** Writing `https://api.feelr.dev` directly in dashboard source code.
**Why bad:** Cannot deploy to staging, local dev breaks, self-hosting requires code changes.
**Instead:** Always use `NEXT_PUBLIC_GATEWAY_URL` environment variable with a sensible default (`http://localhost:8787` for dev). Inject the production URL at build time via Docker build args.

### Anti-Pattern 5: Applying D1 Migrations Manually

**What:** SSH-ing in or running migrations from a developer laptop before deploying.
**Why bad:** Humans forget. Migrations drift. No audit trail. Race conditions if two developers migrate simultaneously.
**Instead:** Migrations are always applied by CI as a step in the gateway deploy workflow. Never manually.

---

## Azure App Service Configuration

### Dashboard App Service

| Setting | Value | Notes |
|---------|-------|-------|
| **Name** | feelr-dashboard | -> feelr-dashboard.azurewebsites.net |
| **Plan** | B1 Linux | ~$13/mo, sufficient for container hosting |
| **Container** | Docker Hub: `andrewprograde/feelr-dashboard:latest` | Updated via webhook |
| **Custom domain** | app.feelr.dev | CNAME -> feelr-dashboard.azurewebsites.net |
| **SSL** | Azure managed certificate (free) | Auto-renewed |
| **Continuous deployment** | Enabled (webhook) | Pulls new image on push |

### Docs App Service

| Setting | Value | Notes |
|---------|-------|-------|
| **Name** | feelr-docs | -> feelr-docs.azurewebsites.net |
| **Plan** | B1 Linux (shared with dashboard) | Same App Service Plan |
| **Container** | Docker Hub: `andrewprograde/feelr-docs:latest` | Updated via webhook |
| **Custom domain** | feelr.dev | A record + TXT verification |
| **SSL** | Azure managed certificate (free) | Auto-renewed |
| **Continuous deployment** | Enabled (webhook) | Pulls new image on push |

**Cost note:** Both apps can share the same B1 App Service Plan (~$13/mo total, not per app). Two apps on one plan is standard for low-traffic sites.

---

## Scalability Considerations

| Concern | Current (Launch) | At 10K users | At 100K users |
|---------|-----------------|--------------|---------------|
| **Gateway deploy** | Wrangler direct deploy, ~20s | Same. CF Workers scale automatically. | Same. No changes needed. |
| **Dashboard/Docs images** | Single Azure B1 instance | Still fine for static files. Nginx handles thousands of concurrent connections. | Consider Azure CDN or Cloudflare proxy for global caching. |
| **CI build time** | ~3-5 min per workflow | Turbo remote cache helps. Consider parallel jobs. | Self-hosted runners if GH Actions minutes become expensive. |
| **Docker image pulls** | Docker Hub free tier (200 pulls/6hrs) | Should be fine (one pull per deploy). | Consider caching proxy or pre-pulling. |
| **D1 migrations** | Instantaneous for small schemas | Same. Migrations are schema-only, not data. | Same. |

---

## Sources

- [Cloudflare Workers Environments](https://developers.cloudflare.com/workers/wrangler/environments/) -- HIGH confidence, official docs
- [Cloudflare KV Environments](https://developers.cloudflare.com/kv/reference/environments/) -- HIGH confidence, official docs
- [Cloudflare Durable Objects Environments](https://developers.cloudflare.com/durable-objects/reference/environments/) -- HIGH confidence, official docs
- [Cloudflare Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) -- HIGH confidence, official docs
- [Cloudflare D1 Migrations](https://developers.cloudflare.com/d1/reference/migrations/) -- HIGH confidence, official docs
- [Cloudflare Workers GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/) -- HIGH confidence, official docs
- [Cloudflare Wrangler Configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) -- HIGH confidence, official docs
- [Turborepo Constructing CI](https://turborepo.dev/docs/crafting-your-repository/constructing-ci) -- HIGH confidence, official docs
- [Turborepo Docker Guide](https://turborepo.dev/docs/guides/tools/docker) -- HIGH confidence, official docs
- [Turborepo GitHub Actions Guide](https://turborepo.dev/docs/guides/ci-vendors/github-actions) -- HIGH confidence, official docs
- [Docker Build and Push Action](https://github.com/docker/build-push-action) -- HIGH confidence, official GitHub Action
- [Docker Login Action](https://github.com/docker/login-action) -- HIGH confidence, official GitHub Action
- [Cloudflare Wrangler Action](https://github.com/cloudflare/wrangler-action) -- HIGH confidence, official GitHub Action
- [Azure App Service Custom Container CI/CD](https://learn.microsoft.com/en-us/azure/app-service/deploy-ci-cd-custom-container) -- HIGH confidence, official Microsoft docs
- [Azure App Service Custom Domain Setup](https://learn.microsoft.com/en-us/azure/app-service/app-service-web-tutorial-custom-domain) -- HIGH confidence, official Microsoft docs
- [Azure App Service Webhooks for Docker Hub](https://azureossd.github.io/2025/12/16/Using-Webhooks-for-image-pulls-with-Web-App-for-Containers/index.html) -- MEDIUM confidence, Azure engineering team blog
- [Namecheap to Azure DNS Guide](https://gist.github.com/hans-ob1/a1656f660379117eb8d8661042911fe6) -- MEDIUM confidence, community gist
- [Next.js Static Export Docker Nginx](https://dbtek.medium.com/deploy-next-js-14-static-export-with-nginx-81380ea41140) -- MEDIUM confidence, community guide
