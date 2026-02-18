# Phase 11: DNS & Cloudflare Zone Setup + CI/CD Audit - Research

**Researched:** 2026-02-09
**Domain:** Cloudflare DNS zone management, Namecheap nameserver delegation, GoReleaser CI/CD pipeline audit
**Confidence:** HIGH

## Summary

Phase 11 has two independent workstreams: (1) establishing Cloudflare as the authoritative DNS provider for feelr.dev by transferring nameservers from Namecheap, and (2) auditing and fixing the existing GoReleaser-based release.yml workflow for CLI binary distribution. Both are well-documented procedures with known patterns, but each has specific pitfalls that can cause significant delays if missed.

The DNS transfer is a standard "full setup" zone migration: add feelr.dev to the Cloudflare dashboard, disable DNSSEC at Namecheap (if enabled), update Namecheap custom nameservers to Cloudflare's assigned pair, and wait for propagation (typically 15 minutes to 24 hours). The critical constraint is that **Cloudflare must own the DNS zone** before Workers Custom Domains (Phase 12) or Azure SWA domain verification (Phase 14) can proceed. Since .dev domains require HTTPS (the entire TLD is HSTS-preloaded), Cloudflare's automatic SSL provisioning via Universal SSL is essential -- but SSL only activates after the zone becomes active. DNS records should be added before the nameserver change to prevent any resolution downtime.

The CI/CD audit reveals **three concrete issues** in the existing release.yml and .goreleaser.yaml that will cause the release pipeline to fail when triggered: (1) the `brews` section does not include an explicit `token` field referencing `HOMEBREW_TAP_GITHUB_TOKEN`, so GoReleaser will fall back to `GITHUB_TOKEN` which cannot push to the external tap repo; (2) the `andrewprograde/homebrew-feelr` tap repository referenced in .goreleaser.yaml does not appear to exist and needs to be created; (3) the `brews` configuration section is deprecated since GoReleaser v2.10 in favor of `homebrew_casks`, though it remains functional. Additionally, the repository owner in .goreleaser.yaml (`andrewprograde`) differs from the actual remote origin (`progradetech`), which needs alignment.

**Primary recommendation:** Split this phase into two plans -- one for DNS zone setup (manual Cloudflare/Namecheap work with verification), one for GoReleaser audit (fix token config, create tap repo, test with snapshot build). DNS work should start first since propagation gates Phase 12.

## Standard Stack

### Core

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Cloudflare DNS | Free plan | Authoritative DNS for feelr.dev zone | Required for Workers Custom Domains; provides CNAME flattening, global Anycast, auto-SSL |
| Cloudflare Dashboard | N/A | Zone management UI | Primary interface for adding zones and managing DNS records |
| Namecheap Domain Panel | N/A | Registrar nameserver configuration | Where custom nameservers are set (domain stays registered at Namecheap) |
| GoReleaser | v2 (~> v2) | Go binary release automation | Already configured in project; handles cross-compilation, archives, Homebrew tap |
| goreleaser-action | v6 | GitHub Actions integration for GoReleaser | Official action; defaults to GoReleaser v2 |
| actions/setup-go | v5 | Go toolchain setup in CI | Supports `go-version-file` for extracting version from go.mod |
| actions/checkout | v4 | Repository checkout in CI | Required with `fetch-depth: 0` for GoReleaser changelog |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| dig | system | DNS query verification | Verify nameserver propagation with `dig feelr.dev NS` |
| nslookup | system | DNS query verification | Alternative to dig for nameserver verification |
| whatsmydns.net | web | Global DNS propagation check | Visual verification that nameservers propagated worldwide |
| goreleaser CLI | v2 | Local snapshot testing | Run `goreleaser release --snapshot --clean` to test config locally before pushing |
| goreleaser check | v2 | Config validation | Run `goreleaser check` to validate .goreleaser.yaml syntax and deprecation warnings |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Cloudflare DNS (full setup) | Cloudflare CNAME setup (partial) | Partial setup keeps Namecheap as DNS authority but requires Business plan ($200/mo) -- not viable |
| Cloudflare DNS (full setup) | Cloudflare Registrar (full transfer) | Transfers domain registration entirely to Cloudflare -- more permanent but unnecessary; nameserver delegation is sufficient |
| GoReleaser `brews` | GoReleaser `homebrew_casks` | Casks are the v2.10+ recommended replacement; however, for CLI binaries (not GUI apps), formulas via `brews` are more conventional -- migration is optional since `brews` remains functional |

## Architecture Patterns

### DNS Zone Transfer Flow

```
Current State:
  feelr.dev registered at Namecheap
  DNS managed by Namecheap BasicDNS (dns1.registrar-servers.com, dns2.registrar-servers.com)

Target State:
  feelr.dev registered at Namecheap (unchanged)
  DNS managed by Cloudflare (e.g., ada.ns.cloudflare.com, ben.ns.cloudflare.com)
  All DNS records in Cloudflare dashboard
```

### Pattern 1: Cloudflare Full Zone Setup (Nameserver Delegation)

**What:** Add feelr.dev to Cloudflare, get assigned nameservers, update Namecheap to use those nameservers. Cloudflare becomes authoritative DNS while Namecheap remains registrar.

**When to use:** When you need Cloudflare features (Workers Custom Domains, CDN, DDoS protection, auto-SSL) on the Free plan.

**Steps:**
1. Log into Cloudflare Dashboard > Add a site > Enter `feelr.dev`
2. Select Free plan
3. Cloudflare scans existing DNS records (review and confirm)
4. Note assigned nameservers (two unique hostnames like `xxx.ns.cloudflare.com`)
5. Disable DNSSEC at Namecheap if enabled (Advanced DNS tab > DNSSEC toggle)
6. In Namecheap Domain List > Manage > Nameservers > Custom DNS
7. Enter the two Cloudflare nameservers exactly as shown
8. Return to Cloudflare and click "Check nameservers"
9. Wait for zone activation (email notification, status changes to Active)

**Source:** [Cloudflare DNS Full Setup](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/)

### Pattern 2: GoReleaser Homebrew Tap Token Configuration

**What:** Configure GoReleaser to use a dedicated Personal Access Token for pushing formulas to a separate Homebrew tap repository, since `GITHUB_TOKEN` is scoped to the workflow's repository only.

**When to use:** When the Homebrew tap is in a different repository than the source code.

**Configuration:**
```yaml
# .goreleaser.yaml
brews:
  - name: feelr
    repository:
      owner: <owner>
      name: homebrew-feelr
      token: "{{ .Env.HOMEBREW_TAP_GITHUB_TOKEN }}"
    # ... rest of config
```

```yaml
# .github/workflows/release.yml
- name: Run GoReleaser
  uses: goreleaser/goreleaser-action@v6
  with:
    args: release --clean
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    HOMEBREW_TAP_GITHUB_TOKEN: ${{ secrets.HOMEBREW_TAP_GITHUB_TOKEN }}
```

**Source:** [GoReleaser Homebrew Tokens Discussion](https://github.com/orgs/goreleaser/discussions/4926)

### Pattern 3: GoReleaser Local Validation

**What:** Test GoReleaser config locally before pushing a tag, to catch issues early.

**Commands:**
```bash
# Validate config file (checks for deprecated options, syntax errors)
goreleaser check

# Build binaries without releasing (snapshot mode)
goreleaser release --snapshot --skip=publish --clean

# Verify build artifacts in dist/ directory
ls dist/
```

**Source:** [GoReleaser Snapshots](https://goreleaser.com/customization/snapshots/)

### Anti-Patterns to Avoid

- **Changing nameservers before adding DNS records in Cloudflare:** If Cloudflare's zone has incomplete records when it becomes authoritative, those hostnames will stop resolving. Always review and complete DNS records BEFORE the nameserver switch.
- **Assuming Cloudflare's auto-scan catches all records:** The automatic scan is not comprehensive. Manually verify all existing DNS records from Namecheap are present in Cloudflare before switching.
- **Using GITHUB_TOKEN for cross-repo Homebrew tap pushes:** The default GITHUB_TOKEN is scoped to the repository running the workflow. It cannot push to `homebrew-feelr` in a different repo. Must use a PAT.
- **Pushing a tag to test the release pipeline without local validation first:** Use `goreleaser release --snapshot --clean` locally to verify the config works before triggering the real workflow.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DNS propagation checking | Custom polling script | `dig feelr.dev NS @1.1.1.1` + whatsmydns.net | DNS TTL and caching make custom scripts unreliable; standard tools handle edge cases |
| Go cross-compilation | Manual `GOOS/GOARCH` build scripts | GoReleaser `builds` config | GoReleaser handles 6 platform combos, archives, checksums, and changelog automatically |
| Homebrew formula generation | Hand-written .rb formula files | GoReleaser `brews` section | GoReleaser auto-generates the formula with correct URLs, SHA256 checksums, and version |
| DNS record management | Terraform/Pulumi DNS modules | Cloudflare Dashboard (manual) | For a single zone with ~10 records, IaC adds state management overhead with no benefit |

**Key insight:** Phase 11 is primarily operational (manual UI steps + config fixes), not code-heavy. The tools exist; the work is configuration and verification.

## Common Pitfalls

### Pitfall 1: DNSSEC Not Disabled Before Nameserver Change

**What goes wrong:** After changing nameservers to Cloudflare, the domain becomes unreachable. Browsers show DNS resolution errors. Zone stays in "Pending" state indefinitely at Cloudflare.
**Why it happens:** DNSSEC signatures from the old provider are still cached by resolvers. Cloudflare's nameservers return unsigned responses that fail DNSSEC validation at resolvers. The domain effectively goes dark.
**How to avoid:** Check Namecheap Advanced DNS tab for DNSSEC status BEFORE changing nameservers. If enabled, disable DNSSEC and wait at least one TTL cycle (typically 1-2 hours) before updating nameservers.
**Warning signs:** Zone stays "Pending" in Cloudflare for more than 24 hours after nameserver change; `dig +dnssec feelr.dev` returns SERVFAIL.

### Pitfall 2: .dev Domain HSTS Preload (HTTPS Required)

**What goes wrong:** After DNS transfer, HTTP connections to feelr.dev fail. Browser shows "connection refused" or redirect loop.
**Why it happens:** The entire .dev gTLD is on the HSTS preload list, meaning browsers ONLY connect via HTTPS. If SSL is not provisioned or configured incorrectly, the site is unreachable.
**How to avoid:** Cloudflare's Universal SSL provisions automatically after zone activation. Ensure SSL/TLS mode is set to at least "Full" (not "Off" or "Flexible") after activation. Since no origin server exists yet, "Full" mode is fine -- it will be configured properly when services are deployed in later phases.
**Warning signs:** After zone activation, SSL status in Cloudflare dashboard does not show "Active."

### Pitfall 3: GoReleaser Tap Push Fails with GITHUB_TOKEN

**What goes wrong:** GoReleaser release succeeds (binaries uploaded to GitHub Release) but Homebrew formula push fails silently or with a 403/404 error.
**Why it happens:** The `brews.repository` section in .goreleaser.yaml does not include an explicit `token` field. GoReleaser falls back to `GITHUB_TOKEN`, which is scoped to `progradetech/feelr` and cannot write to a separate tap repository (even if owned by the same user/org).
**How to avoid:** Add `token: "{{ .Env.HOMEBREW_TAP_GITHUB_TOKEN }}"` to the `brews[0].repository` section. Create a Fine-Grained PAT with `contents: write` permission scoped to the tap repo. Store it as a repository secret.
**Warning signs:** GoReleaser log shows "could not push to tap repository" or "403 Forbidden" during the brew pipe step.

### Pitfall 4: Homebrew Tap Repository Does Not Exist

**What goes wrong:** GoReleaser completes the build but fails at the Homebrew formula publish step with a 404 error.
**Why it happens:** The `.goreleaser.yaml` references `andrewprograde/homebrew-feelr` but this repository does not exist. GoReleaser cannot create repositories; it can only push files to existing ones.
**How to avoid:** Create the `homebrew-feelr` repository on GitHub before running the release workflow. It should be a public repo with at least an initial commit (even just a README). The owner should match the `repository.owner` in .goreleaser.yaml.
**Warning signs:** Release workflow succeeds but no Homebrew formula appears; GoReleaser logs show 404 on the tap repo URL.

### Pitfall 5: Repository Owner Mismatch (.goreleaser.yaml vs Remote)

**What goes wrong:** The `.goreleaser.yaml` references `owner: andrewprograde` for the tap, but the feelr repo remote is `progradetech/feelr`. This inconsistency could cause confusion or PAT permission issues.
**Why it happens:** The GoReleaser config was authored with one GitHub identity but the repo may be under a different organization.
**How to avoid:** Decide on the canonical owner for the Homebrew tap and ensure the PAT has access to that owner's repos. Update .goreleaser.yaml to match the actual tap repo location.
**Warning signs:** PAT created for `andrewprograde` cannot access `progradetech` repos, or vice versa.

### Pitfall 6: DNS Record Zone Limit (200 Records on New Free Zones)

**What goes wrong:** Running out of DNS records unexpectedly.
**Why it happens:** Cloudflare reduced the free plan DNS record limit from 1,000 to 200 for zones created after September 1, 2024. This is still more than sufficient for feelr.dev (which needs ~10 records), but worth noting.
**How to avoid:** Not a practical concern for this project. Just be aware of the limit.
**Warning signs:** Cloudflare dashboard shows record creation error.

### Pitfall 7: Nameserver Names Must Be Exact

**What goes wrong:** Zone stays "Pending" at Cloudflare indefinitely even though nameservers were changed at Namecheap.
**Why it happens:** Cloudflare assigns specific nameserver hostnames that must be copied exactly. A typo, extra space, or swapped order causes validation to fail.
**How to avoid:** Copy-paste nameserver names directly from Cloudflare dashboard to Namecheap. Do not type them manually. Verify with `dig feelr.dev NS` from a non-cached resolver (e.g., `dig feelr.dev NS @1.1.1.1`).
**Warning signs:** `dig feelr.dev NS` returns old Namecheap nameservers more than 48 hours after the change.

## Code Examples

Verified patterns from official sources:

### DNS Verification Commands

```bash
# Check current nameservers for feelr.dev (bypass cache)
dig feelr.dev NS @1.1.1.1

# Expected output after successful transfer:
# ;; ANSWER SECTION:
# feelr.dev.    86400  IN  NS  xxx.ns.cloudflare.com.
# feelr.dev.    86400  IN  NS  yyy.ns.cloudflare.com.

# Check from Google's DNS
dig feelr.dev NS @8.8.8.8

# Full DNSSEC check (should NOT show AD flag if DNSSEC disabled)
dig +dnssec feelr.dev

# Check specific record propagation
dig api.feelr.dev A @1.1.1.1
dig app.feelr.dev CNAME @1.1.1.1
```

Source: Standard DNS diagnostic commands

### Fixed .goreleaser.yaml (brews section with explicit token)

```yaml
# .goreleaser.yaml
version: 2

project_name: feelr

builds:
  - id: feelr-cli
    dir: cli
    main: .
    binary: feelr
    ldflags:
      - -s -w -X main.version={{.Version}} -X main.commit={{.ShortCommit}}
    env:
      - CGO_ENABLED=0
    goos:
      - linux
      - darwin
      - windows
    goarch:
      - amd64
      - arm64

archives:
  - id: feelr-archive
    builds:
      - feelr-cli
    format: tar.gz
    format_overrides:
      - goos: windows
        format: zip
    name_template: "{{ .ProjectName }}_{{ .Version }}_{{ .Os }}_{{ .Arch }}"

brews:
  - name: feelr
    repository:
      owner: <CORRECT_OWNER>       # Must match the actual tap repo owner
      name: homebrew-feelr
      token: "{{ .Env.HOMEBREW_TAP_GITHUB_TOKEN }}"  # CRITICAL: explicit token reference
    homepage: "https://feelr.dev"
    description: "Agent-friendly API simplification layer CLI"
    commit_author:
      name: goreleaserbot
      email: bot@feelr.dev

changelog:
  sort: asc
  filters:
    exclude:
      - "^docs:"
      - "^test:"
      - "^ci:"

checksum:
  name_template: checksums.txt
```

Source: [GoReleaser Homebrew Tokens Discussion](https://github.com/orgs/goreleaser/discussions/4926), [GoReleaser Homebrew Formulas](https://goreleaser.com/customization/homebrew_formulas/)

### GoReleaser Local Validation

```bash
# Navigate to project root (where .goreleaser.yaml lives)
cd /home/eternaldays/claudeRepos/feelr

# Step 1: Validate config
goreleaser check
# Should output: config is valid

# Step 2: Test build without publishing
goreleaser release --snapshot --skip=publish --clean
# Creates artifacts in dist/ without uploading

# Step 3: Inspect artifacts
ls dist/
# Should show: feelr_*_linux_amd64.tar.gz, feelr_*_darwin_arm64.tar.gz, etc.
```

Source: [GoReleaser Quick Start](https://goreleaser.com/quick-start/)

### DNS Records to Add in Cloudflare (Pre-Nameserver Switch)

```
# Records needed for feelr.dev zone (add before nameserver change)
# These are placeholder records -- actual targets will be configured in later phases

# Type  | Name          | Content                       | Proxy | Notes
# A     | feelr.dev     | (Azure SWA IP, Phase 14)      | Off   | Apex domain - will be CNAME flattened later
# CNAME | api           | (Workers custom domain auto)   | On    | Auto-created by Workers Custom Domain (Phase 12)
# CNAME | app           | (Azure SWA hostname, Phase 14) | Off   | Dashboard - gray cloud during setup
# CNAME | www           | feelr.dev                      | On    | Redirect www to apex

# Note: Most DNS records will be added in Phases 12 and 14.
# For Phase 11, the zone should be created with minimal records.
# Only add records that currently exist at Namecheap.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| GoReleaser `brews` (Homebrew Formulas) | GoReleaser `homebrew_casks` (Homebrew Casks) | v2.10 (2025) | `brews` deprecated but functional; casks recommended for new configs. Migration is simple rename for basic cases. Not urgent -- `brews` will remain until v3. |
| GoReleaser `--skip-publish` flag | GoReleaser `--skip=publish` flag | v2.0 (2024-05-26) | CLI flag syntax consolidated. Old `--skip-*` flags removed in v2. |
| GoReleaser `folder` key | GoReleaser `directory` key | v2.0 (2024-05-26) | Renamed for consistency across sections. |
| Namecheap BasicDNS | Cloudflare DNS (Free) | N/A (this migration) | Gains: CNAME flattening, Workers integration, auto-SSL, DDoS protection. Loses: nothing meaningful. |

**Deprecated/outdated:**
- GoReleaser `brews` section: Deprecated in v2.10. Still functional, will be removed in v3 (no planned date). The current config uses `brews` and it works fine, but a migration to `homebrew_casks` could be done as part of the audit if desired.

## Identified Issues in Existing Release Pipeline

### Issue 1: Missing Token Reference in brews.repository (CRITICAL)

**File:** `.goreleaser.yaml` line 34-36
**Problem:** The `brews[0].repository` section has no `token` field. GoReleaser defaults to using `GITHUB_TOKEN` which cannot push to the external tap repository.
**Impact:** Release workflow will fail at the Homebrew formula publish step.
**Fix:** Add `token: "{{ .Env.HOMEBREW_TAP_GITHUB_TOKEN }}"` to the repository section.

### Issue 2: Homebrew Tap Repository Does Not Exist (CRITICAL)

**File:** `.goreleaser.yaml` line 35-36
**Problem:** `andrewprograde/homebrew-feelr` returns 404. The repository must exist before GoReleaser can push to it.
**Impact:** Release workflow will fail with 404 error during Homebrew formula publish.
**Fix:** Create the `homebrew-feelr` repository under the correct GitHub owner. Initialize with at least a README.

### Issue 3: Repository Owner Mismatch (MEDIUM)

**File:** `.goreleaser.yaml` line 35
**Problem:** The tap owner is `andrewprograde` but the feelr repo remote is `progradetech/feelr`. Need to confirm which GitHub account/org should own the tap.
**Impact:** Potential PAT permission confusion; formula URLs may not resolve correctly.
**Fix:** Decide canonical owner, update .goreleaser.yaml, and ensure PAT has access to that owner's repos.

### Issue 4: HOMEBREW_TAP_GITHUB_TOKEN Secret May Not Exist (MEDIUM)

**File:** `.github/workflows/release.yml` line 31
**Problem:** The workflow references `${{ secrets.HOMEBREW_TAP_GITHUB_TOKEN }}` but there is no evidence this secret has been created in the repository settings. Since the repo is private and gh CLI is unavailable, this cannot be verified locally.
**Impact:** If the secret doesn't exist, GoReleaser receives an empty string and the tap push fails silently.
**Fix:** Create a Fine-Grained PAT with `contents: write` on the tap repo. Store it as `HOMEBREW_TAP_GITHUB_TOKEN` in the feelr repo settings > Secrets > Actions.

### Issue 5: Deprecated brews Section (LOW)

**File:** `.goreleaser.yaml` lines 32-41
**Problem:** The `brews` section is deprecated since GoReleaser v2.10. It still works but generates deprecation warnings.
**Impact:** No functional impact now. Will break in GoReleaser v3 (unscheduled).
**Fix:** Optionally migrate to `homebrew_casks` section. For CLI tools distributed as pre-compiled binaries, the migration is a simple section rename. This is not urgent.

### Issue 6: Release Pipeline Never Tested (LOW)

**File:** `.github/workflows/release.yml`
**Problem:** The v1.0 tag was created in the same commit batch as the release workflow. It is unclear whether the workflow has ever been triggered and run successfully.
**Impact:** Unknown failures may exist beyond the identified issues.
**Fix:** After fixing Issues 1-4, test with a `v1.0.1` tag or use `goreleaser release --snapshot --clean` locally.

## Open Questions

1. **Which GitHub account/org should own the Homebrew tap?**
   - What we know: .goreleaser.yaml says `andrewprograde`, remote is `progradetech`, user instructions say to use `andrewprograde` for all projects
   - What's unclear: Whether the tap should be under `andrewprograde` (personal) or `progradetech` (org)
   - Recommendation: Use `andrewprograde` as per user instructions. Create `andrewprograde/homebrew-feelr` repo. Ensure the PAT is scoped to that account.

2. **Should brews be migrated to homebrew_casks?**
   - What we know: `brews` is deprecated in v2.10 but functional. `homebrew_casks` is the recommended replacement.
   - What's unclear: Whether there are any behavioral differences for CLI tool distribution
   - Recommendation: Keep `brews` for now -- it works and migration introduces unnecessary risk. Add a TODO comment noting the deprecation. Migrate in a future phase.

3. **Are there existing DNS records at Namecheap that need preservation?**
   - What we know: feelr.dev is registered at Namecheap. Unknown what records (if any) currently exist.
   - What's unclear: Whether email, verification, or other records exist that must be migrated
   - Recommendation: Before starting the DNS transfer, export/screenshot all existing Namecheap DNS records. Recreate them in Cloudflare before switching nameservers.

4. **Has the release.yml workflow ever run?**
   - What we know: It was created in commit 40e778c and the v1.0 tag exists, but it is unclear if the tag push triggered the workflow
   - What's unclear: Whether there are additional issues beyond what static analysis reveals
   - Recommendation: Check GitHub Actions tab for the repo. If no run exists, the first test with a tag push will be the initial validation.

## Sources

### Primary (HIGH confidence)
- [Cloudflare DNS Full Setup - Official Docs](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/) - Nameserver change procedure, DNSSEC requirements
- [Cloudflare Add Site - Official Docs](https://developers.cloudflare.com/fundamentals/manage-domains/add-site/) - Zone onboarding procedure, plan selection, record scanning
- [Cloudflare Workers Custom Domains - Official Docs](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) - Zone requirement for Workers, wrangler.toml config
- [GoReleaser GitHub Actions - Official Docs](https://goreleaser.com/ci/actions/) - Action inputs (version, workdir, args), token permissions
- [GoReleaser Homebrew Formulas - Official Docs](https://goreleaser.com/customization/homebrew_formulas/) - brews config, token override, deprecation notice
- [GoReleaser Deprecations - Official Docs](https://goreleaser.com/deprecations/) - v2 removed keys, brews deprecation timeline
- [GoReleaser Homebrew Casks - Official Docs](https://goreleaser.com/customization/homebrew_casks/) - v2.10+ replacement for brews
- [actions/setup-go - GitHub](https://github.com/actions/setup-go) - go-version-file with subdirectory path support

### Secondary (MEDIUM confidence)
- [GoReleaser Homebrew Tokens Discussion](https://github.com/orgs/goreleaser/discussions/4926) - Token resolution behavior, configuration pattern
- [Namecheap DNSSEC Management](https://www.namecheap.com/support/knowledgebase/article.aspx/9722/2232/managing-dnssec-for-domains-pointed-to-custom-dns/) - DNSSEC toggle location, supported TLDs
- [Namecheap Cloudflare DNS Setup Guide](https://www.namecheap.com/support/knowledgebase/article.aspx/9607/2210/how-to-set-up-dns-records-for-your-domain-in-a-cloudflare-account/) - Custom DNS steps at Namecheap
- [Cloudflare Community: DNS Records Limit](https://community.cloudflare.com/t/dns-records-has-any-limit-on-free-plan/431008) - 200 record limit for new free zones

### Verified via Project Files (HIGH confidence)
- `.goreleaser.yaml` - Current GoReleaser v2 config with brews section (missing token field)
- `.github/workflows/release.yml` - Current release workflow (HOMEBREW_TAP_GITHUB_TOKEN env var present but not referenced in goreleaser config)
- `apps/gateway/wrangler.toml` - Existing Workers config confirming Cloudflare infrastructure
- `cli/go.mod` - Go 1.25.7, Cobra v1.10.2 dependencies
- Git remote: `progradetech/feelr` (mismatch with .goreleaser.yaml owner `andrewprograde`)
- Git tags: `v1.0` exists (single tag)
- `.planning/research/SUMMARY.md` - Prior v1.1 deployment research confirming Cloudflare DNS as sole authority decision

## Metadata

**Confidence breakdown:**
- DNS Zone Setup: HIGH - Well-documented standard procedure verified against official Cloudflare docs
- GoReleaser Audit: HIGH - Issues identified by direct comparison of config files against official documentation and known patterns
- Pitfalls: HIGH - All pitfalls sourced from official docs or verified community discussions with multiple corroborating sources

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (30 days -- stable domain, GoReleaser deprecation timeline is long)
