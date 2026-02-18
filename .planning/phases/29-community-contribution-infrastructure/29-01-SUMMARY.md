---
phase: 29-community-contribution-infrastructure
plan: 01
subsystem: infra
tags: [github-templates, issue-forms, pr-template, community]

# Dependency graph
requires: []
provides:
  - GitHub issue form templates (connector-request, bug-report, feature-request)
  - Template chooser config disabling blank issues
  - PR template with connector SDK compliance checklist
affects: [29-04-pre-seeded-issues]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GitHub YAML issue forms with typed elements (input, dropdown, textarea) and validations"
    - "PR template with SDK compliance checklist for connector contributions"

key-files:
  created:
    - .github/ISSUE_TEMPLATE/config.yml
    - .github/ISSUE_TEMPLATE/connector-request.yml
    - .github/ISSUE_TEMPLATE/bug-report.yml
    - .github/ISSUE_TEMPLATE/feature-request.yml
    - .github/PULL_REQUEST_TEMPLATE.md
  modified: []

key-decisions:
  - "Used only standard/safe labels (bug, enhancement, connector-request) -- no good-first-issue until Plan 04 pre-seeds"
  - "Kept PR template concise (5 SDK checkboxes) to avoid discouraging contributors"
  - "Linked Discussions in config.yml contact_links for general questions"

patterns-established:
  - "Issue forms use YAML syntax with validations.required for structured data collection"
  - "Connector PRs follow 5-item SDK compliance checklist"

# Metrics
duration: 2min
completed: 2026-02-17
---

# Phase 29 Plan 01: GitHub Templates Summary

**Three structured issue forms (connector-request, bug-report, feature-request) and PR template with 5-item connector SDK compliance checklist**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-17T11:04:23Z
- **Completed:** 2026-02-17T11:06:40Z
- **Tasks:** 2
- **Files created:** 5

## Accomplishments
- Three YAML issue form templates with structured fields (inputs, dropdowns, textareas) and validation rules
- Template chooser config that disables blank issues and links to GitHub Discussions
- PR template with type-of-change checkboxes and 5-item connector SDK compliance checklist

## Task Commits

Each task was committed atomically:

1. **Task 1: Create GitHub issue form templates and config** - `fa2dde5` (feat)
2. **Task 2: Create PR template with SDK compliance checklist** - `150b75a` (feat)

## Files Created/Modified
- `.github/ISSUE_TEMPLATE/config.yml` - Template chooser config disabling blank issues
- `.github/ISSUE_TEMPLATE/connector-request.yml` - Structured connector request form with API name, docs URL, auth type dropdown, suggested actions
- `.github/ISSUE_TEMPLATE/bug-report.yml` - Bug report form with description, steps, expected behavior, component dropdown
- `.github/ISSUE_TEMPLATE/feature-request.yml` - Feature request form with description, use case, component dropdown
- `.github/PULL_REQUEST_TEMPLATE.md` - PR template with summary, type-of-change, SDK compliance checklist, testing sections

## Decisions Made
- Used only standard/safe labels (bug, enhancement, connector-request) -- "good first issue" labels will be created in Plan 04 when issues are pre-seeded
- Kept PR template to 5 SDK compliance checkboxes (research pitfall #6 warns long templates discourage contributors)
- Added GitHub Discussions link in config.yml contact_links for general questions

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Issue templates ready for the public repo
- Labels referenced in templates (connector-request, bug, enhancement) need to exist in the repo (standard GitHub labels cover bug and enhancement; connector-request needs creation in Plan 04)
- PR template ready for connector contribution PRs

## Self-Check: PASSED

- All 5 created files verified on disk
- Commit `fa2dde5` (Task 1) found in git log
- Commit `150b75a` (Task 2) found in git log
- SUMMARY.md exists at expected path

---
*Phase: 29-community-contribution-infrastructure*
*Completed: 2026-02-17*
