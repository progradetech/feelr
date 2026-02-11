---
phase: 17-cicd-homebrew-migration
verified: 2026-02-11T01:15:00Z
status: gaps_found
score: 3/6 must-haves verified
gaps:
  - truth: "Running brew install progradetech/feelr/feelr installs the latest Feelr CLI binary"
    status: deferred
    reason: "New tap repo is empty; GoReleaser config change will take effect on next release (v1.2.0 or later)"
    artifacts:
      - path: "progradetech/homebrew-feelr"
        issue: "Repository exists but has no Formula/ directory or commits yet"
    missing:
      - "Next version tag push (e.g., v1.2.0) to trigger GoReleaser with new config"
      - "After release: verify Formula/feelr.rb exists in progradetech/homebrew-feelr"
  - truth: "wrangler deploy in staging CI succeeds without KV permission errors"
    status: unverified
    reason: "CF token fix cannot be verified yet - no gateway code changes since token update to trigger workflow"
    artifacts:
      - path: ".github/workflows/gateway.yml"
        issue: "Last two runs (2026-02-10) failed; no runs since CF token fix on 2026-02-11"
    missing:
      - "Gateway code change or manual workflow trigger to test CF token permissions"
      - "Successful staging deploy in gateway.yml workflow"
  - truth: "Deprecation formula in andrewprograde/homebrew-feelr is in correct Homebrew tap structure"
    status: failed
    reason: "Formula placed at root level (feelr.rb) instead of Formula/feelr.rb"
    artifacts:
      - path: "andrewprograde/homebrew-feelr/feelr.rb"
        issue: "Formula at wrong location; Homebrew expects Formula/ directory structure"
    missing:
      - "Move feelr.rb to Formula/feelr.rb in andrewprograde/homebrew-feelr"
      - "Verify brew tap andrewprograde/feelr shows formula correctly"
---

# Phase 17: CI/CD & Homebrew Migration Verification Report

**Phase Goal:** CI/CD pipeline deploys cleanly and users install Feelr from the correct Homebrew tap
**Verified:** 2026-02-11T01:15:00Z
**Status:** gaps_found
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Cloudflare API token has Workers KV Storage: Edit permission | ✓ VERIFIED | User confirmed in Plan 01 Task 2 checkpoint |
| 2 | progradetech/homebrew-feelr repository exists on GitHub | ✓ VERIFIED | Public repo confirmed via gh API |
| 3 | HOMEBREW_TAP_GITHUB_TOKEN secret has write access to new tap | ✓ VERIFIED | Secret exists; PAT created with Contents: Read+Write |
| 4 | wrangler deploy --env staging succeeds in CI without KV permission errors | ⚠️ UNVERIFIED | No workflow runs since CF token fix to verify |
| 5 | Running brew install progradetech/feelr/feelr installs latest CLI binary | ⚠️ DEFERRED | New tap empty; config change effective on next release |
| 6 | Running brew install andrewprograde/feelr/feelr prints deprecation message | ✗ FAILED | Formula exists with deprecate! but at wrong path (root, not Formula/) |

**Score:** 3/6 truths verified (3 verified, 2 deferred/unverified, 1 failed)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.goreleaser.yaml` | owner: progradetech | ✓ VERIFIED | Line 39: `owner: progradetech` confirmed |
| `progradetech/homebrew-feelr` (repo) | Public repo ready for formulas | ✓ VERIFIED | Exists, public, empty (correct initial state) |
| `HOMEBREW_TAP_GITHUB_TOKEN` secret | Scoped PAT with write access | ✓ VERIFIED | Secret exists in progradetech/feelr |
| `andrewprograde/homebrew-feelr/Formula/feelr.rb` | Deprecation formula | ✗ WRONG PATH | Formula exists at root (feelr.rb) not Formula/feelr.rb |
| Cloudflare API token | KV write permissions | ✓ VERIFIED | User confirmed dashboard update in Plan 01 |
| `progradetech/homebrew-feelr/Formula/feelr.rb` | Formula from GoReleaser | ⚠️ NOT YET | Repo empty; will appear after next release |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `.goreleaser.yaml brews.repository.owner` | progradetech/homebrew-feelr | GoReleaser release push | ✓ WIRED | Config correct; untested (no release since change) |
| `release.yml HOMEBREW_TAP_GITHUB_TOKEN` | `.goreleaser.yaml brews.repository.token` | Env var injection | ✓ WIRED | Line 31 in release.yml passes token to GoReleaser |
| Cloudflare API token | Gateway staging deploy | wrangler-action apiToken param | ⚠️ UNVERIFIED | No workflow run since token fix |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| CICD-01: Staging deploy succeeds with KV write permissions | ⚠️ UNVERIFIED | No gateway workflow run since CF token fix on 2026-02-11 |
| CICD-02: GoReleaser config targets progradetech/homebrew-feelr | ✓ SATISFIED | Config updated; will be tested on next release |
| CICD-03: Deprecation formula guides users to new tap | ✗ PARTIAL | Formula exists with correct deprecate! and caveats, but at wrong path (root instead of Formula/) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| andrewprograde/homebrew-feelr | root | Formula at root level instead of Formula/ | 🛑 Blocker | Homebrew will not recognize formula; `brew tap andrewprograde/feelr` may fail or show empty |
| progradetech/homebrew-feelr | N/A | Empty repository | ℹ️ Info | Expected state; GoReleaser will create Formula/ on first push |

### Human Verification Required

#### 1. Test Old Tap Deprecation

**Test:** Run the following commands on a fresh macOS/Linux system:
```bash
brew tap andrewprograde/feelr
brew info andrewprograde/feelr/feelr
```

**Expected:** 
- `brew tap` succeeds and finds the formula
- `brew info` shows deprecation warning: "deprecated because tap moved to progradetech/feelr"
- Caveats display migration instructions to `brew install progradetech/feelr/feelr`

**Why human:** Requires Homebrew client behavior testing; cannot verify tap recognition programmatically without Homebrew CLI installed

#### 2. Verify CF Token Fix on Next Gateway Deploy

**Test:** After the next commit to `apps/gateway/`, `packages/`, or `connectors/`:
```bash
gh run list --repo progradetech/feelr --workflow=gateway.yml --limit 1
gh run view <run_id> --log
```

**Expected:**
- Deploy to staging step succeeds without KV permission errors
- Smoke test passes (200 response from https://feelr-gateway-staging.feelr.workers.dev/health)

**Why human:** No code changes trigger gateway workflow yet; verification deferred until next natural gateway deployment

#### 3. Verify New Tap Install After Next Release

**Test:** After pushing the next version tag (e.g., `v1.2.0`):
```bash
brew tap progradetech/feelr
brew install progradetech/feelr/feelr
feelr --version
```

**Expected:**
- `brew tap` succeeds and finds progradetech/homebrew-feelr
- `brew install` downloads and installs the binary
- `feelr --version` shows the correct version (v1.2.0 or later)

**Why human:** Requires release cycle and Homebrew client testing; new tap configuration only takes effect on releases after fb6426c commit (2026-02-11)

### Gaps Summary

**Gap 1: Deprecation Formula at Wrong Path (Blocker)**

The deprecation formula was placed at `andrewprograde/homebrew-feelr/feelr.rb` instead of `Formula/feelr.rb`. Homebrew tap convention requires formulas to be in a `Formula/` directory. While the formula content is correct (has `deprecate!`, `caveats`, and migration instructions), the path issue means:

- `brew tap andrewprograde/feelr` may not recognize the formula
- Users attempting to install from the old tap may see "Error: No available formula with the name..." instead of the deprecation message

**Fix:** Move `feelr.rb` to `Formula/feelr.rb` in the andrewprograde/homebrew-feelr repository.

**Gap 2: CF Token Fix Unverified (Deferred)**

The Cloudflare API token was updated with Workers KV Storage: Edit permission on 2026-02-11 (user confirmed in Plan 01 Task 2). However, verification is blocked because:

- Last gateway workflow runs were on 2026-02-10 (before the token fix)
- No gateway code changes since 2026-02-11 to trigger a new workflow run
- The GoReleaser config change (fb6426c) does not touch gateway paths, so it didn't trigger gateway.yml

**Fix:** Either:
1. Make a trivial change to `apps/gateway/` to trigger the workflow, OR
2. Manually trigger the gateway workflow via GitHub Actions UI, OR
3. Defer verification to the next natural gateway deployment

Verification will confirm the "Deploy to staging" step succeeds without KV permission errors.

**Gap 3: New Tap Formula Not Yet Published (Expected Deferred)**

The progradetech/homebrew-feelr repository is empty, which is correct. The GoReleaser config change (fb6426c) happened AFTER the v1.1.0 release (2026-02-10 17:22:04Z), so v1.1.0 was published to the old tap (andrewprograde). The new tap will receive its first formula on the next release (v1.2.0 or later).

**Not a bug** - this is the expected state. Truth 2 ("Running brew install progradetech/feelr/feelr installs the latest Feelr CLI binary") is deferred until the next release cycle.

**Timeline:**
- v1.1.0 released: 2026-02-10T17:22:04Z (old config → andrewprograde/homebrew-feelr)
- Config changed: 2026-02-11T00:36:13Z (fb6426c → progradetech/homebrew-feelr)
- Deprecation added: 2026-02-11T00:36:51Z (d2c1c1f)
- Next release (v1.2.0+): Will publish to progradetech/homebrew-feelr

---

_Verified: 2026-02-11T01:15:00Z_
_Verifier: Claude (gsd-verifier)_
