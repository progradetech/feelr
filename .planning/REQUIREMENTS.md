# Requirements: Feelr

**Defined:** 2026-02-17
**Core Value:** An AI agent can call any supported external API in one line with near-zero context overhead

## v1.5 Requirements

Requirements for CI/CD Stabilization milestone. Each maps to roadmap phases.

### Pipeline Structure

- [ ] **PIPE-01**: Public repo has only CI and release workflows (remove dashboard.yml, docs.yml, gateway.yml deploy workflows)
- [ ] **PIPE-02**: Cloud repo sync workflow resolves pnpm-lock.yaml correctly (generate lockfile or fix caching strategy)
- [ ] **PIPE-03**: Cloud repo gateway deploy workflow completes successfully (fix pnpm/wrangler build chain)
- [ ] **PIPE-04**: Cloud repo dashboard deploy workflow completes successfully (verify SWA tokens and build)
- [ ] **PIPE-05**: Cloud repo docs deploy workflow completes successfully (verify SWA tokens and build)

### End-to-End Verification

- [ ] **CHAIN-01**: Public repo merge to main triggers cloud repo sync via repository_dispatch
- [ ] **CHAIN-02**: Cloud repo oss-sync completes successfully (subtree pull + lockfile + validation)
- [ ] **CHAIN-03**: Cloud repo tag push deploys all 3 services to production with smoke tests passing
- [ ] **CHAIN-04**: All GitHub Actions tabs show green on both repos

## Future Requirements

None — this is a stabilization milestone.

## Out of Scope

| Feature | Reason |
|---------|--------|
| New connectors or features | This milestone is strictly CI/CD stabilization |
| Self-hosting Docker pipeline | Docker build/push pipeline deferred to future milestone |
| Automated canary analysis | Requires SRE-level metrics infrastructure |
| PR preview environments | Azure SWA doesn't support custom domains on staging slots |
| CF analytics token configuration | Operational task, not a code change |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PIPE-01 | — | Pending |
| PIPE-02 | — | Pending |
| PIPE-03 | — | Pending |
| PIPE-04 | — | Pending |
| PIPE-05 | — | Pending |
| CHAIN-01 | — | Pending |
| CHAIN-02 | — | Pending |
| CHAIN-03 | — | Pending |
| CHAIN-04 | — | Pending |

**Coverage:**
- v1.5 requirements: 9 total
- Mapped to phases: 0
- Unmapped: 9 (pending roadmap)

---
*Requirements defined: 2026-02-17*
*Last updated: 2026-02-17 after initial definition*
