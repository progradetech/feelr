---
phase: 09-self-hosting
plan: 07
subsystem: init-and-docs
tags: [init-script, readme, self-hosted, docker, verification]
---

## Summary

Created the interactive init script and self-hosting documentation, then verified the complete Docker-based self-hosting flow end-to-end.

### What was built

- **`self-host/init.sh`** — POSIX sh setup script with progressive prompts: collects admin token + encryption key (auto-generates if empty), optional connector credential setup, generates `.env`, copies `feelr.yaml.template`
- **`self-host/README.md`** — Quick-start guide covering clone → init → docker compose up flow, configuration reference, TLS setup, backup/restore, troubleshooting

### Fixes during verification

Docker build and runtime issues fixed during human verification:
- **COPY paths**: Build context is repo root (`..`), not `self-host/` — fixed all COPY commands to use correct relative paths
- **workerd install**: Moved workerd installation to builder stage (Node 22 handles platform-specific npm deps) and copy binary to runtime via multi-stage COPY
- **esbuild resolution**: Added `--main-fields=module,main` for neutral platform to resolve package entry points
- **embed path**: Placed gateway JS bundle relative to config.capnp so workerd `embed` resolves correctly
- **capnp config**: Added writable disk service for Durable Object storage (localDisk references a service name, not a path)

### Key files

**Created:**
- `self-host/init.sh` — Interactive setup script
- `self-host/README.md` — Self-hosting documentation

**Modified:**
- `self-host/Dockerfile` — Fixed build context paths, workerd install, esbuild flags, embed resolution
- `self-host/config.capnp` — Added writable do-storage disk service

### Decisions

- [09-07]: POSIX sh (not bash) for init.sh portability
- [09-07]: workerd installed in builder stage via pnpm, native binary copied to runtime (avoids Debian npm issues)
- [09-07]: Gateway JS bundle placed at /etc/feelr/dist/ next to config.capnp for relative embed resolution
- [09-07]: DO storage uses named disk service with writable=true (workerd localDisk requires service name, not path)

### Verification

- ✓ `docker compose build` succeeds
- ✓ `docker compose up -d` starts container
- ✓ `curl http://localhost:8080/health` returns OK
- ✓ init.sh is POSIX sh compliant
- ✓ Gateway compiles with tsc --noEmit (zero errors)

## Self-Check: PASSED
