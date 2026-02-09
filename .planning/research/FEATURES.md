# Feature Landscape: Deployment & CI/CD Infrastructure

**Domain:** Production deployment for multi-service app (Cloudflare Workers + Azure App Service + GitHub Actions)
**Researched:** 2026-02-09
**Confidence:** HIGH (official platform docs verified, existing codebase inspected)

## Context

Feelr v1.0 is shipped. The app consists of three services that need production deployment:

- **api.feelr.dev** -- Cloudflare Workers (edge gateway with Hono, KV, Durable Objects, D1)
- **app.feelr.dev** -- Azure App Service (Next.js 15 dashboard, containerized)
- **feelr.dev** -- Azure App Service (Nextra docs/marketing site, containerized)

Existing infrastructure: monorepo with pnpm + Turborepo, GoReleaser for CLI, self-host Docker image. One GitHub Actions workflow exists (release.yml for Go CLI via GoReleaser). No deployment workflows, no staging environments, no DNS configuration, no deployment guides exist yet.

---

## Table Stakes

Features that production deployments universally require. Missing any of these is a blocker.

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| Wrangler environment configuration (staging + production) | Workers without environments means deploying directly to production with no safety net. Every serious Workers project uses at least two environments. | LOW | Existing wrangler.toml needs `[env.staging]` and `[env.production]` blocks with separate KV/DO/D1 bindings |
| Workers secrets management in CI | Gateway requires ENCRYPTION_KEY, ADMIN_TOKEN, SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, STRIPE_SECRET_KEY. Deploying without secrets = broken service. | LOW | GitHub repository secrets + cloudflare/wrangler-action secret passthrough |
| Workers custom domain (api.feelr.dev) | A workers.dev subdomain is not acceptable for production. Custom domain provides SSL, professional URLs, and stable addressing. | LOW | Cloudflare zone for feelr.dev must be active; Workers Custom Domains auto-provision SSL certificates |
| Azure App Service Dockerfiles (dashboard + docs) | Neither app has a Dockerfile. Cannot deploy to Azure App Service for Containers without them. Self-host Dockerfile exists but bundles both gateway + dashboard for self-hosting, not suitable for cloud. | MEDIUM | Separate Dockerfiles for dashboard and docs; multi-stage builds with pnpm workspace awareness |
| Azure custom domains (app.feelr.dev, feelr.dev) | Default Azure URLs (*.azurewebsites.net) are not acceptable for production. | LOW | DNS CNAME records pointing to Azure + TXT records for domain verification |
| Azure managed SSL certificates | HTTPS is non-negotiable. Azure provides free managed certificates for custom domains that auto-renew every 6 months. | LOW | Custom domain must be configured first; CNAME must be resolvable for certificate issuance |
| GitHub Actions CI workflow (lint, typecheck, test) | Every push and PR must be validated before deployment. No CI = broken code reaches production. | MEDIUM | pnpm install + turbo run typecheck + turbo run test; cache pnpm store for speed |
| GitHub Actions CD workflow (deploy on merge/tag) | Manual deployments do not scale. main branch should deploy to staging; version tags should deploy to production. | HIGH | Separate jobs for gateway (wrangler), dashboard (Docker + Azure), docs (Docker + Azure); path-based filtering |
| DNS records for all three services | Without DNS, nothing is reachable at the planned domains. | LOW | Cloudflare DNS zone: CNAME for api/app subdomains, A/CNAME for apex |
| Health check endpoints for Azure apps | Azure App Service uses health probes to determine instance readiness. Without a health endpoint, Azure cannot properly manage container lifecycle or slot swaps. | LOW | Dashboard and docs need `/api/health` or similar route returning 200 |
| GitHub Actions environment protection for production | Production deploys without any gate = accidental deploys from bad merges. Environment protection rules are table stakes for any team shipping to production. | LOW | GitHub environment "production" with required reviewers or wait timer; deployment branches restricted to tags |
| Deployment secrets management | Secrets scattered across platforms with no documentation = locked-out-of-production scenarios. Every secret must be documented (not the value, the name and where it lives). | LOW | Secret inventory document listing every secret, which platform stores it, and how to rotate |
| Rollback procedures | Every deployment needs a known rollback path. "Just revert the commit" is not a rollback plan. | LOW | Workers: `wrangler rollback` or redeploy previous version. Azure: swap slots back or redeploy previous image tag. |

## Differentiators

Features that elevate deployment from "it works" to "it works well and is maintainable."

| Feature | Value Proposition | Complexity | Dependencies |
|---------|-------------------|------------|--------------|
| Wrangler gradual rollouts for gateway | Workers supports splitting traffic between two versions by percentage. For an API gateway handling real traffic, this prevents blast-radius-100% deployments. | MEDIUM | Wrangler 3.40.0+ (project uses 4.x, so available); separate `wrangler versions upload` + `wrangler versions deploy` commands; **limitation: Durable Objects require single-version** so DO-heavy operations need careful handling |
| Azure deployment slots (staging slot) | Deploy to staging slot, verify, then swap to production with zero downtime. Slot swap is atomic -- no request dropping. | MEDIUM | Requires Standard tier or higher App Service Plan ($$$). Auto swap is NOT supported for Linux containers -- must use manual or scripted swaps. |
| Post-deploy smoke tests in CI | After each deployment, automatically verify the service is actually working by hitting health/status endpoints. Catches "deployed but broken" scenarios that pass all pre-deploy tests. | LOW | `curl` or `eko/url-health-check` action hitting /health after deploy step completes; retry logic for cold starts |
| Monorepo path-filtered deployments | Only deploy what changed. Gateway code change should not trigger dashboard redeploy. Saves CI minutes and reduces unnecessary deployment risk. | MEDIUM | `dorny/paths-filter` action or built-in `paths:` trigger filter; outputs feed conditional deploy jobs |
| Turborepo remote cache in CI | pnpm + Turbo builds are fast locally but CI starts from scratch each run. Remote caching lets CI reuse build artifacts across runs. | LOW | Set TURBO_TOKEN and TURBO_TEAM env vars in GitHub Actions; Vercel Remote Cache (free for small teams) or self-hosted |
| Workers preview URLs for PR verification | Every PR that touches gateway code gets a unique preview URL for testing. No need to deploy to staging just to verify a PR. | LOW | Automatic with `wrangler versions upload`; Wrangler 3.74.0+ generates version preview URLs; preview URL can be posted as PR comment |
| Concurrency controls on CI/CD | Prevent multiple deployments to the same environment from racing. If two merges happen quickly, only the latest should deploy. | LOW | `concurrency: group: deploy-${{ env }}, cancel-in-progress: true` in workflow YAML |
| Internal deployment runbook (markdown) | A single document that anyone (including future-you) can follow to deploy, troubleshoot, and rollback. Reduces bus factor to zero. | LOW | No technical dependencies; just documentation covering first-time setup, routine deploys, rollback, and troubleshooting |
| Separate staging DNS (staging-api.feelr.dev, staging-app.feelr.dev) | Staging environments need their own URLs. Testing against staging that uses production domains creates confusion and potential for cross-contamination. | LOW | Additional CNAME records in Cloudflare DNS; Workers staging environment uses separate custom domain |
| Docker image tagging strategy | Images tagged only with `latest` are unrollbackable. Tagging with git SHA + semver enables precise rollback to any previous version. | LOW | Tag format: `ghcr.io/andrewprograde/feelr-dashboard:sha-abc1234` and `ghcr.io/andrewprograde/feelr-dashboard:v1.0.0` |

## Anti-Features

Features commonly associated with deployment that should be explicitly avoided for this project.

| Anti-Feature | Why Tempting | Why Problematic | What to Do Instead |
|--------------|-------------|-----------------|-------------------|
| Kubernetes / container orchestration | "We have multiple containers, we need Kubernetes" | This is a 3-service app with a single developer. Kubernetes adds massive operational overhead (cluster management, YAML sprawl, networking complexity) for zero benefit at this scale. Azure App Service is already a managed container platform. | Use Azure App Service for Containers (managed PaaS). If scaling needs increase dramatically, evaluate Azure Container Apps (serverless containers) before ever considering Kubernetes. |
| Multi-region deployment in v1 | "Edge workers should be multi-region for low latency" | Cloudflare Workers are ALREADY globally distributed by default. Azure multi-region adds complexity (data replication, traffic routing, cost multiplication) for a dashboard that does not need global presence. | Workers are inherently global. Azure stays single-region. Add Azure Front Door or Traffic Manager only when usage data shows latency problems in specific regions. |
| Infrastructure as Code (Terraform/Pulumi) in v1 | "Everything should be declarative and reproducible" | For a solo developer with 3 services, Terraform adds a state management burden, learning curve, and maintenance overhead that exceeds the benefit. The infrastructure is simple enough to manage via CLI + GitHub Actions. | Use wrangler.toml for Workers config (already declarative), Azure CLI or portal for App Service setup (one-time), and GitHub Actions for deployment automation. Document manual setup steps in the runbook. Move to IaC only if infrastructure grows significantly. |
| Blue-green deployment for all services | "Zero-downtime requires blue-green everywhere" | Workers deployment is inherently zero-downtime (traffic shifts atomically). Azure deployment slots already provide swap-based zero-downtime. Implementing a separate blue-green system on top adds complexity for a problem already solved. | Use Workers' built-in deployment model. Use Azure deployment slots for swap-based zero-downtime. Do not layer additional blue-green infrastructure. |
| Canary analysis automation (Kayenta, Flagger) | "Automated canary analysis catches regressions" | These tools require significant metrics infrastructure (Prometheus, custom dashboards, SLO definitions) and are designed for teams with dedicated SRE resources. Overkill for a solo developer. | Use Workers gradual rollouts with manual monitoring. Check error rates in Cloudflare dashboard after deploying to 10%, then promote to 100%. Automate only after manual canary process is well-established. |
| Separate CI/CD tool (ArgoCD, Flux, Jenkins) | "GitHub Actions is limited, we need a real CD tool" | GitHub Actions is fully capable for this use case. Adding a second CI/CD tool doubles the configuration surface, creates tool-switching friction, and adds another system to maintain. | GitHub Actions for everything. It handles CI, CD, environment protection, and secret management in one place. |
| Production database migrations in CI | "Migrations should run automatically on deploy" | D1 migrations via `wrangler d1 migrations apply` in CI risks running destructive migrations against production data without human review. KV has no schema. DO uses SQLite embedded in the class. | Run D1 migrations manually using `wrangler d1 migrations apply --env production` with explicit human confirmation. Document migration procedure in the runbook. CI can run migrations against staging automatically. |

## Feature Dependencies

```
[DNS Configuration]
    |
    +-- enables --> [Workers Custom Domain (api.feelr.dev)]
    |                   |
    |                   +-- requires --> [Cloudflare zone active for feelr.dev]
    |                   +-- enables --> [SSL certificate auto-provisioned]
    |
    +-- enables --> [Azure Custom Domains (app.feelr.dev, feelr.dev)]
    |                   |
    |                   +-- requires --> [CNAME + TXT verification records]
    |                   +-- enables --> [Azure Managed SSL Certificates]
    |
    +-- enables --> [Staging DNS (staging-api.feelr.dev, staging-app.feelr.dev)]

[Wrangler Environment Config]
    |
    +-- requires --> [Separate KV namespaces for staging/production]
    +-- requires --> [Separate D1 databases for staging/production]
    +-- requires --> [Durable Object migrations declared per environment]
    +-- enables --> [Gateway staging deploys (wrangler deploy --env staging)]
    +-- enables --> [Gateway production deploys (wrangler deploy --env production)]

[Azure Dockerfiles (dashboard + docs)]
    |
    +-- requires --> [pnpm workspace-aware multi-stage build]
    +-- enables --> [Azure App Service container deployment]
    +-- enables --> [Docker image tagging strategy]
    +-- enables --> [Azure deployment slots]

[GitHub Actions CI Workflow]
    |
    +-- requires --> [pnpm + Turbo cache setup]
    +-- enables --> [PR validation (lint, typecheck, test)]
    +-- enables --> [Path-filtered conditional builds]

[GitHub Actions CD Workflow]
    |
    +-- requires --> [CI Workflow (tests must pass first)]
    +-- requires --> [Wrangler Environment Config]
    +-- requires --> [Azure Dockerfiles]
    +-- requires --> [Repository secrets configured]
    +-- requires --> [DNS + custom domains configured]
    +-- enables --> [Staging deploys (on merge to main)]
    +-- enables --> [Production deploys (on version tag)]
    +-- enables --> [Post-deploy smoke tests]
    +-- enables --> [Gradual rollouts for gateway]

[GitHub Environments + Protection Rules]
    |
    +-- enables --> [Production deploy gate (required reviewer)]
    +-- enables --> [Environment-scoped secrets]
    +-- enables --> [Deployment branch restrictions]

[Deployment Runbook]
    |
    +-- requires --> [All of the above to be configured and working]
    +-- documents --> [First-time setup, routine deploys, rollback, troubleshooting]
```

### Critical Path

The dependency chain that blocks everything else:

1. **DNS + Cloudflare zone** -- Nothing works without DNS
2. **Wrangler environments + Azure Dockerfiles** -- Cannot deploy without these
3. **GitHub repository secrets** -- Deploys fail without auth tokens
4. **CI workflow** -- CD workflow depends on CI passing
5. **CD workflow** -- The actual deployment automation
6. **Smoke tests + protection rules** -- Safety features layered on top
7. **Deployment runbook** -- Documents the completed system

## Staging vs Production Feature Matrix

| Feature | Staging | Production | Notes |
|---------|---------|------------|-------|
| Wrangler environment | `--env staging` | `--env production` | Separate KV, D1, DO namespaces |
| Workers custom domain | staging-api.feelr.dev | api.feelr.dev | Both auto-provision SSL |
| Azure App Service | staging slot or separate app | production slot | Slot swap for zero-downtime |
| Azure custom domain | staging-app.feelr.dev | app.feelr.dev | Separate CNAME records |
| Deploy trigger | Push to main | Version tag (v*) | CD workflow uses branch/tag conditions |
| Environment protection | None (auto-deploy) | Required reviewer | Prevents accidental production deploys |
| D1 migrations | Auto-apply in CI | Manual with human review | Protects production data |
| Gradual rollouts | No (deploy to 100%) | Yes (10% then 100%) | Staging is for verification, not canary |
| Smoke tests | Yes (verify staging works) | Yes (verify production works) | Same test suite, different URLs |
| Secrets | Staging-specific values | Production-specific values | GitHub environment-scoped secrets |
| Monitoring urgency | Best-effort | Alert on failure | Production failures need immediate attention |

## Service-Specific Deployment Features

### Gateway (Cloudflare Workers)

| Feature | Table Stakes? | Notes |
|---------|---------------|-------|
| `wrangler deploy --env <env>` | YES | Core deployment command |
| Separate KV namespace per environment | YES | Bindings are non-inheritable; must declare per env |
| Separate D1 database per environment | YES | Staging data must not pollute production |
| DO migration tags per environment | YES | `[[migrations]]` applies to all envs; plan carefully |
| Secrets set per environment | YES | `wrangler secret put KEY --env production` |
| Custom domain per environment | YES | api.feelr.dev (prod), staging-api.feelr.dev (staging) |
| Gradual rollouts | DIFFERENTIATOR | `wrangler versions upload` then `wrangler versions deploy` with percentage split |
| Preview URLs for PRs | DIFFERENTIATOR | Auto-generated on `wrangler versions upload`; requires Wrangler 3.74.0+ |
| Cron trigger configuration | YES | `[triggers] crons` for daily retention cleanup; verify works per environment |

### Dashboard + Docs (Azure App Service)

| Feature | Table Stakes? | Notes |
|---------|---------------|-------|
| Multi-stage Dockerfile | YES | Separate builder + runtime stages; pnpm workspace aware |
| Container registry (GHCR) | YES | Push images to ghcr.io/andrewprograde/feelr-dashboard |
| Custom domain + managed SSL | YES | CNAME + TXT verification; free auto-renewing certificates |
| Health check endpoint | YES | Azure uses `/api/health` probe for container lifecycle |
| Deployment slots | DIFFERENTIATOR | Requires Standard tier ($$$); manual swap for Linux containers |
| Image tag strategy | YES | `sha-<commit>` for traceability; `v<semver>` for releases |
| Environment variables per slot | YES | NEXT_PUBLIC_GATEWAY_URL differs between staging and production |
| Startup command override | YES | `node server.js` or `next start` depending on build output |

### CI/CD (GitHub Actions)

| Feature | Table Stakes? | Notes |
|---------|---------------|-------|
| pnpm + Node.js setup with caching | YES | `actions/setup-node@v4` with `cache: 'pnpm'` |
| Turbo task pipeline (typecheck, test, build) | YES | `turbo run typecheck test build` respects dependency graph |
| Path-based filtering | YES | Only deploy changed services; `dorny/paths-filter` |
| Concurrency controls | YES | `concurrency: group: deploy-staging, cancel-in-progress: true` |
| Environment protection rules | YES | Production requires approval; staging auto-deploys |
| Post-deploy smoke tests | DIFFERENTIATOR | `curl` health endpoints with retry after each deploy |
| Matrix builds | NOT NEEDED | Only 3 services; matrix adds complexity without benefit |
| Reusable workflows | DIFFERENTIATOR | Factor common steps (pnpm setup, Docker build) into callable workflows |
| Turbo remote cache | DIFFERENTIATOR | TURBO_TOKEN + TURBO_TEAM for cross-run caching |

## MVP Deployment Recommendation

### Ship First (blocking production launch)

1. Wrangler environment configuration (staging + production) with all bindings
2. Workers custom domain for api.feelr.dev
3. Dockerfiles for dashboard and docs apps
4. DNS records for all three subdomains
5. GitHub Actions CI workflow (typecheck + test on every PR)
6. GitHub Actions CD workflow (staging on main, production on tags)
7. GitHub repository and environment secrets
8. Azure managed SSL certificates
9. Health check endpoints in dashboard and docs
10. Deployment runbook (first-time setup + routine deploys + rollback)

### Add After Launch (operational improvements)

1. Workers gradual rollouts (after first few manual full-deploys build confidence)
2. Azure deployment slots (when budget allows Standard tier)
3. Post-deploy smoke tests (after URLs are stable and health endpoints are proven)
4. Staging DNS subdomains (after main domains work correctly)
5. Turbo remote cache (after CI time becomes a pain point)
6. Preview URLs as PR comments (after PR volume justifies the DX investment)
7. Concurrency controls (after encountering a race condition, or preventively)

### Never Build

1. Kubernetes cluster
2. Multi-region Azure deployment
3. Terraform/Pulumi for 3 services
4. Separate CI/CD tool
5. Automated canary analysis
6. Auto-apply production D1 migrations

## Sources

- [Cloudflare Workers Environments Documentation](https://developers.cloudflare.com/workers/wrangler/environments/) -- HIGH confidence, official docs
- [Cloudflare Workers Versions & Deployments](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/) -- HIGH confidence, official docs
- [Cloudflare Workers Gradual Deployments](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/gradual-deployments/) -- HIGH confidence, official docs
- [Cloudflare Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) -- HIGH confidence, official docs
- [Cloudflare Workers Preview URLs](https://developers.cloudflare.com/workers/configuration/previews/) -- HIGH confidence, official docs
- [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/) -- HIGH confidence, official docs
- [Cloudflare CNAME Flattening](https://developers.cloudflare.com/dns/cname-flattening/) -- HIGH confidence, official docs
- [cloudflare/wrangler-action (GitHub)](https://github.com/cloudflare/wrangler-action) -- HIGH confidence, official Cloudflare action
- [Azure App Service Deploy Staging Slots](https://learn.microsoft.com/en-us/azure/app-service/deploy-staging-slots) -- HIGH confidence, official Microsoft docs
- [Azure App Service Health Check](https://learn.microsoft.com/en-us/azure/app-service/monitor-instances-health-check) -- HIGH confidence, official Microsoft docs
- [Azure Custom Domain Tutorial](https://learn.microsoft.com/en-us/azure/app-service/app-service-web-tutorial-custom-domain) -- HIGH confidence, official Microsoft docs
- [Azure App Service Container Deployment via GitHub Actions](https://learn.microsoft.com/en-us/azure/app-service/deploy-container-github-action) -- HIGH confidence, official Microsoft docs
- [Azure Managed Certificate GA Announcement](https://azure.github.io/AppService/2021/05/25/App-Service-Managed-Certificate-GA.html) -- HIGH confidence, official Microsoft blog
- [GitHub Actions Environments for Deployment](https://docs.github.com/actions/deployment/targeting-different-environments/using-environments-for-deployment) -- HIGH confidence, official GitHub docs
- [GitHub Actions Reviewing Deployments](https://docs.github.com/actions/managing-workflow-runs/reviewing-deployments) -- HIGH confidence, official GitHub docs
- [GitHub Actions Deploying Docker to Azure](https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/docker-to-azure-app-service) -- HIGH confidence, official GitHub docs
- [Turborepo GitHub Actions Guide](https://turborepo.dev/docs/guides/ci-vendors/github-actions) -- HIGH confidence, official Turbo docs
- [dorny/paths-filter GitHub Action](https://github.com/dorny/paths-filter) -- MEDIUM confidence, widely-used community action
- [Azure App Service Health Checks and Zero Downtime](https://johnnyreilly.com/azure-app-service-health-checks-and-zero-downtime-deployments) -- MEDIUM confidence, practitioner blog with practical details
- [Deployment Runbook Best Practices (Enov8)](https://www.enov8.com/blog/deployment-runbooks-aka-runsheets-explained/) -- MEDIUM confidence, industry practitioner resource

---
*Deployment feature research for: Feelr production deployment & CI/CD*
*Researched: 2026-02-09*
