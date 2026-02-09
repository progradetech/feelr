# Deployment & CI/CD Pitfalls

**Domain:** Deployment infrastructure for multi-service monorepo (Cloudflare Workers + Azure App Service + GitHub Actions)
**Researched:** 2026-02-09
**Confidence:** HIGH (verified against official Cloudflare, Azure, and GitHub documentation; cross-referenced with community incident reports)

**Context:** This document covers pitfalls specific to ADDING deployment infrastructure, CI/CD pipelines, DNS configuration, and deployment guides to the existing Feelr application. It supplements the original application-level PITFALLS research (2026-02-05) with deployment and operations concerns.

---

## Critical Pitfalls

Mistakes that cause failed deployments, downtime, or security breaches. Must be addressed before any production traffic.

---

### Pitfall 1: Wrangler Environment Bindings Are NOT Inherited -- Staging Deploys Hit Production Data

**What goes wrong:**
You define KV namespaces, D1 databases, and Durable Object bindings at the top level of `wrangler.toml` and assume they carry into `[env.staging]` and `[env.production]` blocks. They do not. Cloudflare's official documentation states: "Bindings such as vars or kv_namespaces are not inheritable and need to be defined explicitly in each environment." When you deploy to staging with `wrangler deploy --env staging`, the Worker gets NO bindings unless you explicitly redeclare them in the `[env.staging]` block. One of two things happens: (1) the deploy succeeds but the Worker crashes at runtime with "binding not found" errors, or (2) worse, you copy-paste the top-level bindings but forget to change the namespace/database IDs, so staging silently reads and writes production data.

The current `wrangler.toml` has `id = "placeholder-create-with-wrangler"` for both AUTH_KV and USAGE_DB. When real IDs are created, the temptation is to set them once at the top level. This is the trap.

**Why it happens:**
Most configuration systems (Terraform, Docker Compose, etc.) use inheritance for environment overrides. Wrangler deliberately does NOT inherit bindings because binding to the wrong KV namespace or D1 database is a data-corruption-level mistake. The Wrangler documentation buries this in a "non-inheritable keys" section that is easy to skip.

**Warning signs:**
- `wrangler deploy --env staging` succeeds but Worker returns 500 errors with "binding not found" in logs
- Staging and production share the same KV namespace ID in `wrangler.toml`
- D1 query results in staging contain production user data
- `wrangler types` command fails to generate types for environment-nested bindings (known issue as of wrangler 4.20.5+)

**Prevention:**
- Create separate KV namespaces and D1 databases for each environment: `feelr-auth-kv-staging`, `feelr-auth-kv-production`, `feelr-usage-staging`, `feelr-usage-production`
- Structure `wrangler.toml` with explicit per-environment bindings:
  ```toml
  [env.staging.vars]
  ENVIRONMENT = "staging"

  [[env.staging.kv_namespaces]]
  binding = "AUTH_KV"
  id = "staging-kv-id-here"

  [[env.staging.d1_databases]]
  binding = "USAGE_DB"
  database_name = "feelr-usage-staging"
  database_id = "staging-d1-id-here"
  ```
- Add a CI check that parses `wrangler.toml` and verifies no production IDs appear in staging blocks and vice versa
- Never use the top-level bindings section for anything except local development defaults

**Detection:**
CI linting step that extracts all binding IDs per environment and asserts no overlap between staging and production.

**Phase to address:**
First deployment infrastructure milestone -- before any wrangler deploy runs in CI.

**Confidence:** HIGH (verified via [Cloudflare Environments docs](https://developers.cloudflare.com/workers/wrangler/environments/) and [community report](https://community.cloudflare.com/t/my-kv-binding-is-not-being-set-by-my-wrangler-toml-file-when-deploying-to-my-production-environment/488163))

---

### Pitfall 2: Durable Object Migrations Are Atomic and Irreversible -- A Bad Migration Deletes All Stored Tokens

**What goes wrong:**
The TokenCoordinator Durable Object stores OAuth tokens with strongly consistent access. DO migrations are not like D1 migrations -- they are atomic operations that cannot be gradually deployed or rolled back. If you rename the DO class, all existing Durable Objects must be migrated at once. If you accidentally run a Delete migration instead of a Rename migration, ALL stored Durable Objects and their data are permanently destroyed. There is no undo. Additionally, you cannot retroactively enable SQLite storage on an existing DO class -- the `new_sqlite_classes` declaration must be in the first migration that creates the class.

The current `wrangler.toml` correctly uses `new_sqlite_classes = ["TokenCoordinator"]` in the `v1` migration tag. If this migration has already been applied in production and someone adds a second migration attempting to change storage backends, it will fail.

**Why it happens:**
Developers treat DO migrations like database migrations (reversible, incremental). Cloudflare's migration system is fundamentally different: migrations are declarative state transitions, not imperative scripts. The migration tag system also confuses people -- tags must be unique and ordered, and Cloudflare uses them to determine which migrations have been applied.

**Warning signs:**
- Migration error: "Cannot enable SQLite storage backend on an existing, deployed Durable Object class"
- After renaming a DO class, the old class name appears in error logs (binding not updated)
- After a deploy, all TokenCoordinator state is gone (delete migration was applied)
- Migration tags are duplicated or out of order in `wrangler.toml`

**Prevention:**
- Never delete a DO class in production without explicit data backup confirmation
- For class renames, use `renamed_classes` in a new migration block with a new unique tag:
  ```toml
  [[migrations]]
  tag = "v2"
  renamed_classes = [{ from = "TokenCoordinator", to = "TokenCoordinatorV2" }]
  ```
- Test all migrations against a staging environment first (with separate DO namespaces)
- Add a pre-deploy CI step that diffs migration blocks and flags any `deleted_classes` entries for manual approval
- Document that SQLite storage choice is permanent and cannot be changed after first deployment

**Detection:**
Pre-deploy script that parses `wrangler.toml` migration blocks and requires manual approval for any `deleted_classes` or `renamed_classes` entries.

**Phase to address:**
First deployment infrastructure milestone -- migration safety checks must exist before production deploys.

**Confidence:** HIGH (verified via [Durable Objects Migrations docs](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/))

---

### Pitfall 3: Azure App Service Ignores Dockerfile HEALTHCHECK -- Container Killed After 230 Seconds of "Silence"

**What goes wrong:**
The self-host Dockerfile defines `HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s CMD wget -q --spider http://localhost:8080/health || exit 1`. When this same image (or a similar Next.js container) is deployed to Azure App Service, Azure completely ignores the Dockerfile HEALTHCHECK directive. Instead, Azure probes the port defined by `WEBSITES_PORT` (default: 80) and expects an HTTP 200 within the startup timeout (default: 230 seconds). If your Next.js standalone server starts on port 3000 but Azure is probing port 80, the container is marked unhealthy and killed -- even though the app is running fine.

**Why it happens:**
Azure App Service has its own container orchestration layer that manages health checks independently. It does not parse or execute Docker HEALTHCHECK instructions. Developers who test containers locally with `docker compose` see the health check working, assume it will work on Azure, and discover their container is being killed repeatedly in production.

**Warning signs:**
- Container logs show the app starting successfully on port 3000, followed by Azure killing the container
- "Container didn't respond to HTTP pings on port 80" in Azure deployment logs
- Container restarts every 230 seconds (the default `WEBSITES_CONTAINER_START_TIME_LIMIT`)
- The app works perfectly when tested locally with `docker run`

**Prevention:**
- Set `WEBSITES_PORT` app setting to match your container's listening port (3000 for Next.js, 8080 for other services)
- Configure a health check path in Azure App Service settings (not in Dockerfile): App Service > Health check > Path: `/api/health`
- Set `WEBSITES_CONTAINER_START_TIME_LIMIT` to 600 (10 minutes) for containers with heavy initialization (Next.js standalone with many pages)
- Enable "Always On" for production App Service plans (prevents idle cold shutdown that triggers full container restart)
- For the Feelr dashboard (Next.js), explicitly configure `server.js` to listen on port 3000 and set `WEBSITES_PORT=3000`
- For the docs site (Nextra), same pattern: `WEBSITES_PORT=3000`

**Detection:**
Azure container logs showing "Container didn't respond to HTTP pings on port X" followed by container kill.

**Phase to address:**
Dashboard and docs deployment phase -- before first Azure deployment.

**Confidence:** HIGH (verified via [Azure App Service Container Configuration](https://learn.microsoft.com/en-us/azure/app-service/configure-custom-container) and [community reports](https://learn.microsoft.com/en-us/answers/questions/2264394/(app-service)-container-start-server-on-port-8080))

---

### Pitfall 4: Cloudflare Orange Cloud Proxy Blocks Azure Custom Domain Verification

**What goes wrong:**
You point `app.feelr.dev` CNAME to `feelr-dashboard.azurewebsites.net` in Cloudflare DNS with the proxy enabled (orange cloud icon). Azure needs to verify domain ownership by resolving the CNAME to its `.azurewebsites.net` hostname. When Cloudflare proxies the record, Azure sees Cloudflare's IP address instead of its own hostname, and domain verification fails. The custom domain cannot be added to the App Service. Similarly, Azure's free managed SSL certificate (App Service Managed Certificate) requires domain verification via DNS -- which also fails when proxied through Cloudflare.

This affects both `app.feelr.dev` (dashboard) and `feelr.dev` (docs) since both are on Azure.

**Why it happens:**
Cloudflare's proxy rewrites DNS responses to return Cloudflare edge IPs instead of the origin's IP/CNAME target. This is a feature (DDoS protection, CDN) but breaks any service that needs to verify the actual DNS target. The Cloudflare documentation explicitly states: "CNAME records being used to verify your domain for a third-party service should not be proxied."

**Warning signs:**
- Azure Portal shows "Domain verification failed" or "Custom domain not validated"
- SSL certificate provisioning stays in "pending" state indefinitely
- Works when you temporarily disable the proxy (gray cloud) but breaks when you re-enable it

**Prevention:**
Follow this exact sequence for each Azure-hosted domain:
1. Add the CNAME record in Cloudflare with proxy DISABLED (gray cloud / DNS only)
2. Add the `asverify.app` CNAME record pointing to `asverify.feelr-dashboard.azurewebsites.net` (always DNS only)
3. In Azure Portal, add the custom domain and complete verification
4. Provision the SSL certificate (Azure managed or custom)
5. Wait for SSL certificate to be issued (can take 15-60 minutes)
6. THEN enable Cloudflare proxy (orange cloud) on the main CNAME record
7. Set Cloudflare SSL mode to "Full" (not "Full Strict" -- see Pitfall 5)
- Automate this sequence in deployment documentation with explicit screenshots
- Add a note: "Do NOT enable the orange cloud icon until Azure verification is complete"

**Detection:**
Azure Portal domain verification status check.

**Phase to address:**
DNS/domain configuration phase -- the very first deployment step.

**Confidence:** HIGH (verified via [Cloudflare CNAME Domain Verification docs](https://developers.cloudflare.com/dns/manage-dns-records/troubleshooting/cname-domain-verification/) and [Azure integration guide](https://learn.microsoft.com/en-us/answers/questions/2244786/how-to-integrate-cloudflare-services-with-web-app))

---

### Pitfall 5: CNAME Flattening + "Full Strict" SSL = Error 526 on Root Domain

**What goes wrong:**
`feelr.dev` (root domain, docs site) uses CNAME flattening because DNS standards do not allow CNAME records at the zone apex. Cloudflare automatically flattens the CNAME to an A record pointing to the resolved IP. When Cloudflare SSL is set to "Full (Strict)", Cloudflare validates the origin server's SSL certificate and requires it to match the hostname. But the flattened CNAME resolves to Azure's IP, and Azure's certificate is for `*.azurewebsites.net`, not `feelr.dev`. Cloudflare returns Error 526 (Invalid SSL Certificate) even though everything looks correctly configured.

**Why it happens:**
"Full (Strict)" mode requires the origin certificate to cover the hostname being requested. Azure's default certificate covers `*.azurewebsites.net`, not your custom domain. The "Full" mode (without Strict) only requires a valid certificate on the origin, regardless of hostname match -- which Azure's default cert satisfies.

**Warning signs:**
- Error 526 on `feelr.dev` but `app.feelr.dev` (subdomain, no CNAME flattening) works fine
- Error appears only after switching from "Full" to "Full (Strict)" SSL mode
- Everything works when proxy is disabled (gray cloud)

**Prevention:**
- Use Cloudflare SSL mode "Full" (not "Full Strict") for domains pointed at Azure App Service unless you upload a custom origin certificate
- Alternatively, configure a Cloudflare Origin Certificate on the Azure App Service (covers `*.feelr.dev` and `feelr.dev`), which then allows "Full Strict"
- For `api.feelr.dev` (Workers): this is not an issue because Workers handle their own SSL via Cloudflare's edge
- Document the SSL mode decision and why "Full Strict" is not used for Azure-proxied domains

**Detection:**
Cloudflare Analytics showing Error 526 responses.

**Phase to address:**
DNS/domain configuration phase -- must be decided during initial SSL setup.

**Confidence:** HIGH (verified via [Cloudflare CNAME Flattening docs](https://developers.cloudflare.com/dns/cname-flattening/) and [community report on Error 526](https://community.cloudflare.com/t/cname-flattening-and-full-strict-ssl-causes-invalid-ssl-certificate-error-526/54760))

---

### Pitfall 6: GitHub Actions Secrets Exposed via Compromised Third-Party Actions (CVE-2025-30066)

**What goes wrong:**
In March 2025, the widely-used `tj-actions/changed-files` GitHub Action was compromised, causing all secrets (API tokens, deployment credentials) to be printed to workflow logs in plaintext for 23,000+ repositories. Any third-party action has the same attack surface. For Feelr, the deployment workflow uses `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `HOMEBREW_TAP_GITHUB_TOKEN`, and will use Azure deployment credentials. A compromised action could exfiltrate all of these.

**Why it happens:**
GitHub Actions run with full access to all secrets defined in the workflow. Third-party actions are referenced by tag (e.g., `@v4`), which is a mutable Git reference. An attacker who gains access to the action's repository can push malicious code to an existing tag. The action then runs with your secrets the next time your workflow triggers.

**Warning signs:**
- Dependabot alerts on GitHub Actions dependencies
- Unexpected secret usage in workflow logs (GitHub redacts known secrets, but novel exfiltration methods bypass redaction)
- Third-party actions requesting more permissions than needed

**Prevention:**
- Pin ALL third-party actions to full SHA hashes, not version tags:
  ```yaml
  # BAD: mutable tag, can be hijacked
  - uses: actions/checkout@v4

  # GOOD: immutable commit SHA
  - uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11  # v4.1.1
  ```
- Use GitHub's built-in Dependabot to monitor action version updates
- Use `environment` protection rules for production deployments: require manual approval before production secrets are available
- Use OIDC for cloud provider authentication instead of long-lived tokens where possible:
  - Cloudflare does not yet support OIDC for Workers deployment, so API tokens are still required
  - Azure supports OIDC via `azure/login` action with federated credentials -- use this instead of storing Azure client secrets
- Minimize the number of third-party actions; prefer inline `run` steps for simple operations
- Configure separate GitHub environments (`staging`, `production`) with different secrets

**Detection:**
GitHub's secret scanning alerts; audit logs showing unexpected action executions.

**Phase to address:**
First CI/CD pipeline milestone -- secrets and action pinning must be configured before any deployment runs.

**Confidence:** HIGH (verified via [CVE-2025-30066 report](https://checkmarx.com/zero-post/compromised-github-actions-leading-to-credential-leaks/) and [GitHub Secrets documentation](https://docs.github.com/actions/security-guides/using-secrets-in-github-actions))

---

### Pitfall 7: Wrangler Deploy Overwrites Dashboard-Managed Environment Variables and Secrets

**What goes wrong:**
You set `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET` via `wrangler secret put` or the Cloudflare Dashboard. Then you run `wrangler deploy`. Wrangler sees that the `[vars]` section in `wrangler.toml` does not include those variables and deletes them from the deployed Worker. The next request that needs Slack OAuth credentials fails. This is Wrangler's default behavior: it treats `wrangler.toml` as the source of truth and removes any dashboard-set variables not present in the file.

**Why it happens:**
Wrangler's philosophy is "config file as source of truth." If a variable exists on the deployed Worker but not in `wrangler.toml`, Wrangler assumes it was removed intentionally. The `keep_vars` setting exists to prevent this, but it is not enabled by default.

**Warning signs:**
- After a deploy, secrets that were set via dashboard or `wrangler secret` stop working
- OAuth flows break after every deployment
- `wrangler deploy` output shows "removing variable X" (easy to miss in CI logs)

**Prevention:**
- Add `keep_vars = true` to `wrangler.toml` to preserve dashboard/CLI-set variables during deployment
- Better yet: define ALL non-secret variables in `wrangler.toml` per environment so there is no ambiguity
- For secrets (OAuth client secrets, encryption keys): always use `wrangler secret put` and rely on `keep_vars = true`
- Add a post-deploy verification step in CI that checks critical secrets exist:
  ```bash
  # After wrangler deploy, verify secrets are present
  wrangler secret list --env production | grep -q "ENCRYPTION_KEY" || exit 1
  ```
- Document the exact list of secrets that must exist per environment

**Detection:**
Post-deploy smoke test that calls an endpoint requiring secrets (e.g., OAuth initiation).

**Phase to address:**
First deployment infrastructure milestone -- add `keep_vars = true` before any CI deployment.

**Confidence:** HIGH (verified via [Wrangler Configuration docs](https://developers.cloudflare.com/workers/wrangler/configuration/) -- "If you change your environment variables in the Cloudflare dashboard, Wrangler will override them the next time you deploy")

---

## Moderate Pitfalls

Mistakes that cause CI failures, slow deployments, or development friction. Should be addressed during infrastructure setup but won't cause production outages.

---

### Pitfall 8: Next.js Environment Variables Not Embedded During Docker Build

**What goes wrong:**
Next.js `NEXT_PUBLIC_*` variables are embedded at BUILD time, not runtime. If you run `docker build` without passing `NEXT_PUBLIC_GATEWAY_URL=https://api.feelr.dev` as a build argument, the variable is `undefined` in the client-side JavaScript bundle. The dashboard loads but cannot communicate with the API. The self-host Dockerfile correctly handles this with `NEXT_PUBLIC_GATEWAY_URL=""` (relative URLs for same-origin), but the cloud deployment Dockerfile needs the actual production URL at build time.

**Why it happens:**
Next.js inlines `NEXT_PUBLIC_*` variables into the JavaScript bundle during `next build`. This is unlike server-side variables that are read at runtime. Developers coming from other frameworks expect environment variables to be runtime-configurable.

**Warning signs:**
- Dashboard loads but all API calls fail with CORS errors or "undefined" in the URL
- `undefined/api/v1/connectors` appears in browser Network tab
- Works locally because `next dev` reads `.env.local` at startup

**Prevention:**
- Pass build arguments for each target environment:
  ```yaml
  - name: Build dashboard
    run: |
      docker build \
        --build-arg NEXT_PUBLIC_GATEWAY_URL=${{ vars.GATEWAY_URL }} \
        -t feelr-dashboard:${{ github.sha }} \
        -f apps/dashboard/Dockerfile .
  ```
- Use separate build steps for staging and production with different `GATEWAY_URL` values
- Add a post-build check in CI that greps the output bundle for the expected URL:
  ```bash
  grep -r "api.feelr.dev" apps/dashboard/.next/static/ || echo "WARNING: Gateway URL not embedded"
  ```
- For the self-hosted case, the existing `NEXT_PUBLIC_GATEWAY_URL=""` approach is correct and should be preserved

**Prevention:**
Separate Dockerfiles or multi-stage builds with build-arg injection for each environment.

**Phase to address:**
Dashboard deployment phase.

**Confidence:** HIGH (verified via [Next.js Azure deployment guide](https://medium.com/@mindelias/how-to-deploy-next-js-to-azure-app-service-with-docker-a-complete-guide-to-environment-variables-1aa19d85000a) and [Next.js docs on environment variables](https://nextjs.org/docs/app/building-your-application/configuring/environment-variables))

---

### Pitfall 9: Turborepo Cache Misses in CI Due to Missing .turbo Directory Caching

**What goes wrong:**
Turborepo's local cache lives in `.turbo/` directory. Without explicit GitHub Actions caching of this directory, every CI run rebuilds every package from scratch -- even if nothing changed. For a monorepo with gateway, dashboard, docs, 4 connectors, and shared packages, this turns a 30-second cached build into a 5-10 minute full rebuild on every push.

Additionally, `actions/setup-node` with `cache: 'pnpm'` only caches the pnpm store (downloaded packages), NOT the Turborepo build cache. These are two different caches that serve different purposes.

**Why it happens:**
Teams configure pnpm caching and assume Turborepo caching is handled. Turborepo remote caching (via Vercel) is an option but adds a dependency on Vercel's infrastructure. Local artifact caching via `actions/cache` is simpler and free.

**Warning signs:**
- CI build times are consistently 5+ minutes despite no code changes
- Turborepo output shows all tasks as "cache miss" (no "FULL TURBO" or "cache hit" messages)
- pnpm install is fast (cached) but `turbo run build` is slow (not cached)

**Prevention:**
- Cache BOTH the pnpm store AND the Turborepo cache:
  ```yaml
  - name: Cache Turborepo
    uses: actions/cache@v4
    with:
      path: .turbo
      key: ${{ runner.os }}-turbo-${{ github.sha }}
      restore-keys: |
        ${{ runner.os }}-turbo-
  ```
- Verify cache effectiveness: check Turborepo output for "cache hit" vs "cache miss" ratio. Below 80% hits on repeated runs means cache keys need attention.
- Consider Turborepo remote caching (Vercel or self-hosted) for shared cache across branches:
  ```yaml
  env:
    TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
    TURBO_TEAM: ${{ vars.TURBO_TEAM }}  # Use vars, not secrets (prevents log censoring)
  ```
- Use `fetch-depth: 2` (not 0) for Turborepo -- it needs recent history for change detection but not full history

**Detection:**
Monitor CI build times; check Turborepo output for cache hit rate.

**Phase to address:**
First CI/CD pipeline milestone.

**Confidence:** HIGH (verified via [Turborepo GitHub Actions docs](https://turborepo.dev/docs/guides/ci-vendors/github-actions))

---

### Pitfall 10: GitHub Actions Concurrency Groups Cancel Pending Deployments -- Production Deploy Skipped

**What goes wrong:**
You configure a concurrency group for deployments: `concurrency: { group: deploy-production, cancel-in-progress: false }`. Three commits are pushed quickly. Commit 1 starts deploying. Commit 2 queues. Commit 3 arrives and REPLACES commit 2 in the queue (there can only be one pending job per concurrency group). Commit 2 is silently canceled -- its deployment never runs. If commit 2 contained a critical database migration that commit 3 depends on, production breaks.

Even with `cancel-in-progress: false`, pending jobs are still replaced. GitHub's documentation states: "Any existing pending job or workflow in the same concurrency group, if it exists, will be canceled and the new queued job or workflow will take its place."

**Why it happens:**
GitHub's concurrency model only allows one running + one pending job per group. Most developers assume `cancel-in-progress: false` means "queue all jobs in order." It does not. It only means "don't cancel the currently RUNNING job."

**Warning signs:**
- Deployment workflow shows "cancelled" status for intermediate commits
- Database migrations are skipped, causing schema mismatches
- "Missing column" or "relation does not exist" errors after deployment

**Prevention:**
- For production deployments, trigger ONLY on tags (not on push to main). This naturally limits deployment frequency:
  ```yaml
  on:
    push:
      tags: ['v*']  # Only deploy on version tags
  ```
- For staging, use concurrency groups with `cancel-in-progress: true` (latest wins is fine for staging)
- NEVER put database migrations in the deployment workflow. Run D1 migrations as a separate, non-cancelable step:
  ```yaml
  jobs:
    migrate:
      # No concurrency group -- always runs
      steps:
        - run: wrangler d1 migrations apply feelr-usage --env production
    deploy:
      needs: [migrate]
      concurrency:
        group: deploy-production
        cancel-in-progress: false
  ```
- Use GitHub environment protection rules with required reviewers for production

**Detection:**
Monitoring for "cancelled" workflow runs in the deployment pipeline.

**Phase to address:**
CI/CD pipeline design -- before production deployment workflow is created.

**Confidence:** HIGH (verified via [GitHub Actions Concurrency docs](https://docs.github.com/actions/writing-workflows/choosing-what-your-workflow-does/control-the-concurrency-of-workflows-and-jobs))

---

### Pitfall 11: GoReleaser in Monorepo Requires Pro License or Explicit Working Directory

**What goes wrong:**
GoReleaser's monorepo feature (automatic directory scoping, tag prefixes) is a Pro-only feature. The free/OSS version of GoReleaser does not support `monorepo.dir` or `monorepo.tag_prefix`. Since Feelr's Go CLI lives in `cli/` within the monorepo, the existing release workflow needs to either: (a) use GoReleaser Pro with monorepo config, or (b) manually set the working directory and handle tag filtering.

The current `release.yml` does not specify a `workingDirectory` or use `-f cli/.goreleaser.yaml`, so GoReleaser looks for `.goreleaser.yaml` in the repo root and may fail or build the wrong thing.

**Why it happens:**
GoReleaser's documentation shows monorepo support prominently, but the small "Pro" badge is easy to miss. Teams set up their release workflow, discover it doesn't work with the free version, and then scramble to restructure.

**Warning signs:**
- GoReleaser error: "monorepo mode is a pro feature"
- GoReleaser cannot find Go files in the root directory
- Release artifacts contain the wrong binary or no binary at all

**Prevention:**
- For GoReleaser OSS (free): use `workingDirectory` in the GitHub Action and put `.goreleaser.yaml` in the `cli/` directory:
  ```yaml
  - name: Run GoReleaser
    uses: goreleaser/goreleaser-action@v6
    with:
      workingDirectory: cli
      args: release --clean
  ```
- OR specify the config file path explicitly: `args: release --clean -f cli/.goreleaser.yaml`
- Filter release workflow triggers to only run on tags matching the CLI version pattern:
  ```yaml
  on:
    push:
      tags: ['v*']  # or 'cli/v*' if using monorepo-style tags
  ```
- Test the GoReleaser config locally with `goreleaser release --snapshot --clean` from the `cli/` directory before pushing tags

**Detection:**
GoReleaser build failure in CI; empty or incorrect GitHub Release artifacts.

**Phase to address:**
CLI release pipeline phase.

**Confidence:** HIGH (verified via [GoReleaser Monorepo docs](https://goreleaser.com/customization/monorepo/) and [goreleaser-action](https://github.com/goreleaser/goreleaser-action))

---

### Pitfall 12: D1 Migrations Must Run Before Worker Deploy, Not During

**What goes wrong:**
D1 database migrations are run separately from Worker deployment. If the CI pipeline deploys the Worker code first (which references new columns or tables) and THEN runs D1 migrations, there is a window where the Worker is live with code that expects a schema the database does not yet have. Every request during this window fails with SQL errors.

The inverse is also dangerous: if you run migrations first but the deploy fails, you have a schema that no longer matches the running code.

**Why it happens:**
D1 migrations are a separate `wrangler d1 migrations apply` command, not integrated into `wrangler deploy`. Teams treat them as an afterthought or append them to the deploy job without considering the ordering.

**Warning signs:**
- "table X has no column named Y" errors immediately after deployment
- Errors that self-resolve after a few seconds (when the migration catches up)
- Migrations applied to staging but not production (or vice versa)

**Prevention:**
- Always run migrations BEFORE deploying the Worker, as a separate job:
  ```yaml
  jobs:
    migrate:
      steps:
        - run: wrangler d1 migrations apply feelr-usage --env production
    deploy-gateway:
      needs: [migrate]
      steps:
        - run: wrangler deploy --env production
  ```
- Make all migrations backwards-compatible (additive only): add columns with defaults, never rename or drop columns in the same release as code that depends on the change
- For breaking schema changes, use a two-phase deployment: (1) deploy code that handles both old and new schema, (2) run migration, (3) deploy code that only handles new schema
- Test migrations in staging first, including rollback scenarios

**Detection:**
SQL errors in Worker logs immediately after deployment.

**Phase to address:**
CI/CD pipeline design phase.

**Confidence:** HIGH (verified via [D1 Migrations docs](https://developers.cloudflare.com/d1/reference/migrations/))

---

### Pitfall 13: Deployment Ordering -- Dashboard Before API Causes Blank Page or Broken State

**What goes wrong:**
The CI/CD pipeline deploys all services in parallel or in the wrong order. The dashboard goes live before the gateway API is ready. Users load the dashboard, which makes API calls to `api.feelr.dev` that fail. Depending on error handling, users see a blank page, infinite loading spinners, or cryptic error messages. Worse: if the dashboard creates state (e.g., writes to local storage) based on the error responses, it can get stuck in a broken state that persists after the API comes online.

Similarly, deploying DNS records before SSL certificates are provisioned results in users hitting insecure or error pages.

**Why it happens:**
Parallel deployment is faster. Teams optimize for deployment speed without considering service dependencies. Cloudflare Workers deploy in ~2 seconds while Docker image pushes to Azure take 2-5 minutes, creating a natural timing mismatch.

**Warning signs:**
- Users report blank dashboard immediately after deployment
- Error monitoring shows a spike of API call failures from the dashboard
- DNS changes visible before SSL certificate is active (browser "insecure" warnings)

**Prevention:**
Define and enforce a deployment dependency chain:
```
1. D1 Migrations (must complete before gateway deploy)
2. Gateway Worker deploy (must be healthy before dashboard deploy)
3. Health check: curl https://api.feelr.dev/health
4. Dashboard deploy to Azure
5. Docs deploy to Azure
6. CLI release (independent, can run in parallel with 4-5)
```
- Add a health check gate between gateway and dashboard deployments:
  ```yaml
  deploy-gateway:
    steps:
      - run: wrangler deploy --env production
      - name: Verify gateway health
        run: |
          for i in $(seq 1 30); do
            if curl -sf https://api.feelr.dev/health; then exit 0; fi
            sleep 2
          done
          exit 1
  deploy-dashboard:
    needs: [deploy-gateway]
  ```
- Dashboard should show a "service unavailable -- deploying" state rather than a blank page when the API is unreachable

**Detection:**
Health check failures between deployment stages; user error reports immediately after deploy.

**Phase to address:**
CI/CD pipeline design phase -- deployment ordering must be explicit in the workflow.

**Confidence:** MEDIUM (architecture-driven reasoning; standard deployment ordering practice)

---

## Minor Pitfalls

Annoyances that slow development or cause confusion. Fix during setup but not blockers.

---

### Pitfall 14: pnpm in GitHub Actions Requires Explicit Setup Before setup-node

**What goes wrong:**
`actions/setup-node` with `cache: 'pnpm'` expects pnpm to already be installed. If you run `setup-node` before installing pnpm, the caching step fails with "Could not determine pnpm cache directory" or similar. The workflow then runs `pnpm install` without caching, adding 30-60 seconds to every CI run.

**Why it happens:**
`setup-node` detects the package manager and tries to find its cache directory. If pnpm is not installed yet, this detection fails. The error is non-fatal (the workflow continues), so teams don't notice the cache is not working.

**Prevention:**
Install pnpm BEFORE setup-node:
```yaml
- uses: pnpm/action-setup@v4
  with:
    version: 9.15.0  # Match packageManager in package.json

- uses: actions/setup-node@v4
  with:
    node-version: 22
    cache: 'pnpm'

- run: pnpm install --frozen-lockfile
```

**Phase to address:**
First CI workflow creation.

**Confidence:** HIGH (verified via [pnpm CI docs](https://pnpm.io/continuous-integration))

---

### Pitfall 15: Cloudflare Workers 523 Error on First Deploy to Custom Domain

**What goes wrong:**
After the first `wrangler deploy` with a custom domain route, hitting the domain returns a 523 error (Origin Unreachable) for 30-60 seconds. Teams panic, revert the deploy, and retry -- causing more confusion.

**Why it happens:**
Cloudflare needs time to propagate the new Worker route to all edge locations. The 523 error is transient and self-resolving. The Cloudflare documentation acknowledges this: "If you see 523 errors when pushing your *.workers.dev subdomain for the first time, wait a minute or so and the errors will resolve themselves."

**Prevention:**
- Document that the first deploy will show 523 errors for up to 60 seconds
- Add a post-deploy wait-and-retry health check in CI:
  ```bash
  sleep 30 && curl -sf https://api.feelr.dev/health
  ```
- Do the first production deploy during a maintenance window, not during peak traffic

**Phase to address:**
First production deployment.

**Confidence:** HIGH (verified via [Cloudflare Workers Known Issues](https://developers.cloudflare.com/workers/platform/known-issues/))

---

### Pitfall 16: Staging vs Production Environment Variable Drift

**What goes wrong:**
Over time, staging and production diverge. Someone adds a new `DISCORD_CLIENT_ID` secret to production but forgets staging. A new feature works in production but CI tests against staging fail with "missing secret" errors. Or worse: staging tests pass because the code has a fallback for the missing variable, but the fallback masks a real bug.

**Why it happens:**
Secrets are set manually (`wrangler secret put`, Azure Portal, GitHub UI). There is no single source of truth for "what secrets must exist in each environment." Each service (Workers, Azure App Service, GitHub Actions) has its own secrets management interface.

**Warning signs:**
- Features work in production but fail in staging (or vice versa)
- "Variable not found" errors only in one environment
- New team members cannot set up staging because the required secrets list is undocumented

**Prevention:**
- Maintain a `.env.example` file per service that lists ALL required variables (without values):
  ```bash
  # apps/gateway/.env.example
  ENCRYPTION_KEY=     # Required: wrangler secret put ENCRYPTION_KEY
  ADMIN_TOKEN=        # Required: wrangler secret put ADMIN_TOKEN
  SLACK_CLIENT_ID=    # Required for Slack connector
  SLACK_CLIENT_SECRET=# Required for Slack connector
  ```
- Add a CI step that verifies required secrets exist in each environment:
  ```bash
  wrangler secret list --env staging | sort > /tmp/staging-secrets
  wrangler secret list --env production | sort > /tmp/production-secrets
  diff /tmp/staging-secrets /tmp/production-secrets
  ```
- Use GitHub's environment-level secrets consistently: same secret names in `staging` and `production` environments, different values
- Document all required secrets in the deployment guide with instructions for obtaining each value

**Phase to address:**
First CI/CD pipeline milestone -- secrets inventory as part of initial setup.

**Confidence:** MEDIUM (operational best practice; specific tooling verified)

---

### Pitfall 17: Azure App Service Managed Certificate Changes (July 2025)

**What goes wrong:**
Starting July 28, 2025, Azure App Service Managed Certificates (ASMC) can no longer be created or renewed if the app is only accessible privately, uses nested endpoints, or routes through an external proxy like Cloudflare. Since Feelr's Azure-hosted services route through Cloudflare's proxy, Azure's managed certificate provisioning may fail because DigiCert (Azure's CA) cannot reach the origin directly.

**Why it happens:**
Azure's managed certificates require DigiCert to perform HTTP validation against the origin server. When Cloudflare proxies the traffic, DigiCert sees Cloudflare's certificate, not the origin. This is a deliberate change by Microsoft to improve certificate security.

**Warning signs:**
- Azure Portal shows "Certificate renewal failed" for managed certificates
- SSL certificate expiration warnings in Azure
- HTTPS errors on Azure-hosted domains after certificate expiry

**Prevention:**
- Since Cloudflare is proxying traffic to Azure anyway, you have two options:
  1. **Use Cloudflare's edge certificate only** (recommended): Set Cloudflare SSL to "Full" mode. Cloudflare terminates SSL at the edge. Azure App Service serves HTTP internally. No Azure certificate needed.
  2. **Use a Cloudflare Origin Certificate**: Generate a free origin certificate in Cloudflare Dashboard (valid for up to 15 years). Upload it to Azure App Service as a custom certificate. This allows "Full Strict" mode.
- Do NOT rely on Azure Managed Certificates for Cloudflare-proxied domains
- If you need "Full Strict" for compliance: use the Cloudflare Origin Certificate approach

**Phase to address:**
SSL/DNS configuration phase.

**Confidence:** HIGH (verified via [Azure ASMC Changes July 2025](https://learn.microsoft.com/en-us/azure/app-service/app-service-managed-certificate-changes-july-2025))

---

### Pitfall 18: Monorepo Rebuilds Everything on Every Push

**What goes wrong:**
The CI workflow runs `turbo run build test` on every push. Without Turborepo's filtering or caching, this builds and tests ALL packages in the monorepo -- gateway, dashboard, docs, all 4 connectors, and shared packages -- even if only the README changed. For a monorepo this size, full builds take 5-10 minutes. Developers stop pushing frequently because CI is slow.

**Why it happens:**
The simplest CI configuration runs all tasks. Turborepo's `--filter` flag and change detection require additional configuration. Teams plan to add filtering "later" but the slow CI becomes normalized.

**Warning signs:**
- CI takes 5+ minutes for documentation-only changes
- Developers batch commits to avoid triggering CI
- CI runner minutes (billed resource) are high relative to code velocity

**Prevention:**
- Use Turborepo's `--filter` with `[HEAD^1]` for affected-only builds:
  ```yaml
  - run: pnpm turbo run build test --filter='...[HEAD^1]'
  ```
- Configure path-based workflow triggers for separate jobs:
  ```yaml
  on:
    push:
      paths:
        - 'apps/gateway/**'
        - 'packages/**'  # Shared packages affect gateway
  ```
- Use Turborepo remote caching so branch builds benefit from main branch cache
- Add `.turbo` to the GitHub Actions cache (see Pitfall 9)

**Phase to address:**
CI/CD pipeline optimization -- after initial pipeline works.

**Confidence:** HIGH (verified via [Turborepo CI docs](https://turborepo.dev/docs/guides/ci-vendors/github-actions) and [WarpBuild monorepo guide](https://www.warpbuild.com/blog/github-actions-monorepo-guide))

---

## Integration Pitfalls

Mistakes specific to the interaction between components in this stack.

---

### Pitfall 19: Cloudflare DNS for API + Namecheap DNS for Azure = Split DNS Management Hell

**What goes wrong:**
`feelr.dev` is registered on Namecheap. For `api.feelr.dev` to use Cloudflare Workers, the domain's nameservers must point to Cloudflare (full DNS setup). But this means ALL DNS records -- including those for Azure-hosted services -- must be managed in Cloudflare's dashboard, not Namecheap's. Teams forget this and add DNS records in Namecheap's panel, which are ignored because Cloudflare is the authoritative DNS provider. Or worse, they use Cloudflare's partial (CNAME) setup, which limits features.

**Why it happens:**
Namecheap is the registrar. Cloudflare is the DNS provider. These are different roles. Teams confuse "where I bought the domain" with "where I manage DNS records."

**Warning signs:**
- DNS records added in Namecheap do not resolve
- Conflicting records between Namecheap and Cloudflare panels
- Team members unsure which dashboard to use for DNS changes

**Prevention:**
- Use Cloudflare as the sole DNS provider (full setup, not partial/CNAME setup): change nameservers at Namecheap to Cloudflare's assigned nameservers
- Document clearly: "ALL DNS changes happen in Cloudflare Dashboard. Namecheap is only used for domain renewal and nameserver configuration."
- Lock Namecheap DNS to prevent accidental changes (Namecheap has a "Domain Lock" feature)
- Create a DNS record inventory in the deployment guide:
  ```
  api.feelr.dev  -> Workers (custom domain, Cloudflare native)
  app.feelr.dev  -> CNAME to feelr-dashboard.azurewebsites.net (proxied)
  feelr.dev      -> CNAME to feelr-docs.azurewebsites.net (CNAME flattened, proxied)
  ```

**Phase to address:**
DNS configuration -- the very first deployment step.

**Confidence:** HIGH (standard DNS management practice)

---

### Pitfall 20: Azure App Service Missing `standalone` Output Mode for Next.js Container

**What goes wrong:**
Next.js default build output is not optimized for containers. Without `output: 'standalone'` in `next.config.js`, the build output requires the full `node_modules` directory (hundreds of MB). The Docker image is bloated, startup is slow, and Azure's health check may time out. Additionally, the standalone output requires manually copying the `public/` and `.next/static/` directories to the standalone output folder.

**Why it happens:**
`next build` generates a `.next/` directory that depends on `node_modules`. The `standalone` output mode generates a self-contained `server.js` with only the required dependencies. Teams either forget to enable standalone mode or forget to copy the static assets.

**Warning signs:**
- Docker image is 500MB+ instead of 100-200MB
- Container startup takes 30+ seconds
- Missing CSS/JS/images after deployment (static assets not copied)
- "Cannot find module" errors at runtime

**Prevention:**
- Add `output: 'standalone'` to `next.config.js` for both dashboard and docs
- In the Dockerfile, copy all required files:
  ```dockerfile
  COPY --from=builder /app/.next/standalone ./
  COPY --from=builder /app/.next/static ./.next/static
  COPY --from=builder /app/public ./public
  ```
- Set the start command to `node server.js` (not `next start`)
- Verify the standalone server listens on the correct port matching `WEBSITES_PORT`

**Phase to address:**
Dashboard and docs Dockerfile creation.

**Confidence:** HIGH (verified via [Next.js Dockerization guide](https://dev.to/flrndml/how-to-dockerize-a-nextjs-app-2025-5dlh) and [Azure Next.js deployment troubleshooting](https://learn.microsoft.com/en-us/answers/questions/2238095/issue-deploying-next-js-app-to-azure-app-service-c))

---

## Phase-Specific Warnings

| Phase/Topic | Likely Pitfall | Mitigation | Severity |
|-------------|---------------|------------|----------|
| DNS setup | Cloudflare proxy blocks Azure domain verification (#4) | Gray cloud during verification, orange cloud after | Critical |
| DNS setup | Split DNS management confusion (#19) | Cloudflare as sole DNS, document clearly | Moderate |
| DNS setup | CNAME flattening + Full Strict SSL (#5) | Use "Full" mode or Cloudflare Origin Certificate | Critical |
| SSL setup | Azure managed cert renewal failure (#17) | Use Cloudflare edge cert or Origin Certificate | Moderate |
| Workers CI/CD | Binding inheritance trap (#1) | Explicit per-environment bindings | Critical |
| Workers CI/CD | Wrangler overwrites secrets (#7) | `keep_vars = true` | Critical |
| Workers CI/CD | DO migration destroys data (#2) | Pre-deploy migration diff check | Critical |
| Workers CI/CD | D1 migration ordering (#12) | Migrate before deploy, separate jobs | Moderate |
| Workers CI/CD | First deploy 523 error (#15) | Document, add retry health check | Minor |
| Azure CI/CD | Container health check ignored (#3) | Set WEBSITES_PORT, configure Azure health check | Critical |
| Azure CI/CD | Next.js env vars not embedded (#8) | Build-arg injection per environment | Moderate |
| Azure CI/CD | Missing standalone output (#20) | Configure next.config.js, copy static assets | Moderate |
| GitHub Actions | Secret exfiltration via actions (#6) | Pin to SHA, use environments, OIDC | Critical |
| GitHub Actions | Concurrency group cancels deploys (#10) | Tag-based production, separate migration job | Moderate |
| GitHub Actions | pnpm before setup-node (#14) | Install pnpm first | Minor |
| Monorepo CI/CD | Turborepo cache not persisted (#9) | Cache .turbo directory | Moderate |
| Monorepo CI/CD | Full rebuild on every push (#18) | --filter, path triggers, remote cache | Moderate |
| CLI release | GoReleaser monorepo config (#11) | workingDirectory or -f flag | Moderate |
| Deployment ordering | Dashboard before API (#13) | Dependency chain with health checks | Moderate |
| Environment mgmt | Secret drift between envs (#16) | .env.example, CI verification | Moderate |

---

## Deployment Ordering Checklist

The safe order for first-time production deployment:

```
Phase A: DNS & SSL Foundation
  1. Transfer nameservers from Namecheap to Cloudflare
  2. Wait for NS propagation (up to 24 hours, usually 1-2 hours)
  3. Add DNS records in Cloudflare (all gray cloud / DNS only initially)
  4. Verify Azure custom domains (while records are gray cloud)
  5. Configure SSL: Cloudflare "Full" mode for Azure-proxied domains
  6. Enable Cloudflare proxy (orange cloud) on Azure-targeted records

Phase B: Backend Infrastructure
  7. Create production KV namespaces, D1 databases, DO namespaces
  8. Set production secrets via wrangler secret put
  9. Run D1 migrations against production database
  10. Deploy gateway Worker
  11. Verify gateway health: curl https://api.feelr.dev/health

Phase C: Frontend Services
  12. Build dashboard Docker image with production env vars
  13. Push to container registry
  14. Deploy to Azure App Service
  15. Set WEBSITES_PORT=3000
  16. Verify dashboard health: curl https://app.feelr.dev
  17. Repeat 12-16 for docs site

Phase D: CLI & Verification
  18. Tag release for GoReleaser
  19. Verify CLI installation: brew install andrewprograde/tap/feelr
  20. Full smoke test: CLI -> API -> Dashboard round-trip
```

---

## Sources

### Cloudflare Official Documentation (HIGH confidence)
- [Wrangler Environments](https://developers.cloudflare.com/workers/wrangler/environments/) -- non-inheritable bindings, environment naming
- [Wrangler Configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) -- keep_vars, binding definitions
- [Durable Objects Migrations](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/) -- atomic migrations, SQLite permanence
- [D1 Migrations](https://developers.cloudflare.com/d1/reference/migrations/) -- migration ordering, rollback behavior
- [D1 Environments](https://developers.cloudflare.com/d1/configuration/environments/) -- per-environment database IDs
- [CNAME Flattening](https://developers.cloudflare.com/dns/cname-flattening/) -- zone apex behavior, cross-account restriction
- [CNAME Domain Verification](https://developers.cloudflare.com/dns/manage-dns-records/troubleshooting/cname-domain-verification/) -- proxy blocks verification
- [Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) -- route conflicts, custom_domain config
- [Workers Known Issues](https://developers.cloudflare.com/workers/platform/known-issues/) -- 523 errors on first deploy
- [GitHub Actions for Workers](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/) -- official workflow setup

### Azure Official Documentation (HIGH confidence)
- [Azure App Service Container Configuration](https://learn.microsoft.com/en-us/azure/app-service/configure-custom-container) -- WEBSITES_PORT, health check
- [Azure App Service Health Check](https://learn.microsoft.com/en-us/azure/app-service/monitor-instances-health-check) -- Always On, health check behavior
- [Azure ASMC Changes July 2025](https://learn.microsoft.com/en-us/azure/app-service/app-service-managed-certificate-changes-july-2025) -- managed certificate restrictions
- [Azure Custom Domains and Certificates](https://learn.microsoft.com/en-us/azure/app-service/tutorial-secure-domain-certificate) -- domain verification process

### GitHub Official Documentation (HIGH confidence)
- [GitHub Actions Concurrency](https://docs.github.com/actions/writing-workflows/choosing-what-your-workflow-does/control-the-concurrency-of-workflows-and-jobs) -- queue behavior, cancel-in-progress semantics
- [GitHub Actions Secrets](https://docs.github.com/actions/security-guides/using-secrets-in-github-actions) -- secret scoping, environment protection
- [GitHub Actions Environments](https://docs.github.com/actions/deployment/targeting-different-environments/using-environments-for-deployment) -- environment-level secrets

### Turborepo Official Documentation (HIGH confidence)
- [Turborepo GitHub Actions Guide](https://turborepo.dev/docs/guides/ci-vendors/github-actions) -- caching, remote cache setup

### Community & Incident Reports (MEDIUM confidence)
- [CVE-2025-30066: tj-actions/changed-files compromise](https://checkmarx.com/zero-post/compromised-github-actions-leading-to-credential-leaks/) -- supply chain attack on GitHub Actions
- [Cloudflare Community: KV binding not set in production](https://community.cloudflare.com/t/my-kv-binding-is-not-being-set-by-my-wrangler-toml-file-when-deploying-to-my-production-environment/488163)
- [Cloudflare Community: CNAME flattening + Full Strict SSL](https://community.cloudflare.com/t/cname-flattening-and-full-strict-ssl-causes-invalid-ssl-certificate-error-526/54760)
- [Azure Q&A: Next.js container port 8080 issue](https://learn.microsoft.com/en-us/answers/questions/2264394/(app-service)-container-start-server-on-port-8080)
- [Next.js Azure Docker deployment guide](https://medium.com/@mindelias/how-to-deploy-next-js-to-azure-app-service-with-docker-a-complete-guide-to-environment-variables-1aa19d85000a)

### Package Manager & Build Tool Documentation (HIGH confidence)
- [pnpm Continuous Integration](https://pnpm.io/continuous-integration) -- GitHub Actions setup order
- [GoReleaser Monorepo](https://goreleaser.com/customization/monorepo/) -- Pro feature, working directory workaround
- [GoReleaser GitHub Action](https://github.com/goreleaser/goreleaser-action) -- workingDirectory parameter

---
*Deployment & CI/CD pitfalls research for: Feelr -- Agent-Friendly API Simplification Layer*
*Researched: 2026-02-09*
*Supplements original application pitfalls research from 2026-02-05*
