# Phase 16: Deployment Guides & Hardening - Research

**Researched:** 2026-02-10
**Domain:** Internal deployment runbooks, automated deployment scripts, wrangler binding validation CI, secrets inventory management
**Confidence:** HIGH

## Summary

Phase 16 captures all deployment knowledge -- currently scattered across Phase 12-15 research docs, workflow files, and wrangler.toml comments -- into structured runbooks, deployment scripts, and CI validation checks. This is primarily a documentation and automation phase with one CI engineering task (binding overlap validation).

The project has three independently deployable services: (1) the Cloudflare Workers gateway at `api.feelr.dev`, (2) the Next.js dashboard at `app.feelr.dev` hosted on Azure SWA, and (3) the Nextra docs site at `feelr.dev` hosted on Azure SWA. Each has staging and production environments with distinct deployment procedures. Additionally, the Go CLI is released via GoReleaser on tag push. The gateway uses Cloudflare's `wrangler versions upload` + `versions deploy` for gradual rollouts (10% then 100%) in production, while SWA frontend apps deploy atomically. Rollback for the gateway uses `wrangler rollback` (up to 100 versions); SWA rollback requires redeploying a previous commit since Azure SWA has no native rollback mechanism.

The binding overlap validation (DOC-06) requires parsing `wrangler.toml` in CI to extract KV namespace IDs and D1 database IDs from both `[env.staging]` and `[env.production]` sections, then asserting they have zero intersection. This is a lightweight Node.js script (TOML parsing + set intersection) that runs as a CI job alongside existing checks. The secrets inventory (CI-08) documents six categories of secrets: Cloudflare Worker secrets (per-env), GitHub Actions repository secrets, Azure SWA deployment tokens, GoReleaser tokens, Cloudflare API credentials, and Azure CLI credentials.

**Primary recommendation:** Structure this as three plans: (1) Create the deployment runbook covering first-time setup, routine deployments, rollbacks, and troubleshooting (DOC-01 through DOC-04), (2) Create automated deployment scripts with inline comments and a secrets inventory (DOC-05, CI-08), (3) Add the CI binding validation check (DOC-06).

## Standard Stack

### Core

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Markdown | N/A | Runbook and inventory format | Human-readable, git-tracked, diffs well, renders natively on GitHub |
| Bash (POSIX sh) | system | Deployment automation scripts | Portable, runs in CI and locally, no dependencies |
| Node.js | 20 | TOML parsing for binding validation | Already in CI runners; `smol-toml` is zero-dependency TOML 1.0 parser |
| smol-toml | ^1.3.0 | Parse wrangler.toml in CI | Zero dependencies, TOML 1.0 compliant, 5KB, well-maintained |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| wrangler | ^4.0.0 | Gateway deployment CLI | All gateway deployment and rollback procedures |
| az CLI | latest | Azure SWA management | SWA provisioning, token retrieval, hostname management |
| gh CLI | latest | GitHub secret management | Setting repository secrets for deployment tokens |
| jq | system | JSON processing in scripts | Parsing wrangler versions list output, az CLI output |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| smol-toml (JS) | @iarna/toml | @iarna/toml is older and larger; smol-toml is modern, tiny, TOML 1.0 compliant |
| smol-toml (JS) | Python toml module | Would require Python in CI; Node.js is already available |
| smol-toml (JS) | grep/awk on wrangler.toml | Fragile text parsing; TOML has multi-line values and nested arrays that regex cannot handle reliably |
| Bash scripts | Makefile | Makefiles are less readable for sequential operational procedures; bash scripts allow inline comments and step-by-step explanations |
| Markdown runbook | Notion/Confluence wiki | Runbook should live in the repo (single source of truth), be version-controlled, and work offline |

**Installation:**
```bash
# For binding validation CI check
pnpm add -D smol-toml --filter=@feelr/gateway
```

## Architecture Patterns

### Recommended File Structure

```
docs/
  deployment/
    RUNBOOK.md                  # DOC-01 through DOC-04: Complete deployment runbook
    SECRETS-INVENTORY.md        # CI-08: Secrets inventory with rotation procedures
scripts/
  deploy-gateway-staging.sh     # DOC-05: Gateway staging deployment
  deploy-gateway-production.sh  # DOC-05: Gateway production deployment (gradual rollout)
  deploy-dashboard.sh           # DOC-05: Dashboard manual deployment
  deploy-docs.sh                # DOC-05: Docs manual deployment
  rollback-gateway.sh           # DOC-05: Gateway rollback script
  validate-bindings.sh          # DOC-06: Wrapper for CI binding validation
  check-bindings.mjs            # DOC-06: Node.js TOML parser + binding overlap check
```

### Pattern 1: Deployment Runbook Structure

**What:** A single comprehensive Markdown document organized by operational procedure (first-time setup, routine deploy, rollback, troubleshooting) with service-specific subsections.

**When to use:** As the primary reference for all deployment operations.

**Structure:**
```markdown
# Feelr Deployment Runbook

## Prerequisites
[Tools, accounts, access requirements]

## 1. First-Time Setup (End-to-End)
### 1.1 Cloudflare Account & DNS
### 1.2 Gateway Resources (KV, D1, DO)
### 1.3 Gateway Secrets
### 1.4 Azure SWA Provisioning
### 1.5 Azure SWA Custom Domains
### 1.6 GitHub Actions Secrets
### 1.7 First Deployment

## 2. Routine Deployments
### 2.1 Gateway Staging (push to main)
### 2.2 Gateway Production (tag push)
### 2.3 Dashboard & Docs (push to main / tag push)
### 2.4 CLI Release (tag push)

## 3. Rollback Procedures
### 3.1 Gateway Rollback
### 3.2 SWA Rollback (Dashboard / Docs)
### 3.3 CLI Rollback

## 4. Troubleshooting
### 4.1 Gateway Issues
### 4.2 SWA Issues
### 4.3 CI/CD Issues
### 4.4 DNS & SSL Issues
```

### Pattern 2: Binding Validation CI Check

**What:** A Node.js script that parses `wrangler.toml`, extracts all resource IDs (KV namespace IDs, D1 database IDs) from staging and production environment sections, and asserts zero overlap. Runs in CI as a GitHub Actions job.

**When to use:** On every PR and push to main, alongside lint/typecheck/test.

**Example:**
```javascript
// scripts/check-bindings.mjs
// Source: wrangler.toml parsing for binding validation (DOC-06)
import { parse } from 'smol-toml';
import { readFileSync } from 'node:fs';

const toml = readFileSync('apps/gateway/wrangler.toml', 'utf-8');
const config = parse(toml);

function extractIds(envConfig) {
  const ids = new Set();
  // KV namespace IDs
  if (envConfig.kv_namespaces) {
    for (const ns of envConfig.kv_namespaces) {
      ids.add(ns.id);
    }
  }
  // D1 database IDs
  if (envConfig.d1_databases) {
    for (const db of envConfig.d1_databases) {
      ids.add(db.database_id);
    }
  }
  return ids;
}

const staging = config.env?.staging;
const production = config.env?.production;

if (!staging || !production) {
  console.error('ERROR: Missing staging or production environment in wrangler.toml');
  process.exit(1);
}

const stagingIds = extractIds(staging);
const productionIds = extractIds(production);

const overlap = [...stagingIds].filter(id => productionIds.has(id));

if (overlap.length > 0) {
  console.error('ERROR: Staging and production share resource IDs:');
  for (const id of overlap) {
    console.error(`  - ${id}`);
  }
  process.exit(1);
}

console.log(`Binding validation passed:`);
console.log(`  Staging IDs:    ${[...stagingIds].join(', ')}`);
console.log(`  Production IDs: ${[...productionIds].join(', ')}`);
console.log('  Overlap: NONE');
```

**CI integration:**
```yaml
# Addition to ci.yml
- name: Validate wrangler bindings
  run: node scripts/check-bindings.mjs
```

### Pattern 3: Automated Deployment Scripts

**What:** Shell scripts with extensive inline comments that wrap the actual deployment commands. Not intended to replace CI/CD, but to provide documented, repeatable manual procedures for emergency deployments and first-time setup.

**When to use:** When CI/CD is unavailable, for first-time setup, or as reference for understanding deployment steps.

**Key characteristics:**
- POSIX sh for portability (no bash-isms)
- `set -euo pipefail` for safety
- Every command preceded by a comment explaining what it does and why
- Confirmation prompts before destructive operations
- Color-coded output (info/success/error) matching `self-host/init.sh` style

### Pattern 4: Secrets Inventory Document

**What:** A structured Markdown document listing every secret, where it is stored, what it is used for, and how to rotate it.

**When to use:** During first-time setup, secret rotation, and incident response.

**Structure per secret:**
```markdown
### SECRET_NAME
- **What:** Brief description
- **Where stored:** GitHub Actions secret / Cloudflare Worker secret / Azure
- **Used by:** Which workflow/service
- **Rotation procedure:**
  1. Generate new value
  2. Update in storage location
  3. Verify still works
- **Impact if compromised:** What an attacker could do
```

### Anti-Patterns to Avoid

- **Documenting ephemeral state as permanent truth:** Runbooks should describe procedures, not record current values. Resource IDs, hostnames, and tokens belong in configuration files and secret stores, not in runbook prose. Reference `wrangler.toml` for IDs, not hardcoded strings in docs.
- **Scripts that bypass CI/CD without warnings:** Manual deployment scripts must prominently warn that CI/CD is the primary deployment path and manual scripts are for emergencies or first-time setup only.
- **Secrets in documentation:** The secrets inventory documents what secrets exist and how to rotate them, never the actual secret values. No example values that look like real credentials.
- **Binding validation that only checks IDs:** The check should verify all uniquely-identifiable resource references (KV namespace IDs, D1 database IDs). Rate limit bindings use `namespace_id: "0"` in both environments (this is correct -- it is a rate limit policy identifier, not a Cloudflare resource ID).
- **Over-engineering the binding check with external tools:** A simple Node.js script with a TOML parser is sufficient. Do not introduce a test framework, schema validator, or complex CI infrastructure for what is essentially a set intersection check.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TOML parsing | Regex-based extraction from wrangler.toml | `smol-toml` npm package | TOML has multi-line values, inline tables, arrays of tables; regex is fragile |
| Secret rotation procedures | Custom rotation automation tool | Documented manual procedures in SECRETS-INVENTORY.md | Secrets change rarely; manual rotation with documented steps is appropriate for solo developer |
| Deployment orchestration | Custom multi-service deploy script | GitHub Actions workflows (already built in Phase 13/15) | CI/CD is the primary deployment mechanism; scripts are supplementary |
| Health check verification | Custom monitoring tool | `curl` in scripts, `jtalk/url-health-check-action` in CI | Simple HTTP health checks are sufficient; monitoring infrastructure is out of scope |

**Key insight:** This phase is documentation and lightweight automation. The heavy engineering work (CI/CD pipelines, environment isolation, gradual rollouts) was completed in Phases 12-15. Phase 16 captures that knowledge in a maintainable, discoverable format and adds one CI safety check.

## Common Pitfalls

### Pitfall 1: Runbook Becomes Stale

**What goes wrong:** The runbook is written once, then deployment procedures change (new services, changed URLs, updated commands) without updating the runbook. Developers follow stale instructions and deployments fail.
**Why it happens:** Documentation rot is inevitable without maintenance discipline. Deployment procedures evolve faster than people remember to update docs.
**How to avoid:** (1) Keep the runbook in the repo (not an external wiki) so it is visible during code review. (2) Reference config files by path rather than copying values into the runbook. (3) Add a "Last verified" date at the top of each section. (4) The binding validation CI check serves as a partial guardrail -- if bindings change, the check still runs.
**Warning signs:** Runbook references deleted files, outdated URLs, or commands that no longer exist.

### Pitfall 2: Binding Validation Breaks on wrangler.toml Format Changes

**What goes wrong:** The TOML parser works today but fails if the wrangler.toml structure changes (e.g., migrating to wrangler.jsonc, adding new binding types, or restructuring environments).
**Why it happens:** The validation script assumes a specific TOML structure with `env.staging.kv_namespaces`, `env.production.d1_databases`, etc.
**How to avoid:** Keep the script simple and well-commented. If the config format changes, the script will fail loudly (parse error or missing section), which is actually the correct behavior -- it forces a human to review the change. Do not try to make it resilient to unknown formats.
**Warning signs:** CI binding check starts failing after wrangler.toml restructuring.

### Pitfall 3: SWA Rollback Confusion

**What goes wrong:** Developer needs to roll back the dashboard or docs site but discovers Azure SWA has no `rollback` command or deployment history navigation.
**Why it happens:** Unlike Cloudflare Workers (which has `wrangler rollback` with 100-version history), Azure Static Web Apps does not provide native rollback. The only rollback path is redeploying a previous version of the code.
**How to avoid:** Document the SWA rollback procedure explicitly: (1) find the last known-good commit, (2) check it out, (3) rebuild with correct env vars, (4) redeploy using SWA deployment action or CLI. Alternatively, use `git revert` to create a forward-moving commit that undoes the problematic change, then let CI deploy it.
**Warning signs:** Developer searches for `swa rollback` or `az staticwebapp rollback` and finds nothing.

### Pitfall 4: Rate Limit namespace_id Flagged as Overlap

**What goes wrong:** The binding validation script incorrectly flags the rate limit `namespace_id: "0"` as a shared resource between staging and production.
**Why it happens:** Both staging and production rate limit bindings use `namespace_id = "0"`. This is correct -- `namespace_id` for `unsafe.bindings` of type `ratelimit` is a policy identifier (not a Cloudflare resource ID). The "0" means "default rate limit policy" and is intentionally shared.
**How to avoid:** The validation script should only check `kv_namespaces[].id` and `d1_databases[].database_id` -- not `unsafe.bindings[].namespace_id`. Rate limit bindings do not reference shared Cloudflare resources.
**Warning signs:** CI check fails with "Staging and production share resource IDs: 0".

### Pitfall 5: DO Migration Rollback Blocked

**What goes wrong:** Developer tries to roll back the gateway after a release that included a new Durable Object migration, but `wrangler rollback` refuses.
**Why it happens:** Cloudflare explicitly blocks rollbacks across DO migration boundaries. Once a `[[migrations]]` tag is applied, you cannot roll back to a version before that migration.
**How to avoid:** Document this constraint prominently in the rollback section of the runbook. The workaround is to fix-forward (deploy a new version with the fix) rather than rolling back. If the migration itself is the problem, the only option is to deploy a new version that includes both the migration and a code fix.
**Warning signs:** `wrangler rollback` error: "Cannot rollback because a Durable Object migration has occurred."

### Pitfall 6: Scripts Not Executable

**What goes wrong:** Developer downloads the repo and tries to run `scripts/deploy-gateway-staging.sh` but gets "Permission denied."
**Why it happens:** Shell scripts need the executable bit set (`chmod +x`), and this must be committed to git. If scripts are created without setting the executable permission, git will store them as non-executable.
**How to avoid:** Set executable permissions with `chmod +x scripts/*.sh` and commit the permission change. Git tracks file permissions (specifically the executable bit).
**Warning signs:** `./scripts/deploy-gateway-staging.sh` fails with "Permission denied".

### Pitfall 7: Secrets Inventory Becomes a Security Risk

**What goes wrong:** The secrets inventory file accidentally includes actual secret values, API keys, or tokens.
**Why it happens:** Copy-paste from terminal output, example values that are real, or placeholder values that match real credential formats.
**How to avoid:** The secrets inventory documents metadata only (name, location, rotation procedure), never values. Use obviously fake example values like `<YOUR_TOKEN_HERE>` or `sk_test_XXXX...`. Add a prominent warning header.
**Warning signs:** File contains strings matching credential patterns (base64, hex strings > 32 chars, `sk_`, `ghp_`, etc.).

## Code Examples

Verified patterns from project files and official documentation:

### Gateway Rollback Command (Verified via wrangler --help)

```bash
# List recent versions to find rollback target
npx wrangler versions list --env production --json

# Rollback to a specific version (non-interactive)
npx wrangler rollback <VERSION_ID> --env production --yes --message "Rollback: <reason>"

# Interactive rollback (shows 10 most recent versions)
npx wrangler rollback --env production
```

Source: `wrangler rollback --help` (Wrangler 4.64.0, verified locally)

### SWA Rollback via Git Revert + CI Deploy

```bash
# Find the last known-good commit
git log --oneline -10

# Option A: Git revert (creates forward commit, triggers CI)
git revert <BAD_COMMIT_SHA>
git push origin main
# CI automatically deploys the reverted code

# Option B: Manual redeploy of known-good commit
git checkout <GOOD_COMMIT_SHA>
NEXT_PUBLIC_GATEWAY_URL=https://api.feelr.dev pnpm turbo run build --filter=@feelr/dashboard
cp apps/dashboard/staticwebapp.config.json apps/dashboard/out/
npx @azure/static-web-apps-cli deploy apps/dashboard/out --deployment-token <TOKEN>
git checkout main  # Return to main branch
```

Source: [Azure SWA GitHub Issue #813](https://github.com/Azure/static-web-apps/issues/813) - Azure SWA has no native rollback

### Secrets Inventory Entry Template

```markdown
### CLOUDFLARE_API_TOKEN
- **What:** Cloudflare API token with Workers and D1 edit permissions
- **Where stored:** GitHub Actions repository secret (progradetech/feelr)
- **Used by:** gateway.yml, ci.yml (gateway-preview job)
- **Scope:** Single Cloudflare account, single zone (feelr.dev)
- **Required permissions:** Account > Workers > Edit, Account > D1 > Edit
- **Rotation procedure:**
  1. Go to Cloudflare Dashboard > My Profile > API Tokens
  2. Create new token with same permissions as current
  3. Run: `gh secret set CLOUDFLARE_API_TOKEN --body "<NEW_TOKEN>"`
  4. Trigger a staging deploy to verify: push a no-op commit to main
  5. Once verified, delete the old token in Cloudflare Dashboard
- **Impact if compromised:** Attacker can deploy code to Workers, read/write KV and D1 data
```

### Complete Secrets Map (from Project Analysis)

The project uses secrets across four systems:

**1. GitHub Actions Repository Secrets** (stored in GitHub, org: progradetech)
| Secret Name | Used By | Purpose |
|-------------|---------|---------|
| `CLOUDFLARE_API_TOKEN` | gateway.yml, ci.yml | Cloudflare Workers deployment |
| `CLOUDFLARE_ACCOUNT_ID` | gateway.yml, ci.yml | Cloudflare account identifier |
| `SWA_DASHBOARD_DEPLOYMENT_TOKEN` | dashboard.yml | Azure SWA dashboard deployment |
| `SWA_DOCS_DEPLOYMENT_TOKEN` | docs.yml | Azure SWA docs deployment |
| `HOMEBREW_TAP_GITHUB_TOKEN` | release.yml | GoReleaser Homebrew tap push |
| `GITHUB_TOKEN` | All workflows | Automatic, provided by GitHub Actions |

**2. Cloudflare Worker Secrets** (set via `wrangler secret put --env <ENV>`)
| Secret Name | Environments | Purpose |
|-------------|-------------|---------|
| `ENCRYPTION_KEY` | staging, production | AES-256-GCM encryption for stored credentials |
| `ADMIN_TOKEN` | staging, production | Admin authentication for dashboard/management endpoints |
| `SLACK_CLIENT_ID` | staging, production | Slack OAuth app client ID |
| `SLACK_CLIENT_SECRET` | staging, production | Slack OAuth app client secret |
| `STRIPE_SECRET_KEY` | production (optional) | Stripe billing API key |
| `STRIPE_WEBHOOK_SECRET` | production (optional) | Stripe webhook signature verification |

**3. Azure SWA Deployment Tokens** (retrieved via `az staticwebapp secrets list`)
| Token | SWA App | Environment |
|-------|---------|-------------|
| Dashboard deployment token | feelr-dashboard | All (staging + production slots) |
| Docs deployment token | feelr-docs | All (staging + production slots) |

**4. External Service Credentials** (managed outside CI/CD)
| Credential | Used For | Managed In |
|-----------|----------|------------|
| Cloudflare login (email/password) | Dashboard access, manual operations | Cloudflare account |
| Azure subscription credentials | Azure CLI (`az login`) | Azure account |
| GitHub Personal Access Token (optional) | `gh` CLI authentication | GitHub account settings |

### Binding Validation CI Integration

```yaml
# Addition to .github/workflows/ci.yml
# Runs alongside lint/typecheck/test
- name: Validate wrangler binding isolation
  run: node scripts/check-bindings.mjs
```

The check should run as part of the existing `check` job in ci.yml, not as a separate job, because it is fast (< 1 second) and does not require any build artifacts.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Wrangler rollback limited to 10 versions | Rollback limit increased to 100 versions | 2025 | More rollback history; `wrangler versions list` still shows 10 but CLI accepts any version ID |
| `wrangler publish` | `wrangler deploy` | Wrangler 3.x (2023) | `publish` is deprecated; all scripts and runbooks must use `deploy` |
| `wrangler kv:namespace` (colon syntax) | `wrangler kv namespace` (space syntax) | Wrangler 3.60.0 (2024) | Scripts must use space-separated subcommands |
| Azure SWA Dedicated plan | Retired | October 2025 | Standard plan is now the highest tier for SWA |
| Manual secret rotation by memory | Documented rotation procedures in secrets inventory | This phase | Eliminates tribal knowledge for secret rotation |

**Deprecated/outdated:**
- `wrangler publish`: Replaced by `wrangler deploy`; scripts must not use `publish`
- `routes.json` for SWA: Replaced by `staticwebapp.config.json`
- Azure SWA Dedicated plan: Retired; use Standard

## Open Questions

1. **Should deployment scripts be POSIX sh or bash?**
   - What we know: The self-host `init.sh` script uses POSIX sh for maximum portability. CI runners use Ubuntu (bash available). Local development might be macOS (zsh default, bash available).
   - What's unclear: Whether portability across shells matters for internal deployment scripts.
   - Recommendation: Use `#!/usr/bin/env bash` with `set -euo pipefail` for deployment scripts. These are internal tooling scripts, not user-facing. Bash provides `pipefail`, arrays, and better error handling. POSIX sh portability is not needed since these scripts run on developer machines and CI runners that all have bash.

2. **Should the runbook live in `docs/deployment/` or at the repo root?**
   - What we know: The repo has no existing `docs/` directory (the `apps/docs/` is the public-facing docs site). No `scripts/` directory exists either.
   - What's unclear: Whether a top-level `docs/` directory would be confused with the public docs site.
   - Recommendation: Use `docs/deployment/` for runbooks and `scripts/` for deployment scripts. These are clearly separate from the public `apps/docs/` site. The `docs/` directory is a conventional location for internal documentation in many projects.

3. **Should the binding check be a standalone script or integrated into the gateway package?**
   - What we know: The check only applies to `apps/gateway/wrangler.toml`. It could be a root-level script or a package-level script.
   - What's unclear: Whether it is cleaner as a root `scripts/check-bindings.mjs` or as `apps/gateway/scripts/check-bindings.mjs`.
   - Recommendation: Place at `scripts/check-bindings.mjs` (repo root). The check is a CI concern, not a gateway build concern. Installing `smol-toml` as a root devDependency (or gateway devDependency) is straightforward either way. Root-level keeps deployment tooling together in `scripts/`.

4. **How detailed should troubleshooting sections be?**
   - What we know: DOC-04 requires "troubleshooting guide for common errors." Phases 12-15 documented numerous pitfalls.
   - What's unclear: Whether to reproduce all pitfalls from prior research or focus on operational errors a developer would actually encounter.
   - Recommendation: Focus on errors a developer would encounter during normal operations (deploy failures, health check failures, SSL issues, secret expiration). Reference the prior phase research docs for deeper architectural context. Keep it actionable: symptom -> likely cause -> fix.

## Sources

### Primary (HIGH confidence)
- [Cloudflare Workers Rollbacks](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/) - Rollback limits, DO migration constraint, 100-version history
- [Cloudflare Workers Versions & Deployments](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/) - Version lifecycle, gradual deployments
- `wrangler rollback --help` (Wrangler 4.64.0, verified locally) - Exact CLI syntax: `wrangler rollback [version-id] --env <env> --yes --message <msg>`
- `wrangler versions list --help` (Wrangler 4.64.0, verified locally) - `--json` flag for CI scripting
- `wrangler versions deploy --help` (Wrangler 4.64.0, verified locally) - Positional `<id>@<pct>%` syntax, `--yes`, `--dry-run`
- `wrangler secret list --help` (Wrangler 4.64.0, verified locally) - `--format json` for inventory scripts
- [Cloudflare Workers Rollback Version Limit](https://community.cloudflare.com/t/workers-worker-version-rollback-limit-increased-from-10-to-100/836591) - 100 version rollback limit (up from 10)
- [Azure SWA GitHub Issue #813 - Rollback](https://github.com/Azure/static-web-apps/issues/813) - Confirmed: SWA has no native rollback; must redeploy

### Verified via Project Files (HIGH confidence)
- `.github/workflows/gateway.yml` - Complete gateway deployment workflow (staging + production)
- `.github/workflows/dashboard.yml` - Dashboard SWA deployment workflow
- `.github/workflows/docs.yml` - Docs SWA deployment workflow
- `.github/workflows/ci.yml` - PR quality gates with staging preview
- `.github/workflows/release.yml` - GoReleaser CLI release
- `apps/gateway/wrangler.toml` - Multi-env config with real Cloudflare resource IDs
- `apps/gateway/src/lib/types.ts` - Complete `AppEnv` interface showing all bindings and secrets
- `apps/gateway/migrations/0001_init.sql` - D1 schema migration
- `.goreleaser.yaml` - CLI release configuration
- `self-host/init.sh` - Reference for script style (POSIX sh, color output, interactive prompts)
- `.gitignore` - Confirms `.dev.vars*` and `.env*` patterns for secret exclusion

### Prior Phase Research (HIGH confidence - project-internal)
- Phase 12 Research: Gateway infrastructure, environment isolation, resource creation procedures
- Phase 13 Research: CI/CD pipeline patterns, gradual rollouts, concurrency controls
- Phase 14 Research: Azure SWA provisioning, custom domain verification, DNS configuration
- Phase 15 Research: Frontend CI/CD, environment-aware builds, path triggers
- Phase 12-15 Verification Reports: Confirmed deployed state of all services

### Secondary (MEDIUM confidence)
- [smol-toml npm package](https://www.npmjs.com/package/smol-toml) - Zero-dependency TOML 1.0 parser for Node.js
- [Azure SWA rollback strategies](https://www.mindfulchase.com/deep-dives/azure-devops-ci-cd-pipeline/rolling-back-releases-strategies-and-implementation-in-azure-pipelines.html) - General Azure rollback patterns (not SWA-specific)

## Metadata

**Confidence breakdown:**
- Runbook content: HIGH - All procedures are documented across Phase 12-15 research and verified in VERIFICATION.md reports; exact CLI commands verified via `--help` locally
- Binding validation: HIGH - wrangler.toml structure is well-understood from Phase 12; TOML parsing via smol-toml is straightforward
- Secrets inventory: HIGH - Complete secrets map extracted from workflow files (grep for `secrets.`) and wrangler.toml comments; all six secret categories identified
- Rollback procedures: HIGH - Gateway rollback verified via `wrangler rollback --help`; SWA lack of rollback confirmed via GitHub issue and official docs
- Script patterns: MEDIUM - Self-host `init.sh` provides a style reference but deployment scripts are net-new; conventions are well-established in the ecosystem

**Research date:** 2026-02-10
**Valid until:** 2026-03-12 (30 days -- documentation patterns are stable; CLI commands verified against current versions)
