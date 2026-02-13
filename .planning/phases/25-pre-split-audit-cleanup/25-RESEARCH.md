# Phase 25: Pre-Split Audit & Cleanup - Research

**Researched:** 2026-02-13
**Domain:** Git secret scanning, credential audit, .gitignore hardening, sensitive file classification
**Confidence:** HIGH

## Summary

Phase 25 is a security audit gate that must pass before the Feelr monorepo can be split into a public open-source repo and a private cloud overlay. The codebase is currently private at `progradetech/feelr` with 558 tracked files (246 of which are `.planning/` internal docs) across 366 commits. The public repo will use a **fresh snapshot** (no git history), which eliminates the most dangerous vector -- secrets leaked in historical commits. This narrows the audit scope significantly: we only need to verify the **current HEAD snapshot** is clean, not the full 366-commit history. However, the git history must still be audited to understand what secrets ever existed and ensure they are rotated.

The codebase is in reasonable shape for going public. Key findings: (1) `self-host/.env` exists on disk with test credentials (`test123`/`test456`) but is NOT tracked in git and never has been, (2) the root `.gitignore` has `.env` and `.env.*` patterns that work but lacks the `**/.env` deep-match pattern required by success criteria, (3) `docs/deployment/SECRETS-INVENTORY.md` is already tracked and contains detailed metadata about every secret -- but it documents rotation procedures for production infrastructure that should not be in a public repo, (4) `apps/gateway/wrangler.toml` contains Cloudflare KV namespace IDs and D1 database IDs, which are safe to expose publicly per Cloudflare's documentation, (5) `.planning/` contains 246 files of internal planning docs that should not be in the public repo, and (6) `feelr-strategy.md` is a pre-build strategy document tracked in git that contains competitive analysis and pricing strategy.

**Primary recommendation:** Use Gitleaks for the scanning tool (fast, lightweight, well-suited for CI integration). Structure the work as: (1) Run full Gitleaks scan on HEAD + git history audit for secret patterns, (2) Fix `.gitignore` and classify all tracked files into public/private categories, (3) Create secrets inventory with rotation/exclude/safe decisions, (4) Final Gitleaks validation scan producing zero findings.

## Standard Stack

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Gitleaks | 8.24+ | Secret scanning (git history + directory) | 19K+ GitHub stars, MIT licensed, fast Go binary, supports both git history and directory scanning, SARIF/JSON output |
| git | (system) | History audit via `git log -p`, `git ls-files` | Native git commands for tracking audits |

### Supporting
| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| TruffleHog | v3 | Secondary validation scanner | Optional cross-validation after Gitleaks if extra confidence needed; more thorough entropy analysis but slower |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Gitleaks | TruffleHog | TruffleHog has 800+ detectors with active verification but is significantly slower and more resource-intensive. Gitleaks is faster and simpler for CI integration. For a fresh-snapshot public repo (no history to scan), Gitleaks is sufficient. |
| Gitleaks | GitHub Secret Scanning | GitHub's built-in scanning only works after push to GitHub. We need pre-push validation. Gitleaks runs locally. |

**Installation:**
```bash
# macOS
brew install gitleaks

# Linux (Go install)
go install github.com/gitleaks/gitleaks/v8@latest

# Docker
docker pull ghcr.io/gitleaks/gitleaks:latest
```

## Architecture Patterns

### Audit Workflow Structure
```
Phase 25 Workflow:
├── Step 1: Historical Audit          # git log analysis + Gitleaks full scan
│   ├── git log --all -p -- '*.env*'  # Check env file history
│   ├── gitleaks git -v .             # Scan full git history
│   └── Manual review of findings     # Classify each finding
├── Step 2: Gitignore Hardening       # Fix patterns + verify
│   ├── Add **/.env to .gitignore     # Deep-match pattern
│   ├── git ls-files | grep '\.env'   # Verify zero results
│   └── git check-ignore tests        # Verify patterns work
├── Step 3: File Classification       # Public vs private
│   ├── .planning/ → EXCLUDE          # Internal planning docs
│   ├── docs/deployment/ → DECIDE     # Some OK, some not
│   ├── feelr-strategy.md → EXCLUDE   # Competitive strategy
│   └── Source code → INCLUDE         # Apps, connectors, CLI
└── Step 4: Final Validation          # Clean scan
    ├── gitleaks dir -v .             # Directory scan of snapshot
    └── Report generation             # Zero findings required
```

### Pattern 1: Gitleaks Configuration File
**What:** Custom `.gitleaks.toml` to handle expected patterns and reduce false positives
**When to use:** When the codebase has known non-secret patterns that match secret detectors (like example tokens in docs)

```toml
# .gitleaks.toml - Feelr-specific Gitleaks configuration
[extend]
useDefault = true

# Allowlist for known non-secrets
[[allowlists]]
description = "Documentation example tokens (ghp_..., sk_test_..., xoxb-...)"
paths = [
  '''apps/docs/''',
  '''self-host/env\.template$''',
  '''connectors/.*/src/__tests__/''',
  '''apps/gateway/src/__tests__/''',
  '''\.planning/''',
  '''feelr-strategy\.md$''',
  '''README\.md$''',
  '''CONTRIBUTING\.md$''',
  '''cli/cmd/auth\.go$''',
  '''cli/internal/auth/providers\.go$''',
]
regexTarget = "line"
regexes = [
  '''ghp_\.\.\.''',
  '''ghp_your_''',
  '''ghp_xxxx''',
  '''sk_test_your_''',
  '''sk_test_XXXX''',
  '''sk_live_\*''',
  '''sk_test_\*''',
  '''xoxb-\*''',
  '''xoxp-\*''',
  '''ghp_test_token''',
  '''ghp_abc123def456''',
  '''xoxb-slack-token''',
  '''sk_test_stripe''',
  '''test123''',
  '''test456''',
]
```

### Pattern 2: File Classification Matrix
**What:** Categorize every file/directory for public vs private inclusion
**When to use:** Before creating the public repo snapshot

| Path | Decision | Reason |
|------|----------|--------|
| `apps/` | PUBLIC | Application source code (gateway, dashboard, docs) |
| `cli/` | PUBLIC | Go CLI source code |
| `connectors/` | PUBLIC | Connector source code + template |
| `packages/` | PUBLIC | Shared packages (tsconfig, etc.) |
| `chains/` | PUBLIC | Example composable action chains |
| `self-host/` (minus `.env`) | PUBLIC | Self-hosting config + Docker |
| `scripts/` | PUBLIC | Build/deploy scripts |
| `.github/workflows/` | PARTIAL | CI workflows public, deploy workflows move to cloud |
| `.goreleaser.yaml` | PUBLIC | CLI build configuration |
| `README.md` | PUBLIC | Project readme |
| `CONTRIBUTING.md` | PUBLIC | Contribution guide |
| `LICENSE` | PUBLIC | MIT license |
| `.gitignore` | PUBLIC | Git ignore rules |
| `turbo.json` | PUBLIC | Turborepo config |
| `pnpm-workspace.yaml` | PUBLIC | Workspace config |
| `package.json` | PUBLIC | Root package.json |
| `tsconfig.base.json` | PUBLIC | Shared TypeScript config |
| `apps/gateway/wrangler.toml` | PUBLIC | KV/D1 IDs are safe per Cloudflare docs |
| `.planning/` | EXCLUDE | 246 internal planning docs (phases, research, milestones) |
| `feelr-strategy.md` | EXCLUDE | Competitive strategy, pricing, go-to-market |
| `docs/deployment/SECRETS-INVENTORY.md` | EXCLUDE | Production credential metadata + rotation procedures |
| `docs/deployment/RUNBOOK.md` | EXCLUDE | Production deployment procedures with infrastructure details |
| `assets/` | DECIDE | Logo SVGs (currently untracked -- decide if public) |

### Pattern 3: Secrets Inventory Document Format
**What:** Structured inventory of every credential with disposition decision
**When to use:** Required by AUDIT-03 success criteria

```markdown
# Secrets Inventory - Public Release Audit

| Secret | Location | Current State | Decision | Action Required |
|--------|----------|---------------|----------|-----------------|
| CLOUDFLARE_API_TOKEN | GitHub Actions secret | Active | ROTATE | Rotate after public repo created |
| KV namespace ID (staging) | wrangler.toml | Active | SAFE | Cloudflare IDs are public-safe |
| D1 database ID (staging) | wrangler.toml | Active | SAFE | Cloudflare IDs are public-safe |
| ... | ... | ... | ... | ... |
```

### Anti-Patterns to Avoid
- **Scanning only the working directory, not git history:** Even though the public repo uses a fresh snapshot, the private repo's history must still be audited to know which secrets to rotate before going public. Someone who previously had access to the private repo retains knowledge of any secrets in history.
- **Relying solely on `.gitignore` for secret exclusion:** `.gitignore` prevents tracking NEW files but does nothing for already-tracked files. Must use `git rm --cached` for any tracked secret files (currently not an issue since `self-host/.env` was never tracked).
- **Suppressing Gitleaks findings without documenting why:** Every allowlisted pattern must have a documented reason. Use `.gitleaks.toml` allowlists, not `--baseline-path` which hides findings silently.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Secret detection | Custom regex scripts | Gitleaks | 150+ built-in detectors covering GitHub tokens, Stripe keys, AWS keys, generic API keys, etc. Maintained by security community. |
| Git history analysis | Manual `git log` parsing | Gitleaks `git` subcommand | Gitleaks walks the full commit graph including branches and uses `git log -p` internally with optimized pattern matching |
| Report generation | Custom reporting | Gitleaks `--report-format json --report-path` | Produces structured JSON/SARIF reports consumable by CI tools |
| Entropy-based detection | Custom entropy calculator | Gitleaks built-in entropy rules | Already tuned thresholds for different secret types |

**Key insight:** The Gitleaks default ruleset already covers every secret pattern in this codebase (GitHub PATs `ghp_*`, Slack tokens `xoxb-*`, Stripe keys `sk_*`, generic high-entropy strings). Custom rules are only needed for allowlisting known false positives, not for detection.

## Common Pitfalls

### Pitfall 1: False Positives from Documentation Examples
**What goes wrong:** Gitleaks flags example token patterns in documentation (`ghp_your_pat_here`, `sk_test_your_stripe_key`) as real secrets. Developers suppress all findings to get a clean scan, missing real secrets.
**Why it happens:** The codebase has extensive documentation with realistic-looking token examples in: `apps/docs/app/docs/connectors/*/page.mdx`, `self-host/env.template`, `README.md`, `cli/cmd/auth.go`, and test files.
**How to avoid:** Create a `.gitleaks.toml` allowlist with specific path + regex combinations for known documentation patterns. Never use a global allowlist that suppresses an entire rule category. Review every finding individually before allowlisting.
**Warning signs:** A Gitleaks scan that produces zero findings on first run with no configuration -- this means detection is broken, not that the repo is clean. Expect 10-30 initial findings from this codebase given the documentation examples.

### Pitfall 2: Forgetting `.planning/` Contains Infrastructure Details
**What goes wrong:** `.planning/` is treated as just "documentation" and included in the public repo. It contains 246 files including: Cloudflare KV/D1 IDs in verification summaries, internal deployment procedures, competitive strategy analysis, pricing models, and phase-by-phase implementation details that reveal the full product roadmap.
**Why it happens:** `.planning/` is seen as development documentation that demonstrates transparency. However, it contains files like phase verification summaries that reference actual infrastructure IDs, internal research docs with competitive analysis, and detailed cost breakdowns.
**How to avoid:** Exclude the entire `.planning/` directory from the public repo snapshot. Add `.planning/` to the public repo's `.gitignore`. Internal planning stays in the private repo only.
**Warning signs:** A `.planning/` directory in the public repo, or references to phase numbers/plan numbers in public commit messages.

### Pitfall 3: Wrangler.toml Production Environment Exposure
**What goes wrong:** `apps/gateway/wrangler.toml` is included in the public repo with staging AND production environment configurations. While Cloudflare resource IDs are safe to expose, the production configuration reveals: the exact production domain (`api.feelr.dev`), production KV namespace IDs, production D1 database IDs, and the rate limiting configuration.
**Why it happens:** The wrangler.toml is needed for development and self-hosting. However, the production environment section is only relevant to the cloud deployment.
**How to avoid:** For Phase 25 (audit only), document this as a finding. The actual fix happens in Phase 27 (repo split) where the public repo gets a dev-only wrangler.toml and the cloud repo gets its own `wrangler.cloud.toml` with production/staging configs. For now, note that KV/D1 IDs are safe per Cloudflare docs but production environment blocks should be stripped in the public snapshot.
**Warning signs:** A public repo with `[env.production]` sections containing real infrastructure details.

### Pitfall 4: Not Rotating Secrets After Audit
**What goes wrong:** The audit identifies secrets that have been safe in a private repo, but after the split, those secrets (like Cloudflare API tokens referenced in workflow files) are now in a "formerly private" repo that other people may have had access to. The secrets are not rotated.
**Why it happens:** The public repo uses a fresh snapshot so the git history is clean. Developers assume this means no rotation is needed. But anyone who previously cloned the private repo still has the commit history locally.
**How to avoid:** After the public repo is created, rotate ALL production secrets: CLOUDFLARE_API_TOKEN, SWA deployment tokens, HOMEBREW_TAP_GITHUB_TOKEN, and all Cloudflare Worker secrets. Document this rotation in the secrets inventory.
**Warning signs:** Production secrets that are identical before and after the repo split.

### Pitfall 5: `.gitignore` Pattern Depth Mismatch
**What goes wrong:** The current `.gitignore` has `.env` and `.env.*` patterns at root level. These work for `self-host/.env` because git matches `.env` at any depth. However, the success criteria specifically require `**/.env` for explicit deep-matching. If someone later adds a nested workspace with `.env.production.local`, the `!.env.example` exception might interact unexpectedly.
**Why it happens:** Git's `.gitignore` pattern matching is subtler than people think. A bare `.env` pattern DOES match at any depth (equivalent to `**/.env`). But `.env.*` only matches files starting with `.env.` -- it does not match `foo/.env` (that is matched by the bare `.env` rule).
**How to avoid:** Add explicit `**/.env` and `**/.env.*` patterns to be unambiguous. Keep the existing `.env` patterns for backward compatibility but add the `**/` prefixed versions as the canonical rules. Verify with `git check-ignore -v` at multiple depths.
**Warning signs:** `git check-ignore -v some/deep/path/.env` returning no match.

## Code Examples

### Running Gitleaks Git History Scan
```bash
# Source: https://github.com/gitleaks/gitleaks README

# Scan full git history with verbose output
gitleaks git -v .

# Scan with custom config and JSON report
gitleaks git -v --config=.gitleaks.toml --report-format json --report-path gitleaks-report.json .

# Scan specific commit range
gitleaks git -v --log-opts="--all commitA..commitB" .
```

### Running Gitleaks Directory Scan (Fresh Snapshot)
```bash
# Source: https://github.com/gitleaks/gitleaks README

# Scan directory (no git history, just current files)
gitleaks dir -v .

# Scan with redacted output (safe for logs)
gitleaks dir -v --redact .

# Scan with JSON report
gitleaks dir -v --report-format json --report-path gitleaks-snapshot.json .
```

### Verifying .gitignore Coverage
```bash
# Verify self-host/.env is ignored
git check-ignore -v self-host/.env
# Expected: .gitignore:NN:**/.env    self-host/.env

# Verify no .env files are tracked
git ls-files | grep '\.env'
# Expected: no output (zero results)

# Test deep nesting
mkdir -p test/deep/path
touch test/deep/path/.env
git check-ignore -v test/deep/path/.env
# Expected: .gitignore:NN:**/.env    test/deep/path/.env
rm -rf test/deep
```

### Git History Audit Commands
```bash
# Check if any .env files were ever committed
git log --all --oneline -- '*.env*'
# Expected: no output for this repo (self-host/.env was never tracked)

# Check for deleted files that might have contained secrets
git log --all --diff-filter=D --name-only --oneline

# Search for specific secret patterns in history
git log --all -p -S 'sk_live_' --oneline --stat
git log --all -p -S 'ghp_' --oneline --stat | grep -v 'ghp_\.\.\.' | grep -v 'ghp_your' | grep -v 'ghp_xxx'
```

## Codebase Current State Analysis

### Files That Will Trigger Gitleaks Findings (Expected False Positives)

These files contain example/documentation token patterns that Gitleaks will flag. Each needs an allowlist entry:

| File | Pattern | Type | Why It's Safe |
|------|---------|------|---------------|
| `connectors/github/src/__tests__/actions.test.ts` | `ghp_test_token` | Test fixture | Fake token in unit test |
| `connectors/github/src/__tests__/github-fetch.test.ts` | `ghp_test123` | Test fixture | Fake token in unit test |
| `apps/gateway/src/__tests__/credentials.test.ts` | `ghp_test_token_123456`, `xoxb-slack-token`, `sk_test_stripe` | Test fixtures | Fake tokens in unit tests |
| `apps/gateway/src/__tests__/crypto.test.ts` | `ghp_abc123def456` | Test fixture | Fake token in encryption test |
| `apps/docs/app/docs/connectors/github/page.mdx` | `ghp_your_pat_here` | Documentation | Example placeholder |
| `apps/docs/app/docs/connectors/stripe/page.mdx` | `sk_test_your_stripe_key` | Documentation | Example placeholder |
| `apps/docs/app/docs/auth/setup/page.mdx` | `ghp_your_pat_here`, `sk_live_your_stripe_key` | Documentation | Example placeholders |
| `apps/docs/app/docs/getting-started-api/page.mdx` | `ghp_your_github_pat_here` | Documentation | Example placeholder |
| `README.md` | `ghp_...` | Documentation | Example placeholder |
| `self-host/env.template` | `GITHUB_TOKEN=ghp_...` | Template | Example placeholder |
| `self-host/init.sh` | `ghp_...` | Script | Prompt text |
| `cli/cmd/auth.go` | `sk_live_*`, `sk_test_*` | CLI help text | Usage description |
| `cli/internal/auth/providers.go` | `sk_live_*`, `sk_test_*` | Config | Token prompt text |
| `feelr-strategy.md` | `ghp_xxxx` | Strategy doc | Example in architecture diagram |

### Files Containing Real Infrastructure Identifiers (Non-Secret but Noteworthy)

| File | Content | Risk Level |
|------|---------|------------|
| `apps/gateway/wrangler.toml` | KV namespace IDs, D1 database IDs | LOW -- Cloudflare docs confirm these are safe to expose publicly. They are bound to an account and require API authentication to access. |
| `apps/gateway/wrangler.toml` | Custom domain routes (`api.feelr.dev`, `staging-api.feelr.dev`) | NONE -- Public domain names |
| `.github/workflows/*.yml` | References to `secrets.CLOUDFLARE_API_TOKEN`, etc. | NONE -- These are secret references, not values |

### `.gitignore` Current State

Current patterns:
```
.env
.env.*
!.env.example
.dev.vars
.dev.vars.*
```

Missing pattern required by success criteria:
```
**/.env
```

**Analysis:** The bare `.env` pattern in git actually DOES match at any depth (verified via `git check-ignore -v self-host/.env` which returns `.gitignore:19:.env`). However, the success criteria explicitly require `**/.env` for clarity. The fix is to add `**/.env` and `**/.env.*` patterns.

### Tracked Files Count by Category

| Category | Count | Public? |
|----------|-------|---------|
| `.planning/` (phases, research, milestones) | 246 | NO |
| `apps/` (dashboard, docs, gateway) | 170+ | YES |
| `connectors/` | 50+ | YES |
| `cli/` | 40+ | YES |
| `.github/workflows/` | 5 | PARTIAL |
| `docs/deployment/` | 2 | NO |
| `scripts/` | 7 | YES |
| `self-host/` | 14 | YES |
| `chains/` | 6 | YES |
| Root files | ~10 | MOSTLY |
| `feelr-strategy.md` | 1 | NO |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `gitleaks detect` / `gitleaks protect` | `gitleaks git` / `gitleaks dir` / `gitleaks stdin` | v8.19.0 | Old commands still work but are hidden in help; use new subcommands |
| Global `[allowlist]` in config | `[[allowlists]]` array | v8.25.0 | Multiple named allowlists with higher precedence than rule-specific |
| `--no-git` flag | `gitleaks dir` subcommand | v8.19.0 | `gitleaks detect --no-git` is equivalent to `gitleaks dir` |
| Manual entropy thresholds | Built-in entropy rules per secret type | Recent | Default config handles entropy detection; custom thresholds rarely needed |

## Open Questions

1. **Should `docs/deployment/RUNBOOK.md` go public?**
   - What we know: It contains first-time setup instructions for Cloudflare Workers, Azure SWA, and DNS configuration. It references specific resource names (`feelr-dashboard`, `feelr-docs`, `feelr-rg`) and infrastructure commands.
   - What's unclear: Whether these infrastructure details constitute a security risk or are actually helpful for self-hosters trying to replicate the cloud setup.
   - Recommendation: EXCLUDE from public repo. The runbook is cloud-deployment specific. Self-hosters use `docker-compose up` per `self-host/README.md`. A simplified deployment guide for contributors can be created in Phase 29.

2. **Should `apps/gateway/wrangler.toml` contain production/staging environments in the public repo?**
   - What we know: KV/D1 IDs are safe per Cloudflare docs. Production domains are publicly known. The toml is needed for gateway development.
   - What's unclear: Whether the rate limit values, environment names, and routing patterns give useful information to competitors or attackers.
   - Recommendation: For Phase 25, document this finding. Phase 27 handles the actual split where the public repo gets a dev-only wrangler.toml and cloud repo gets full config.

3. **Should `assets/` (logo SVGs) be tracked in the public repo?**
   - What we know: Currently untracked (in git status as `??`). Contains `feelr-logo.svg` and `feelr-logomark.svg`.
   - What's unclear: Whether these should be committed and public (good for community/branding) or kept private.
   - Recommendation: Include in public repo -- logos are already embedded in the dashboard and docs as public-facing assets. The SVG source files add value for contributors.

4. **What is the expected number of Gitleaks findings before allowlisting?**
   - What we know: The codebase has ~15 files with example token patterns. Test files use fake `ghp_test_token` style strings.
   - What's unclear: Exact count depends on Gitleaks' entropy detection and which rules trigger.
   - Recommendation: Run the initial scan first, document every finding, then build the allowlist. Expect 10-30 initial findings, all of which should be classifiable as documentation examples or test fixtures.

## Sources

### Primary (HIGH confidence)
- [Gitleaks GitHub repository](https://github.com/gitleaks/gitleaks) -- Installation, commands, configuration, allowlist syntax
- [Cloudflare Workers KV Data Security](https://developers.cloudflare.com/kv/reference/data-security/) -- KV namespace IDs are not secrets
- [Cloudflare Workers SDK Discussion #7115](https://github.com/cloudflare/workers-sdk/discussions/7115) -- Confirmed wrangler.toml with resource IDs is safe to commit publicly
- Direct codebase analysis -- `git ls-files`, `git check-ignore`, `grep` for secret patterns across all 558 tracked files

### Secondary (MEDIUM confidence)
- [Gitleaks vs TruffleHog Comparison (Jit.io)](https://www.jit.io/resources/appsec-tools/trufflehog-vs-gitleaks-a-detailed-comparison-of-secret-scanning-tools) -- Tool comparison and selection rationale
- [TruffleHog GitHub repository](https://github.com/trufflesecurity/trufflehog) -- Alternative scanner capabilities
- [How to Implement Secret Scanning with Gitleaks (OneUpTime, Jan 2026)](https://oneuptime.com/blog/post/2026-01-25-secret-scanning-gitleaks/view) -- Current best practices
- [Git Secrets Scanners 2026 (Jit.io)](https://www.jit.io/resources/appsec-tools/git-secrets-scanners-key-features-and-top-tools-) -- Tool landscape overview

### Tertiary (LOW confidence)
- [Cloudflare KV Vulnerability (community forum, historical)](https://community.cloudflare.com/t/the-kv-vulnerability/125646) -- Historical context on KV namespace ID exposure risk (vulnerability was patched long ago, but provides context for why IDs were once considered sensitive)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Gitleaks is the clear choice; well-documented, actively maintained, Go binary installs anywhere
- Architecture: HIGH -- Audit workflow is straightforward; file classification is based on direct codebase analysis
- Pitfalls: HIGH -- All pitfalls verified against actual codebase state (e.g., confirmed `.gitignore` patterns, confirmed `self-host/.env` never tracked, confirmed planning doc count)

**Research date:** 2026-02-13
**Valid until:** 2026-03-13 (stable domain -- secret scanning tools evolve slowly)
