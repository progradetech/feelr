---
phase: 09-self-hosting
plan: 06
subsystem: docker-infrastructure
tags: [docker, dockerfile, docker-compose, s6-overlay, caddy, workerd, self-hosted]
dependency_graph:
  requires: ["09-05"]
  provides: ["dockerfile", "docker-compose", "s6-services", "caddy-tls", "startup-script"]
  affects: ["09-07"]
tech_stack:
  added: ["s6-overlay-v3", "caddy-2", "docker-compose"]
  patterns: ["multi-stage-build", "s6-overlay-process-supervision", "profile-based-sidecar", "yaml-to-json-init"]
key_files:
  created:
    - self-host/Dockerfile
    - self-host/docker-compose.yml
    - self-host/Caddyfile
    - self-host/s6/s6-rc.d/workerd/type
    - self-host/s6/s6-rc.d/workerd/run
    - self-host/s6/s6-rc.d/workerd/finish
    - self-host/s6/s6-rc.d/user/contents.d/workerd
    - self-host/s6/cont-init.d/01-migrate.sh
  modified: []
decisions:
  - id: "09-06-01"
    decision: "workerd installed via npm in Dockerfile with nodejs/npm install-then-purge pattern"
    reason: "workerd binary distribution is unreliable from GitHub; npm is the most reliable installation method; nodejs/npm purged after install to keep image size down"
  - id: "09-06-02"
    decision: "YAML-to-JSON conversion in cont-init.d startup script using Node.js one-liner"
    reason: "workerd reads FEELR_CONFIG as JSON from environment; init script converts feelr.yaml to JSON at container start; Node.js one-liner handles nested YAML without external dependencies"
  - id: "09-06-03"
    decision: "Caddy sidecar activated via Docker Compose profiles (not separate compose file)"
    reason: "Profile-based approach keeps single docker-compose.yml; users opt in with --profile tls flag"
metrics:
  duration: "2 min"
  completed: "2026-02-08"
---

# Phase 9 Plan 6: Docker Infrastructure Summary

**Multi-stage Dockerfile builds gateway bundle + dashboard static export into s6-overlay-supervised workerd image; docker-compose.yml exposes port 8080 with optional Caddy TLS profile; s6-rc.d longrun service manages workerd lifecycle.**

## What Was Done

### Task 1: Multi-Stage Dockerfile

Created a two-stage Dockerfile for the self-hosted Feelr image:

- **Stage 1 (builder)**: Uses `node:22-alpine` with corepack-enabled pnpm. Copies workspace package.json files first for Docker layer caching, then installs dependencies with `--frozen-lockfile`. Builds the dashboard via `npx next build` (static export to `out/`), then bundles the gateway via esbuild with `--external:cloudflare:workers` for workerd runtime resolution.

- **Stage 2 (runtime)**: Uses `debian:bookworm-slim` (workerd requires glibc). Installs s6-overlay v3 from GitHub releases (noarch + x86_64 tarballs). Installs workerd via npm (most reliable distribution method), then purges nodejs/npm to reduce image size. Creates `/data/feelr/do`, `/app`, `/opt/feelr/dashboard`, `/etc/feelr` directories. Copies built artifacts from builder stage. Configures HEALTHCHECK on `/health:8080`, exposes port 8080, declares `/data/feelr` as a volume, and uses `/init` (s6-overlay) as entrypoint.

### Task 2: Docker Compose, s6 Services, and Caddy Config

Created the complete orchestration and process supervision infrastructure:

- **docker-compose.yml**: Defines `feelr` service with build context pointing to repo root, port mapping via `FEELR_PORT` env var (default 8080), named `feelr-data` volume for persistent storage, `.env` file for secrets, and healthcheck. The `caddy` service uses `caddy:2-alpine` image behind a `tls` profile (activated with `--profile tls`), depends on feelr being healthy, and mounts Caddyfile + cert volumes.

- **Caddyfile**: Simple reverse proxy configuration using `{$FEELR_DOMAIN:localhost}` environment variable expansion. Caddy automatically handles Let's Encrypt TLS certificate provisioning.

- **s6-rc.d/workerd**: s6 v3 longrun service definition. `type` file contains "longrun". `run` script executes `workerd serve /etc/feelr/config.capnp`. `finish` script logs non-zero exit codes for debugging. Empty file at `user/contents.d/workerd` marks it as a user service for s6-rc.

- **cont-init.d/01-migrate.sh**: Runs once at container startup before services start. Creates `/data/feelr/do` directory. Checks `FEELR_AUTO_MIGRATE` flag and logs status. Converts `feelr.yaml` to JSON (`FEELR_CONFIG` env var) using a Node.js one-liner if available. Logs startup configuration summary.

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Multi-stage Dockerfile | 628edfd | Dockerfile |
| 2 | Docker Compose, s6 services, Caddy | ff2ea90 | docker-compose.yml, Caddyfile, s6/*, cont-init.d/* |

## Decisions Made

1. **workerd via npm install-then-purge** -- The most reliable way to get the workerd binary into a Debian container. Direct GitHub binary releases have inconsistent naming; npm guarantees the correct binary for the platform. Node.js and npm are purged after installation to keep the runtime image lean.

2. **YAML-to-JSON in init script** -- The workerd capnp config reads `FEELR_CONFIG` as a JSON string from the environment. The `01-migrate.sh` init script converts `feelr.yaml` to JSON at container startup using a Node.js one-liner, keeping the conversion transparent to the user (they only edit YAML).

3. **Profile-based Caddy sidecar** -- Uses Docker Compose `profiles: ["tls"]` rather than a separate compose file. Users activate TLS with `docker compose --profile tls up`, keeping the deployment as a single compose file.

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- Dockerfile has 2 valid FROM stages (builder + runtime)
- docker-compose.yml passes YAML validation
- s6 service structure: type (longrun), run, finish, user/contents.d/workerd
- Health check targets /health on port 8080 in both Dockerfile and docker-compose.yml
- Data persists via `feelr-data` named volume mounted to `/data/feelr`
- Caddyfile contains `reverse_proxy feelr:8080`
- 01-migrate.sh references `FEELR_AUTO_MIGRATE`
- workerd/run contains `exec workerd serve`

## Next Phase Readiness

Plan 07 (init script and documentation) can now reference:
- `self-host/docker-compose.yml` for the compose workflow
- `self-host/Dockerfile` for the build process
- s6 service definitions in `self-host/s6/`
- The YAML-to-JSON conversion pattern in `01-migrate.sh`
- The `--profile tls` pattern for optional Caddy TLS

No blockers identified.

## Self-Check: PASSED
