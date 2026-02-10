# Phase 17: CI/CD & Homebrew Migration - Research

**Researched:** 2026-02-10
**Domain:** Cloudflare Workers CI/CD token permissions, GoReleaser Homebrew tap configuration, Homebrew third-party tap deprecation/migration
**Confidence:** HIGH

## Summary

Phase 17 covers three independent operational tasks: (1) fixing the Cloudflare API token used in CI so `wrangler deploy --env staging` succeeds without KV permission errors, (2) updating the GoReleaser config to push the Homebrew formula to `progradetech/homebrew-feelr` instead of `andrewprograde/homebrew-feelr`, and (3) placing a deprecation formula in the old `andrewprograde/homebrew-feelr` tap that warns users to switch. None of these tasks require code changes to the application itself -- they are configuration, infrastructure, and repository management tasks.

The critical finding is that **Homebrew has no built-in cross-tap redirect for third-party taps**. The `tap_migrations.json` mechanism only works within the Homebrew organization. For third-party taps, the standard pattern is to replace the old formula with a deprecation formula that uses `opoo` (warning output) in the `def caveats` or `def install` block to print migration instructions, while still installing the binary so users are not left broken. The old tap must remain functional for at least 3 months to give users time to migrate.

The Cloudflare token fix is a dashboard-only change (no code). The GoReleaser change is a one-line config change in `.goreleaser.yaml`. The Homebrew deprecation formula requires creating `progradetech/homebrew-feelr` as a new repository, generating a new GitHub PAT with write access to it, and manually writing a deprecation formula in the old `andrewprograde/homebrew-feelr` repo. The `HOMEBREW_TAP_GITHUB_TOKEN` secret in GitHub Actions must be updated before the first release that targets the new tap.

**Primary recommendation:** Execute in strict order -- (1) fix CF token permissions, (2) create new tap repo + PAT + update secrets, (3) change GoReleaser config and push a release, (4) write deprecation formula in old tap. Never change the GoReleaser owner before the new tap repo and PAT are ready.

## Standard Stack

### Core

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| GoReleaser | v2 (via goreleaser/goreleaser-action@v6) | CLI binary release + Homebrew formula generation | Already in use. The `brews` section auto-generates and pushes a Ruby formula to the configured tap repository. |
| Wrangler | 4.63.0 (via cloudflare/wrangler-action@v3) | Cloudflare Workers deployment | Already in use. `wrangler deploy --env staging` is the staging deploy command in `gateway.yml` workflow. |
| GitHub Actions | N/A (hosted) | CI/CD platform | Already in use. Five workflow files exist: `ci.yml`, `gateway.yml`, `dashboard.yml`, `release.yml`, `docs.yml`. |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| GitHub Fine-Grained PAT | N/A | Cross-org repository write access | Required for GoReleaser to push formula commits to `progradetech/homebrew-feelr`. Must have `Contents: Read and write` and `Metadata: Read` permissions scoped to the single repo. |
| Cloudflare API Token | N/A | Workers deployment authentication | Existing token in `CLOUDFLARE_API_TOKEN` secret. Needs `Workers KV Storage: Edit` permission added. |
| Homebrew Ruby Formula | N/A | Package distribution for macOS/Linux CLI | GoReleaser generates `Formula/feelr.rb` in the tap repo. Deprecation formula is hand-written Ruby. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Keeping `brews` (deprecated) | Migrate to `homebrew_casks` | `brews` is deprecated since GoReleaser v2.10 but still functional. Migrating to `homebrew_casks` simultaneously with changing the tap owner is a double variable change. Change one thing at a time. Migrate format in a future maintenance task. |
| Fine-Grained PAT | Classic PAT with `repo` scope | Classic PATs grant access to ALL repos in an org. Fine-grained PATs can be scoped to a single repository. Use fine-grained for least-privilege. |
| Manual deprecation formula | `tap_migrations.json` | `tap_migrations.json` only works within the Homebrew organization for core-to-tap migrations. It does NOT support third-party tap to third-party tap redirects. A deprecation formula with `opoo` warnings is the standard third-party pattern. |

## Architecture Patterns

### Pattern 1: Cloudflare API Token Permission Fix (Manual, No Code)

**What:** Add `Workers KV Storage: Edit` permission to the existing Cloudflare API token used in CI/CD.

**When to use:** When `wrangler deploy` fails with error code 10023 (`workers.api.error.unauthorized`) and the Worker has KV namespace bindings.

**Procedure:**
1. Go to Cloudflare Dashboard > My Profile > API Tokens
2. Find the existing token used for CI deployments
3. Click "Edit" (or recreate if editing is not available)
4. Ensure ALL of these permissions are present:

| Permission | Scope | Access |
|------------|-------|--------|
| Workers Scripts | Account | Edit |
| Workers KV Storage | Account | Edit |
| D1 | Account | Edit |
| Account Settings | Account | Read |
| Workers Routes | Zone (feelr.dev) | Edit |

5. Save the token
6. If the token value changed, update `CLOUDFLARE_API_TOKEN` in GitHub repo secrets

**Verification:** Push a change to `apps/gateway/` on a PR or main branch and confirm `gateway.yml` staging deploy succeeds.

### Pattern 2: GoReleaser Tap Owner Change

**What:** Change the `repository.owner` field in `.goreleaser.yaml` from `andrewprograde` to `progradetech`.

**When to use:** When migrating a Homebrew tap from one GitHub org to another.

**Current config:**
```yaml
brews:
  - name: feelr
    repository:
      owner: andrewprograde          # OLD
      name: homebrew-feelr
      token: "{{ .Env.HOMEBREW_TAP_GITHUB_TOKEN }}"
    homepage: "https://feelr.dev"
    description: "Agent-friendly API simplification layer CLI"
    commit_author:
      name: goreleaserbot
      email: bot@feelr.dev
```

**New config:**
```yaml
brews:
  - name: feelr
    repository:
      owner: progradetech             # NEW
      name: homebrew-feelr
      token: "{{ .Env.HOMEBREW_TAP_GITHUB_TOKEN }}"
    homepage: "https://feelr.dev"
    description: "Agent-friendly API simplification layer CLI"
    commit_author:
      name: goreleaserbot
      email: bot@feelr.dev
```

**Key constraint:** The `HOMEBREW_TAP_GITHUB_TOKEN` secret MUST have write access to `progradetech/homebrew-feelr` BEFORE this config change is released. GoReleaser's Homebrew push failure is **non-fatal** -- the GitHub Release will succeed but the formula will not be updated, and the workflow will show green. This is a silent failure.

### Pattern 3: Homebrew Deprecation Formula for Old Tap

**What:** Replace the formula in `andrewprograde/homebrew-feelr` with one that prints deprecation warnings while still installing the binary (so existing users are not broken).

**When to use:** After the new tap is confirmed working with at least one successful release.

**Deprecation formula structure:**
```ruby
# Formula/feelr.rb in andrewprograde/homebrew-feelr
class Feelr < Formula
  desc "Agent-friendly API simplification layer CLI (DEPRECATED TAP)"
  homepage "https://feelr.dev"
  # Point to the same release assets as the new tap
  # These URLs are filled by GoReleaser in the new tap, but here
  # we hardcode to the latest release so old users get SOMETHING
  version "LATEST_VERSION"

  on_macos do
    on_arm do
      url "https://github.com/progradetech/feelr/releases/download/vLATEST/feelr_LATEST_darwin_arm64.tar.gz"
      sha256 "SHA256_HERE"
    end
    on_intel do
      url "https://github.com/progradetech/feelr/releases/download/vLATEST/feelr_LATEST_darwin_amd64.tar.gz"
      sha256 "SHA256_HERE"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/progradetech/feelr/releases/download/vLATEST/feelr_LATEST_linux_arm64.tar.gz"
      sha256 "SHA256_HERE"
    end
    on_intel do
      url "https://github.com/progradetech/feelr/releases/download/vLATEST/feelr_LATEST_linux_amd64.tar.gz"
      sha256 "SHA256_HERE"
    end
  end

  def install
    bin.install "feelr"
  end

  def caveats
    <<~EOS
      WARNING: This tap (andrewprograde/feelr) is deprecated.

      Please switch to the new tap:

        brew untap andrewprograde/feelr
        brew install progradetech/feelr/feelr

      Future releases will only be published to progradetech/feelr.
    EOS
  end
end
```

**Why `caveats` instead of `opoo` in `install`:** The `caveats` method is the official Homebrew mechanism for post-install messages. It is displayed after every `brew install` and `brew upgrade`. Using `opoo` in `def install` works but is less idiomatic. The `caveats` block is more visible because Homebrew formats it with a distinctive "==> Caveats" header.

**Alternative: Minimal deprecation stub (simpler but less helpful):**
```ruby
class Feelr < Formula
  desc "DEPRECATED: Use brew install progradetech/feelr/feelr"
  homepage "https://feelr.dev"
  url "https://github.com/progradetech/feelr/releases/download/vLATEST/feelr_LATEST_darwin_arm64.tar.gz"
  sha256 "SHA256_HERE"
  version "LATEST_VERSION"

  deprecate! date: "2026-02-10", because: "tap moved to progradetech/feelr"

  def install
    bin.install "feelr"
  end

  def caveats
    <<~EOS
      This tap is deprecated. Switch to the new tap:

        brew untap andrewprograde/feelr
        brew install progradetech/feelr/feelr
    EOS
  end
end
```

**Recommendation:** Use the `deprecate!` approach combined with `caveats`. The `deprecate!` method is built into Homebrew's Formula class and displays a standardized deprecation warning. The `caveats` block provides actionable migration steps. Together, they give users both the warning and the fix.

### Pattern 4: Fine-Grained PAT Creation for New Tap

**What:** Create a GitHub Fine-Grained Personal Access Token scoped to `progradetech/homebrew-feelr` with minimal permissions.

**Procedure:**
1. Go to GitHub > Settings > Developer Settings > Personal Access Tokens > Fine-grained tokens
2. Token name: `goreleaser-homebrew-tap`
3. Resource owner: `progradetech`
4. Repository access: Only select repositories > `progradetech/homebrew-feelr`
5. Permissions:
   - Contents: Read and write (GoReleaser needs to push formula commits)
   - Metadata: Read (required, auto-selected)
6. Generate token
7. Update `HOMEBREW_TAP_GITHUB_TOKEN` secret in `progradetech/feelr` repository settings

**Key constraint:** Fine-grained PATs for organization repositories require the organization to have fine-grained PATs enabled in Settings > Personal Access Tokens > Settings. If the org has not enabled this, a classic PAT with `repo` scope scoped to the org can be used instead.

### Anti-Patterns to Avoid

- **Changing GoReleaser config before the new tap repo exists:** GoReleaser will try to push to a non-existent repo. The push fails silently (non-fatal). The release goes out without a formula update.
- **Changing GoReleaser config before the PAT is updated:** Same silent failure. GoReleaser pushes to the new repo but the old PAT has no access.
- **Deleting the old tap formula immediately:** Existing users who have `andrewprograde/feelr` tapped will get "formula not found" errors on `brew upgrade`. Keep the deprecation formula for at least 3 months.
- **Migrating `brews` to `homebrew_casks` at the same time:** Two-variable change. If something breaks, you cannot tell if it was the owner change or the format change. Change one at a time.
- **Using `tap_migrations.json` for cross-tap redirect:** This mechanism is for Homebrew core migrations only. Third-party taps cannot redirect to other third-party taps via `tap_migrations.json`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Homebrew formula generation | Custom Ruby formula template | GoReleaser `brews` section | GoReleaser auto-generates the formula with correct URLs, checksums, and platform detection from the release artifacts |
| CI/CD deployment orchestration | Custom shell scripts for wrangler deploy | `cloudflare/wrangler-action@v3` with existing workflow | The action handles authentication, wrangler version management, and working directory setup |
| Cross-org formula push | Manual git clone/push of tap repo in CI | GoReleaser `repository.token` field | GoReleaser handles authentication, commit authoring, and push to the configured tap repository |
| Homebrew deprecation messaging | Custom scripts or README-only notice | Homebrew's built-in `deprecate!` + `caveats` methods | These are the standard Homebrew mechanisms. Users see messages during `brew install` and `brew upgrade`. |

**Key insight:** Every task in this phase uses existing tooling with configuration changes only. No custom code needs to be written. The risk is operational (wrong order of operations, missing permissions) not technical.

## Common Pitfalls

### Pitfall 1: GoReleaser Homebrew Push Fails Silently

**What goes wrong:** GoReleaser creates the GitHub Release with binaries and checksums, but the Homebrew formula is never pushed to the tap repository. The workflow shows green because Homebrew push failure is non-fatal in GoReleaser.
**Why it happens:** The `HOMEBREW_TAP_GITHUB_TOKEN` secret does not have write access to the target repository (`progradetech/homebrew-feelr`). This is the most common failure mode when changing tap owners.
**How to avoid:** Before merging the `.goreleaser.yaml` change, verify: (1) `progradetech/homebrew-feelr` repo exists, (2) the PAT in `HOMEBREW_TAP_GITHUB_TOKEN` has `Contents: Read and write` on that repo, (3) test with `goreleaser release --snapshot --clean` locally if possible.
**Warning signs:** After a release, check `progradetech/homebrew-feelr` for a new commit. If no commit appears within a few minutes, the push failed.

### Pitfall 2: Cloudflare Token Missing KV Write -- Error 10023

**What goes wrong:** `wrangler deploy --env staging` fails with `workers.api.error.unauthorized [code: 10023]`. The error message is generic and does not specify which permission is missing.
**Why it happens:** Cloudflare's "Edit Cloudflare Workers" token template does NOT include KV Storage permissions. The gateway's `wrangler.toml` has `[[env.staging.kv_namespaces]]` binding `AUTH_KV`, which requires `Workers KV Storage: Edit`.
**How to avoid:** Edit the API token in Cloudflare Dashboard to add `Workers KV Storage: Edit`. Also verify `D1: Edit` is present (the gateway has D1 bindings too).
**Warning signs:** CI logs contain `10023` or `unauthorized` during the deploy step (not the build step).

### Pitfall 3: Old Tap Users Stranded on Stale Version

**What goes wrong:** Users who previously ran `brew tap andrewprograde/feelr` continue fetching from the old tap. After the GoReleaser change, the old tap never receives formula updates. Users are stuck on whatever version was last published there.
**Why it happens:** Homebrew third-party taps have no cross-tap redirect mechanism. Each tap is an independent git repository. `brew upgrade` only checks taps the user has locally tapped.
**How to avoid:** Write a deprecation formula in the old tap that (1) still installs the latest binary (manually maintained), (2) prints migration instructions via `caveats`, and (3) uses `deprecate!` for the standardized warning. Keep the old tap active for at least 3 months.
**Warning signs:** Users report outdated versions or no updates when running `brew upgrade feelr`.

### Pitfall 4: Fine-Grained PAT Blocked by Organization Policy

**What goes wrong:** Creating a fine-grained PAT scoped to `progradetech/homebrew-feelr` fails because the organization has not enabled fine-grained PATs.
**Why it happens:** GitHub organizations must explicitly allow fine-grained PATs in Settings > Personal Access Tokens > Settings. The default may be "Do not allow".
**How to avoid:** Before creating the PAT, go to `progradetech` org settings and enable fine-grained PATs. If this is not possible (org policy), use a classic PAT with `repo` scope instead.
**Warning signs:** The PAT creation form does not show `progradetech` in the resource owner dropdown.

### Pitfall 5: GoReleaser Tap Directory Mismatch

**What goes wrong:** GoReleaser pushes the formula to the wrong path in the tap repository. By default, GoReleaser places formulas in `Formula/` directory. If the repository does not have this directory structure, the formula may end up in the root or in a mismatched path.
**Why it happens:** The `directory` field in the `brews` config defaults to `Formula`. If the new tap repo is initialized empty, GoReleaser will create the `Formula/` directory automatically. But if there is an existing conflicting structure, it may fail.
**How to avoid:** Initialize `progradetech/homebrew-feelr` as an empty repo with just a README. GoReleaser will create `Formula/feelr.rb` on the first release push.
**Warning signs:** After release, check that `progradetech/homebrew-feelr` has `Formula/feelr.rb` (not `feelr.rb` in root).

### Pitfall 6: Release Ordering -- Config Change Before Infrastructure

**What goes wrong:** The `.goreleaser.yaml` change is merged to main, and then a `v*` tag is pushed before the new tap repo exists or the PAT is updated. The release goes out but the Homebrew formula is not published anywhere -- not to the old tap (config changed) and not to the new tap (does not exist or no access).
**Why it happens:** Code changes are easy and fast. Infrastructure changes (create repo, generate PAT, update secrets) are manual and easy to forget.
**How to avoid:** Execute in strict order:
1. Create `progradetech/homebrew-feelr` repository
2. Create fine-grained PAT with write access to it
3. Update `HOMEBREW_TAP_GITHUB_TOKEN` secret in `progradetech/feelr`
4. THEN merge the `.goreleaser.yaml` owner change
5. THEN push a release tag
6. Verify formula appears in new tap
7. THEN write deprecation formula in old tap
**Warning signs:** Missing any of steps 1-3 before step 5.

## Code Examples

### GoReleaser Config Change (verified from project file)

```yaml
# .goreleaser.yaml - the ONLY code change in this phase
# Source: /home/eternaldays/claudeRepos/feelr/.goreleaser.yaml

# Before:
brews:
  - name: feelr
    repository:
      owner: andrewprograde
      name: homebrew-feelr
      token: "{{ .Env.HOMEBREW_TAP_GITHUB_TOKEN }}"

# After:
brews:
  - name: feelr
    repository:
      owner: progradetech
      name: homebrew-feelr
      token: "{{ .Env.HOMEBREW_TAP_GITHUB_TOKEN }}"
```

### Deprecation Formula (Homebrew Ruby)

```ruby
# Formula/feelr.rb in andrewprograde/homebrew-feelr
# Source: Homebrew deprecate! API docs + caveats pattern
# https://docs.brew.sh/Deprecating-Disabling-and-Removing-Formulae

class Feelr < Formula
  desc "Agent-friendly API simplification layer CLI"
  homepage "https://feelr.dev"

  # Pin to the last version published to this tap.
  # Update version, URLs, and checksums from the GitHub release page:
  # https://github.com/progradetech/feelr/releases
  version "VERSION_AT_MIGRATION"

  on_macos do
    on_arm do
      url "https://github.com/progradetech/feelr/releases/download/vVERSION/feelr_VERSION_darwin_arm64.tar.gz"
      sha256 "SHA256"
    end
    on_intel do
      url "https://github.com/progradetech/feelr/releases/download/vVERSION/feelr_VERSION_darwin_amd64.tar.gz"
      sha256 "SHA256"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/progradetech/feelr/releases/download/vVERSION/feelr_VERSION_linux_arm64.tar.gz"
      sha256 "SHA256"
    end
    on_intel do
      url "https://github.com/progradetech/feelr/releases/download/vVERSION/feelr_VERSION_linux_amd64.tar.gz"
      sha256 "SHA256"
    end
  end

  deprecate! date: "2026-02-10", because: "tap moved to progradetech/feelr"

  def install
    bin.install "feelr"
  end

  def caveats
    <<~EOS
      This tap (andrewprograde/feelr) is deprecated.

      To switch to the new tap, run:

        brew untap andrewprograde/feelr
        brew install progradetech/feelr/feelr

      Future releases will only be published to progradetech/feelr.
    EOS
  end
end
```

### Verifying the New Tap Works

```bash
# After release is published and formula pushed:
# On a clean machine or after removing existing tap:
brew tap progradetech/feelr
brew install progradetech/feelr/feelr
feelr --version
# Should output the released version

# Verify old tap shows deprecation:
brew tap andrewprograde/feelr
brew install andrewprograde/feelr/feelr
# Should show deprecation warning in caveats
```

### GitHub Actions Secret Verification

```bash
# There is no CLI way to verify secret values, but you can check
# which secrets exist via the GitHub API:
gh api repos/progradetech/feelr/actions/secrets --jq '.secrets[].name'
# Should include: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, HOMEBREW_TAP_GITHUB_TOKEN

# Verify CF token works by running a manual staging deploy:
# In GitHub Actions, trigger gateway.yml manually or push to apps/gateway/
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| GoReleaser `brews` section | GoReleaser `homebrew_casks` section | GoReleaser v2.10 (June 2025) | `brews` deprecated but functional. Migration optional until v3 announcement. |
| Classic GitHub PATs with broad `repo` scope | Fine-grained PATs with per-repo permissions | GitHub 2023+ (GA 2024) | Fine-grained PATs are the recommended approach for least-privilege access. |
| `wrangler publish` | `wrangler deploy` | Wrangler 3.x (2023) | `publish` is deprecated. All workflows already use `deploy`. |
| Cloudflare "Edit Workers" template includes all perms | Each binding type requires explicit permission | Ongoing | KV Storage, D1, R2 each need separate permission grants. The default template is insufficient for Workers with multiple binding types. |

**Deprecated/outdated:**
- GoReleaser `brews` section: Deprecated since v2.10, still functional. Keep using for now (per requirements: "Don't change two things at once").
- Classic PATs: Still work but fine-grained PATs are preferred for new tokens.

## Open Questions

1. **Does `progradetech/homebrew-feelr` already exist?**
   - What we know: Could not verify via `gh` CLI (not authenticated). The GoReleaser config currently points to `andrewprograde/homebrew-feelr`.
   - What's unclear: Whether the repo has already been created or needs to be created as part of this phase.
   - Recommendation: Plan should include a task to create the repo if it does not exist. GoReleaser will create the `Formula/` directory on first push.

2. **Does `andrewprograde/homebrew-feelr` have existing users?**
   - What we know: GoReleaser has been configured to push there. The existing `release.yml` workflow uses `HOMEBREW_TAP_GITHUB_TOKEN`. If any releases have been tagged, the formula exists.
   - What's unclear: How many users have tapped this repo. Homebrew does not provide tap analytics for third-party taps.
   - Recommendation: Assume users exist and provide the deprecation formula regardless. The cost of the deprecation formula is trivial; the cost of stranding users is significant.

3. **Has the `progradetech` org enabled fine-grained PATs?**
   - What we know: Fine-grained PATs require org-level enablement.
   - What's unclear: The current org settings.
   - Recommendation: Plan should include checking org settings as the first step. Fall back to classic PAT if fine-grained is not available.

4. **What is the current Cloudflare API token's exact permission set?**
   - What we know: The staging deploy is expected to fail with KV permission errors (per requirements). The token needs `Workers KV Storage: Edit` added.
   - What's unclear: Whether other permissions (D1, Workers Routes) are also missing.
   - Recommendation: When editing the token, verify ALL required permissions are present (see Pattern 1 table above), not just KV.

## Sources

### Primary (HIGH confidence)
- [GoReleaser Homebrew Formulas docs](https://goreleaser.com/customization/homebrew_formulas/) - `brews` configuration schema, repository owner/name/token fields, Formula directory structure, deprecation notice
- [GoReleaser Repository config](https://goreleaser.com/includes/repository/) - Token configuration, cross-org publishing, branch field
- [GoReleaser v2.10 announcement](https://goreleaser.com/blog/goreleaser-v2.10/) - `brews` deprecated in favor of `homebrew_casks`
- [Cloudflare workers-sdk#5649](https://github.com/cloudflare/workers-sdk/issues/5649) - Error 10023 confirmed as missing KV Storage Edit permission
- [Cloudflare API Token Permissions](https://developers.cloudflare.com/fundamentals/api/reference/permissions/) - Workers Scripts, KV Storage, D1 permission names and scopes
- [Homebrew Deprecating/Disabling Formulae](https://docs.brew.sh/Deprecating-Disabling-and-Removing-Formulae) - `deprecate!` and `disable!` methods, date/because syntax
- [Homebrew Taps docs](https://docs.brew.sh/Taps) - Third-party tap structure, naming conventions, no cross-tap redirect for third-party taps
- [GitHub Fine-Grained PAT docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) - Creating fine-grained tokens, repository scope, permissions

### Secondary (MEDIUM confidence)
- [Homebrew Discussion #1253](https://github.com/orgs/Homebrew/discussions/1253) - Deprecating between taps; points to Migrating-A-Formula-To-A-Tap doc (which only covers Homebrew-internal migrations)
- [Homebrew Migrating a Formula to a Tap](https://docs.brew.sh/Migrating-A-Formula-To-A-Tap) - Confirmed this guide is for Homebrew org internal migrations only, not third-party to third-party
- [buildpacks/homebrew-tap#10](https://github.com/buildpacks/homebrew-tap/issues/10) - Real-world example of tap migration messaging using `ohai`, `opoo`, `odie`
- [goreleaser/homebrew-tap](https://github.com/goreleaser/homebrew-tap) - Reference tap structure showing `Formula/`, `Casks/`, and `tap_migrations.json`
- [Homebrew Formula Ruby API](https://docs.brew.sh/rubydoc/Formula) - `deprecate!`, `caveats`, `opoo` method references

### Verified via Project Files (HIGH confidence)
- `.goreleaser.yaml` - Current `brews` config with `andrewprograde/homebrew-feelr`, token template
- `.github/workflows/release.yml` - GoReleaser workflow using `HOMEBREW_TAP_GITHUB_TOKEN` secret
- `.github/workflows/gateway.yml` - Staging/production deploy using `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
- `.github/workflows/ci.yml` - PR checks including staging deploy with same CF token
- `apps/gateway/wrangler.toml` - KV namespace binding (`AUTH_KV`), D1 binding (`USAGE_DB`), Durable Objects, rate limiters
- `.planning/phases/13-gateway-cicd-pipeline/13-RESEARCH.md` - Prior CI/CD research with token permission details
- `.planning/research/STACK.md` - Milestone-level research confirming one-line GoReleaser change and CF token fix
- `.planning/research/PITFALLS.md` - Pitfalls 3, 4, 8, 9 directly relevant to this phase

## Metadata

**Confidence breakdown:**
- CF token fix: HIGH - Error 10023 is well-documented, permission requirement verified via Cloudflare docs and GitHub issue
- GoReleaser config: HIGH - One-line change verified against project file and GoReleaser docs
- PAT creation: HIGH - GitHub docs clearly document fine-grained PAT creation
- Homebrew deprecation: MEDIUM - Third-party tap deprecation is not formally documented by Homebrew. Pattern derived from Homebrew API docs, community examples, and elimination of non-working alternatives (tap_migrations.json). The `deprecate!` + `caveats` approach is the best available pattern.
- Execution ordering: HIGH - Derived from understanding of GoReleaser's non-fatal Homebrew push failure and dependency chain

**Research date:** 2026-02-10
**Valid until:** 2026-03-12 (30 days -- all tools and APIs are stable; GoReleaser v3 not announced)
