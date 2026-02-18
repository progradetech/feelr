# Phase 9: Self-Hosting - Research

**Researched:** 2026-02-07
**Domain:** Docker containerization, workerd standalone runtime, Cloudflare binding abstraction, init scripts
**Confidence:** MEDIUM (workerd disk-backed KV behavior partially verified; abstraction layer design is well-understood)

## Summary

Phase 9 requires packaging the entire Feelr stack (gateway + dashboard) into a Docker image that runs with `docker compose up`, replacing Cloudflare-managed services (KV, D1, Durable Objects, Rate Limiting) with local equivalents. The gateway currently depends on 5 Cloudflare-specific binding types: `KVNamespace`, `D1Database`, `DurableObjectNamespace`, `RateLimitBinding`, and Worker Secrets.

The recommended approach is: (1) use workerd standalone as the runtime (it IS the Cloudflare Workers runtime, ensuring maximum compatibility), (2) build a binding abstraction layer using TypeScript interfaces that the gateway code programs against, with separate adapter implementations for cloud (Cloudflare bindings) and self-hosted (SQLite-backed), (3) package workerd + Next.js static export + init tooling into a single Docker image using s6-overlay for process supervision.

**Primary recommendation:** Use the interface+adapters pattern (not thin shims) because the gap between Cloudflare platform services and local equivalents is substantial. KV, D1, and Rate Limiting all need SQLite-backed replacements. Durable Objects can use workerd's native `localDisk` storage with `enableSql`, which is the closest to production behavior.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Init script + compose flow: user runs a setup script that prompts for essentials, generates config, then `docker compose up`
- Single port exposed (e.g., 8080) -- internal routing handles gateway API vs dashboard
- Progressive init: collect admin creds + encryption secret first, then offer optional connector setup
- Optional Caddy sidecar in docker-compose.yml (profile-based) for auto Let's Encrypt TLS -- HTTP-only by default
- workerd standalone as the self-hosted runtime (closest to production Workers)
- Single Docker image for the whole stack (workerd + dashboard) -- uses supervisor or multi-process
- Billing code present but disabled by default -- self-hosters can enable and connect own Stripe
- YAML config (`feelr.yaml`) for structured settings + `.env` for secrets
- Rate limit tiers configurable in `feelr.yaml` -- self-hosters define their own limits per key tier
- Init script generates `feelr.yaml` from commented template
- SQLite files split by concern: separate databases for auth, usage, config
- Encryption optional: AES-256-GCM on by default, can be disabled for local-only dev instances
- Auto-migrate on startup by default, `FEELR_AUTO_MIGRATE=false` to disable

### Claude's Discretion
- Runtime abstraction layer design (interface+adapters vs thin shims -- depends on workerd API surface)
- Token coordination mechanism (workerd DO vs SQLite locks -- depends on workerd maturity)
- Dev experience hot-reload vs restart-on-change
- Single image process supervisor choice
- SQLite file naming and location conventions

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core

| Library/Tool | Version | Purpose | Why Standard |
|-------------|---------|---------|--------------|
| workerd | v1.20260207.0 | JavaScript/Wasm runtime for gateway | Same runtime as production Cloudflare Workers; ensures bug-for-bug compatibility |
| s6-overlay | v3.2.2.0 | Multi-process supervisor in single container | Purpose-built for Docker containers; handles PID 1, graceful shutdown, service dependencies |
| better-sqlite3 | ^11.x | SQLite driver for Node.js adapter layer | Synchronous API perfect for KV/D1 replacement; battle-tested, fast |
| Caddy | 2.x | Optional TLS reverse proxy | Automatic Let's Encrypt, zero-config HTTPS, minimal Caddyfile |
| Docker Compose | 3.x+ | Orchestration | Standard for self-hosted multi-service deployment |

### Supporting

| Library/Tool | Purpose | When to Use |
|-------------|---------|-------------|
| Node.js (slim) | Dashboard serving (Next.js static export) | Serve pre-built static files via simple HTTP server |
| envsubst / bash | Init script config generation | Generate YAML from template with user inputs |
| yq | YAML processing in init script | Validate generated config (optional) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| s6-overlay | supervisord | supervisord doesn't exit when child dies; s6-overlay is container-native |
| s6-overlay | tini | tini only manages 1 child process; we need 2+ (workerd + dashboard server) |
| better-sqlite3 | workerd native DO + disk KV | Workerd disk KV lacks full KVNamespace API (list prefix, metadata); DO works but D1 has no workerd equivalent |
| Caddy | nginx | Caddy has automatic HTTPS with zero config; nginx requires manual cert management |
| Single image | Separate containers | User decision: single image simplifies deployment, one `docker compose up` |

## Architecture Patterns

### Recommended Project Structure

```
apps/gateway/
  src/
    runtime/                    # NEW: Runtime abstraction layer
      interfaces.ts             # StorageAdapter, DatabaseAdapter, RateLimiter interfaces
      cloudflare/               # Cloud adapter implementations
        kv-adapter.ts           # Wraps KVNamespace
        db-adapter.ts           # Wraps D1Database
        rate-limiter.ts         # Wraps RateLimitBinding
        token-coordinator.ts    # Wraps DurableObjectNamespace
      self-hosted/              # Self-hosted adapter implementations
        kv-adapter.ts           # SQLite-backed KV
        db-adapter.ts           # SQLite-backed D1 replacement
        rate-limiter.ts         # In-memory sliding window
        token-coordinator.ts    # SQLite with locks (or workerd DO)
      factory.ts                # Creates adapters based on RUNTIME env var

self-host/                      # NEW: Self-hosting package
  Dockerfile                    # Multi-stage: build workerd config + dashboard, runtime image
  docker-compose.yml            # Main compose file
  docker-compose.caddy.yml      # OR: caddy profile in main compose
  Caddyfile                     # Template Caddyfile for TLS
  init.sh                       # Interactive setup script
  feelr.yaml.template           # Commented YAML template
  config.capnp.template         # workerd config template
  s6/                           # s6-overlay service definitions
    workerd/
      run                       # Start workerd
    dashboard/
      run                       # Serve Next.js static export
  migrations/                   # SQLite migration files
    001_auth.sql
    002_usage.sql
    003_config.sql
```

### Pattern 1: Runtime Abstraction Layer (Interface + Adapters)

**What:** Define TypeScript interfaces that mirror the Cloudflare binding APIs the gateway uses, then implement those interfaces for both cloud (thin wrappers around real bindings) and self-hosted (SQLite-backed).

**When to use:** Always -- this is the core pattern for same-codebase dual-runtime support.

**Why interface+adapters (not thin shims):** The gap between Cloudflare services and local equivalents is too large for thin shims. D1 doesn't exist in workerd at all. KV's disk service is HTTP-based and may not fully implement KVNamespace semantics (prefix listing, metadata). Rate limiting bindings are Cloudflare-only. A proper interface layer lets each adapter implement the contract correctly for its environment.

**Example:**
```typescript
// runtime/interfaces.ts
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  get<T>(key: string, type: 'json'): Promise<T | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string }> }>;
}

export interface UsageDatabase {
  prepare(sql: string): PreparedStatement;
}

export interface PreparedStatement {
  bind(...values: unknown[]): BoundStatement;
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
  run(): Promise<{ meta: { changes?: number } }>;
}

export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface TokenCoordinator {
  storeCredential(connector: string, accessToken: string, refreshToken: string, expiresAt: number): Promise<void>;
  getCredential(connector: string): Promise<TokenState | null>;
  removeCredential(connector: string): Promise<void>;
  listCredentials(): Promise<Array<{ connector: string; status: string; expiresAt: number }>>;
}
```

### Pattern 2: AppEnv Abstraction

**What:** Replace direct Cloudflare binding types in AppEnv with the abstract interfaces.

**Example:**
```typescript
// Current AppEnv (cloud-specific):
interface AppEnv extends Env {
  Bindings: {
    AUTH_KV: KVNamespace;
    USAGE_DB: D1Database;
    RATE_LIMIT_FREE: RateLimitBinding;
    // ...
  }
}

// New AppEnv (runtime-agnostic):
interface AppEnv extends Env {
  Bindings: {
    AUTH_KV: KeyValueStore;        // Our interface
    USAGE_DB: UsageDatabase;       // Our interface
    RATE_LIMIT_FREE: RateLimiter;  // Our interface
    TOKEN_COORDINATOR: TokenCoordinator; // Our interface (replaces DurableObjectNamespace)
    ENCRYPTION_KEY: string;
    ADMIN_TOKEN: string;
    // ...
  }
}
```

### Pattern 3: Config-Driven Feature Flags

**What:** Use `feelr.yaml` + environment variables to control runtime behavior (billing, encryption, rate limits).

**Example:**
```yaml
# feelr.yaml
runtime: self-hosted  # or: cloud

gateway:
  port: 8080

billing:
  enabled: false
  # stripe_secret_key: sk_...  # uncomment for internal chargeback

encryption:
  enabled: true
  # Set FEELR_ENCRYPTION_KEY in .env

rate_limits:
  free:
    requests_per_minute: 30
  pro:
    requests_per_minute: 300
  enterprise:
    requests_per_minute: 3000

storage:
  data_dir: /data/feelr
  auto_migrate: true
```

### Pattern 4: Single-Port Internal Routing

**What:** The Docker container exposes one port (8080). An internal router (either workerd config or a lightweight reverse proxy) routes `/api/*`, `/admin/*`, `/internal/*`, `/v1/*` to the workerd gateway and everything else to the static dashboard.

**Recommended approach:** Use workerd's own socket + service routing. Define two services in the capnp config: one for the gateway worker, one for serving the dashboard static files from a disk directory. A small routing worker or the main worker itself handles path-based dispatch.

**Example capnp config:**
```capnp
using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    (name = "gateway", worker = .gatewayWorker),
    (name = "dashboard", disk = "dashboard-static"),
    (name = "kv-store", disk = (path = "/data/feelr/kv", writable = true)),
  ],
  sockets = [
    (name = "http", address = "*:8080", http = (), service = "gateway"),
  ],
);

const gatewayWorker :Workerd.Worker = (
  modules = [
    (name = "worker", esModule = embed "dist/gateway.js"),
  ],
  compatibilityDate = "2026-02-05",
  durableObjectNamespaces = [
    (className = "TokenCoordinator", uniqueKey = "token-coordinator"),
  ],
  durableObjectStorage = (localDisk = "do-storage"),
  bindings = [
    (name = "ENCRYPTION_KEY", fromEnvironment = "FEELR_ENCRYPTION_KEY"),
    (name = "ADMIN_TOKEN", fromEnvironment = "FEELR_ADMIN_TOKEN"),
    (name = "RUNTIME", text = "self-hosted"),
    # KV, D1, RateLimiting handled via adapter layer, not capnp bindings
  ],
);
```

### Anti-Patterns to Avoid

- **Forking the codebase for self-hosted:** Creates maintenance nightmare. Use abstraction layer, single codebase.
- **Using miniflare in production:** Miniflare is a development simulator, not a production runtime. Use workerd directly.
- **Putting SQLite adapters behind workerd's disk KV service:** The disk KV service converts KVNamespace API to HTTP file operations, which may not faithfully implement list-with-prefix, metadata, or other features the gateway relies on. Instead, inject SQLite adapters at the application level.
- **Running separate containers for gateway and dashboard:** User decided on single image. Don't fight this.
- **Hardcoding cloud vs self-hosted checks throughout codebase:** Centralize in the factory/adapter layer.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Process supervision in container | Custom bash script with trap/wait | s6-overlay v3 | Handles PID 1 correctly, reaps zombies, graceful shutdown, service dependencies |
| TLS certificate management | Manual cert generation + renewal | Caddy (profile-based sidecar) | Automatic ACME, zero-config renewal, no cron jobs |
| SQLite connection pooling | Custom pool with locks | better-sqlite3 synchronous API | Single-process, synchronous -- no pooling needed |
| YAML config parsing | Custom YAML parser | js-yaml (already Web Standard) or config read at init time | Standard library, handles comments and types |
| Docker health checks | Custom health endpoint | Existing /health endpoint + Docker HEALTHCHECK | Already built in Phase 1 |
| Data migration framework | Custom migration runner | Simple sequential SQL file execution | SQLite migrations are just SQL files run in order |

**Key insight:** The hard part of self-hosting is the abstraction layer, not the infrastructure. Docker, s6-overlay, Caddy, and SQLite are all well-understood. The engineering challenge is making the gateway code runtime-agnostic without breaking anything.

## Common Pitfalls

### Pitfall 1: workerd Disk KV != Full KVNamespace API
**What goes wrong:** Assuming workerd's disk service (`disk = (path = "kv", writable = true)`) fully implements the KVNamespace API. In reality, it converts KV operations to HTTP file operations. Features like `list({ prefix: 'apikey:' })` may not work correctly because the disk service maps keys to filenames.
**Why it happens:** The capnp schema says "requests will be converted into HTTP requests targeting the given service name" but doesn't specify the full mapping.
**How to avoid:** Don't rely on workerd's disk KV service for the auth store. Build a SQLite-backed KeyValueStore adapter instead. This gives full control over list-with-prefix, metadata, and expiration semantics.
**Warning signs:** Tests passing locally but prefix listing returning wrong results.

### Pitfall 2: D1Database Does Not Exist in workerd
**What goes wrong:** Trying to configure a D1 binding in workerd's capnp config. D1 is a Cloudflare platform product (built on top of Durable Objects internally) and has no standalone equivalent.
**Why it happens:** Assuming all Cloudflare bindings have workerd equivalents.
**How to avoid:** Replace D1Database usage with a UsageDatabase interface backed by better-sqlite3 or workerd's DO SQL storage. The gateway's D1 usage is simple (INSERT, SELECT with GROUP BY) -- straightforward to port.
**Warning signs:** No `d1Database` field in workerd.capnp schema.

### Pitfall 3: Rate Limiting Bindings Are Cloudflare-Only
**What goes wrong:** Looking for rate limiting binding support in workerd. The `unsafe.bindings` type `ratelimit` is a Cloudflare-managed service.
**Why it happens:** Rate limiting was used as an "unsafe" binding in wrangler.toml, suggesting it might be a workerd feature. It's not.
**How to avoid:** Implement an in-memory sliding window rate limiter that implements the same `RateLimiter` interface. For single-instance self-hosted, in-memory is actually more accurate than Cloudflare's per-location limits.
**Warning signs:** No `rateLimit` binding type in workerd.capnp.

### Pitfall 4: Durable Object Alarms Use In-Memory Scheduler in workerd
**What goes wrong:** Relying on DO alarms for critical token refresh scheduling, then losing all scheduled alarms on container restart.
**Why it happens:** workerd's standalone DO implementation uses an in-memory alarm scheduler. Alarms survive within a process lifetime but are lost on restart.
**How to avoid:** For self-hosted token refresh, either (a) use workerd DO with alarms but also run a startup scan that reschedules any tokens approaching expiry, or (b) use a SQLite-based scheduler with periodic polling. Option (a) is simpler since the TokenCoordinator already has `scheduleNextRefresh()` logic.
**Warning signs:** Tokens expiring after container restart without refresh attempts.

### Pitfall 5: Single-Port Routing Complexity
**What goes wrong:** Gateway serves API + dashboard both need to handle routing at port 8080 but are separate processes.
**Why it happens:** workerd runs the gateway, a separate process serves the dashboard static files.
**How to avoid:** Two approaches: (a) Use workerd's service routing -- define a disk service for dashboard static files and route non-API paths to it in the gateway worker code, or (b) use a minimal Node.js server that reverse-proxies API requests to workerd and serves static files directly. Approach (a) is cleaner since it eliminates a separate process.
**Warning signs:** CORS issues, path conflicts, health check returning dashboard HTML.

### Pitfall 6: Init Script Portability
**What goes wrong:** Init script uses bash-specific features that break on minimal Docker images (alpine/busybox).
**Why it happens:** Assuming bash is available; alpine ships with ash/busybox sh.
**How to avoid:** Write init script in POSIX sh or explicitly install bash. Use `#!/bin/sh` for portability. Avoid bash arrays, `[[ ]]`, `<<<`, process substitution.
**Warning signs:** `syntax error: unexpected "(" ` on alpine.

### Pitfall 7: executionCtx.waitUntil Compatibility
**What goes wrong:** Assuming `c.executionCtx.waitUntil()` won't work in workerd standalone.
**Why it happens:** Confusing workerd with other runtimes (Bun, Deno) where waitUntil isn't supported.
**How to avoid:** workerd IS the Cloudflare Workers runtime. `waitUntil` works natively. The gateway code already uses optional chaining (`c.executionCtx?.waitUntil?.(...)` in some places) which is fine. No changes needed for waitUntil.

## Code Examples

### SQLite-Backed KeyValueStore Adapter

```typescript
// runtime/self-hosted/kv-adapter.ts
// Implements KeyValueStore interface using better-sqlite3
import Database from 'better-sqlite3';

export class SqliteKeyValueStore implements KeyValueStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        metadata TEXT,
        expiration INTEGER
      )
    `);
  }

  async get(key: string): Promise<string | null>;
  async get<T>(key: string, type: 'json'): Promise<T | null>;
  async get(key: string, type?: string): Promise<unknown> {
    const row = this.db.prepare(
      'SELECT value FROM kv WHERE key = ? AND (expiration IS NULL OR expiration > ?)'
    ).get(key, Math.floor(Date.now() / 1000)) as { value: string } | undefined;

    if (!row) return null;
    if (type === 'json') return JSON.parse(row.value);
    return row.value;
  }

  async put(key: string, value: string): Promise<void> {
    this.db.prepare(
      'INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)'
    ).run(key, value);
  }

  async delete(key: string): Promise<void> {
    this.db.prepare('DELETE FROM kv WHERE key = ?').run(key);
  }

  async list(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string }> }> {
    const prefix = options?.prefix ?? '';
    const rows = this.db.prepare(
      'SELECT key FROM kv WHERE key LIKE ? AND (expiration IS NULL OR expiration > ?)'
    ).all(`${prefix}%`, Math.floor(Date.now() / 1000)) as Array<{ key: string }>;

    return { keys: rows.map(r => ({ name: r.key })) };
  }
}
```

### In-Memory Sliding Window Rate Limiter

```typescript
// runtime/self-hosted/rate-limiter.ts
export class InMemoryRateLimiter implements RateLimiter {
  private windows = new Map<string, number[]>();
  private limit: number;
  private windowMs: number;

  constructor(limit: number, windowSeconds: number) {
    this.limit = limit;
    this.windowMs = windowSeconds * 1000;
  }

  async limit(options: { key: string }): Promise<{ success: boolean }> {
    const now = Date.now();
    const key = options.key;
    const timestamps = this.windows.get(key) ?? [];

    // Remove expired entries
    const valid = timestamps.filter(t => now - t < this.windowMs);

    if (valid.length >= this.limit) {
      this.windows.set(key, valid);
      return { success: false };
    }

    valid.push(now);
    this.windows.set(key, valid);
    return { success: true };
  }
}
```

### Adapter Factory

```typescript
// runtime/factory.ts
export function createBindings(config: FeelrConfig): AppBindings {
  if (config.runtime === 'self-hosted') {
    const dataDir = config.storage.data_dir;
    return {
      AUTH_KV: new SqliteKeyValueStore(`${dataDir}/auth.db`),
      USAGE_DB: new SqliteUsageDatabase(`${dataDir}/usage.db`),
      RATE_LIMIT_FREE: new InMemoryRateLimiter(
        config.rate_limits.free.requests_per_minute,
        60
      ),
      RATE_LIMIT_PRO: new InMemoryRateLimiter(
        config.rate_limits.pro.requests_per_minute,
        60
      ),
      RATE_LIMIT_ENTERPRISE: new InMemoryRateLimiter(
        config.rate_limits.enterprise.requests_per_minute,
        60
      ),
      RATE_LIMIT_IP: new InMemoryRateLimiter(100, 10),
      ENCRYPTION_KEY: config.encryption.enabled
        ? process.env.FEELR_ENCRYPTION_KEY!
        : '',
      ADMIN_TOKEN: process.env.FEELR_ADMIN_TOKEN!,
      ENVIRONMENT: 'self-hosted',
      // Token coordinator: handled differently (see below)
    };
  }
  // Cloud: return Cloudflare bindings directly (no wrapping needed
  // since cloud adapters are thin wrappers)
}
```

### s6-overlay Service Definitions

```bash
# self-host/s6/workerd/run
#!/command/with-contenv sh
exec workerd serve /etc/feelr/config.capnp config

# self-host/s6/dashboard/run
#!/command/with-contenv sh
exec node /app/dashboard/server.js
```

### Docker Compose with Caddy Profile

```yaml
# docker-compose.yml
services:
  feelr:
    image: feelr/feelr:latest
    ports:
      - "${FEELR_PORT:-8080}:8080"
    volumes:
      - feelr-data:/data/feelr
      - ./feelr.yaml:/etc/feelr/feelr.yaml:ro
    env_file:
      - .env
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:8080/health"]
      interval: 30s
      timeout: 5s
      retries: 3

  caddy:
    image: caddy:2-alpine
    profiles: ["tls"]
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      - feelr

volumes:
  feelr-data:
  caddy-data:
  caddy-config:
```

### Init Script Structure

```bash
#!/bin/sh
# init.sh - Progressive setup for Feelr self-hosted
set -e

echo "=== Feelr Self-Hosted Setup ==="
echo ""

# Step 1: Essential config (required)
echo "Step 1: Core Configuration"
printf "Admin token (leave empty to auto-generate): "
read -r admin_token
if [ -z "$admin_token" ]; then
  admin_token=$(openssl rand -hex 32)
  echo "Generated admin token: $admin_token"
fi

printf "Encryption key (leave empty to auto-generate): "
read -r encryption_key
if [ -z "$encryption_key" ]; then
  encryption_key=$(openssl rand -hex 32)
  echo "Generated encryption key: $encryption_key"
fi

# Write .env
cat > .env << EOF
FEELR_ADMIN_TOKEN=$admin_token
FEELR_ENCRYPTION_KEY=$encryption_key
EOF

# Step 2: Generate feelr.yaml from template
cp feelr.yaml.template feelr.yaml
echo ""
echo "Generated feelr.yaml with defaults."

# Step 3: Optional connector setup
echo ""
printf "Configure connectors now? (y/N): "
read -r configure_connectors
if [ "$configure_connectors" = "y" ] || [ "$configure_connectors" = "Y" ]; then
  # GitHub PAT
  printf "GitHub Personal Access Token (skip with Enter): "
  read -r github_pat
  if [ -n "$github_pat" ]; then
    echo "GITHUB_TOKEN=$github_pat" >> .env
  fi
  # ... more connectors
fi

echo ""
echo "Setup complete! Run: docker compose up -d"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Miniflare v2 (custom runtime) | Miniflare v3 (workerd-based) | 2023 | Local dev now uses production runtime |
| supervisord for containers | s6-overlay v3 | 2022+ | Container-native, proper shutdown, modern |
| Manual cert management | Caddy auto-TLS | Ongoing | Zero-config HTTPS for self-hosters |
| Separate Docker images per service | Single multi-process image | Trend | Simpler deployment for self-hosted apps |
| workerd in-memory DO only | workerd localDisk DO with SQLite | 2024 | Persistent Durable Objects in standalone workerd |

**Deprecated/outdated:**
- Miniflare v2: Replaced by v3 which uses workerd directly
- supervisord in containers: s6-overlay is the modern alternative
- Docker Compose v2 file format: v3+ is current (though version field is now optional)

## Cloudflare Binding Abstraction Surface

Complete inventory of Cloudflare-specific bindings used by the gateway and their self-hosted replacement strategy:

| Binding | Type | Used In | Self-Hosted Replacement | Complexity |
|---------|------|---------|------------------------|------------|
| `AUTH_KV` | KVNamespace | api-key.ts, credentials.ts, keys.ts, internal.ts | SQLite-backed KeyValueStore | MEDIUM |
| `USAGE_DB` | D1Database | usage-recorder.ts, internal.ts, scheduled.ts | SQLite-backed UsageDatabase | LOW |
| `TOKEN_COORDINATOR` | DurableObjectNamespace | credentials.ts, v1.ts | workerd native DO (localDisk) OR SQLite coordinator | MEDIUM |
| `RATE_LIMIT_FREE/PRO/ENTERPRISE` | RateLimitBinding | rate-limiter.ts | In-memory sliding window | LOW |
| `RATE_LIMIT_IP` | RateLimitBinding | rate-limiter.ts | In-memory sliding window | LOW |
| `ENCRYPTION_KEY` | Worker Secret | crypto.ts, token-coordinator.ts | fromEnvironment capnp binding | LOW |
| `ADMIN_TOKEN` | Worker Secret | keys.ts, admin-auth.ts | fromEnvironment capnp binding | LOW |
| `SLACK_CLIENT_ID/SECRET` | Worker Secret | token-coordinator.ts | fromEnvironment capnp binding | LOW |
| `ENVIRONMENT` | Var | keys.ts | text binding in capnp | LOW |
| `executionCtx.waitUntil` | Runtime API | v1.ts, rate-limiter.ts, api-key.ts | Works natively in workerd | NONE |
| `crypto.subtle` | Web Crypto API | crypto.ts, keys.ts | Works natively in workerd | NONE |
| `ScheduledEvent` | Cron handler | scheduled.ts | workerd supports runScheduled | LOW |
| `DurableObject.alarm()` | DO Alarm | token-coordinator.ts | Works in workerd (in-memory scheduler) | LOW |

## Token Coordination: Recommendation

**Recommendation: Use workerd's native Durable Objects with localDisk storage.**

Rationale:
1. workerd supports `durableObjectStorage = (localDisk = "do-storage")` which persists DO SQLite files to disk
2. The `enableSql` flag allows the SQL storage API that TokenCoordinator already uses
3. DO alarms work in workerd (in-memory scheduler) -- tokens are rescheduled on startup via `blockConcurrencyWhile`
4. This approach requires ZERO changes to the TokenCoordinator code
5. The only gap: alarms are lost on restart. Fix: add a startup scan in the gateway that triggers `scheduleNextRefresh()` on each DO instance

If workerd DO proves unstable in testing, fallback to a SQLite-based token coordinator that implements the same `TokenCoordinatorRpc` interface with WAL-mode SQLite and a polling-based refresh scheduler.

**Confidence: MEDIUM** -- workerd DO with localDisk is documented and supported, but production self-hosting experience is limited. The alarm-on-restart gap is real but easily mitigated.

## Dev Experience: Recommendation

**Recommendation: Restart-on-change (not hot-reload).**

Rationale:
1. workerd doesn't have built-in hot-reload/HMR for worker code
2. For development, `wrangler dev` provides the HMR experience (existing workflow)
3. Self-hosted Docker development should use volume mounts + container restart
4. Keep it simple: `docker compose up --build` for changes

## Process Supervisor: Recommendation

**Recommendation: s6-overlay v3.**

Rationale:
1. Purpose-built for Docker containers (handles PID 1 responsibilities)
2. Proper zombie reaping, signal forwarding, graceful shutdown
3. Service dependency ordering (dashboard waits for workerd to be ready)
4. If workerd crashes, s6-overlay can restart it or exit the container (configurable)
5. v3.2.2.0 is current and stable
6. Used by major projects (LinuxServer.io images, many production containers)

Alternative considered: Running workerd as CMD and dashboard via a background script. This fails because Docker only monitors the foreground process -- if the background dashboard process dies, nobody notices.

## SQLite File Conventions: Recommendation

```
/data/feelr/
  auth.db          # API keys, encrypted credentials (replaces KV)
  auth.db-wal      # WAL file (auto-created)
  usage.db         # Usage analytics, rate limit events (replaces D1)
  usage.db-wal
  config.db        # Runtime config, feature flags (new)
  config.db-wal
  do/              # Durable Object storage (workerd localDisk)
    <unique-key>/  # Per-DO instance SQLite files
```

Separate databases for auth, usage, and config provide:
- Better concurrency (WAL mode per database)
- Independent backup (auth is critical, usage is expendable)
- Clear data lifecycle (usage has retention policy, auth doesn't)

## Open Questions

1. **workerd disk KV service fidelity:** Does the workerd disk service correctly implement `KVNamespace.list({ prefix: '...' })`? Testing is needed. If it does work, we could potentially use it instead of a SQLite KV adapter, but the SQLite approach is safer and more controllable.
   - What we know: The disk service converts KV API calls to HTTP file operations. Get/put map to GET/PUT requests against filenames.
   - What's unclear: Whether list-with-prefix, metadata, and expiration are fully supported.
   - Recommendation: Build the SQLite KV adapter regardless. It's more reliable and testable.

2. **workerd + better-sqlite3 compatibility:** workerd is a V8 runtime separate from Node.js. Native Node.js modules like better-sqlite3 may not load in workerd. The SQLite adapters may need to run in a sidecar Node.js process or be injected as external HTTP services.
   - What we know: workerd uses V8 but is not Node.js. It doesn't support `require()` for native modules.
   - What's unclear: Whether workerd can import Node.js native addons.
   - Recommendation: The adapter layer should run OUTSIDE workerd as a lightweight HTTP service or be compiled to WASM. Alternatively, workerd's built-in SQLite (via DO) could be used for ALL storage, eliminating the need for better-sqlite3 entirely. **This is the recommended approach: use workerd's internal SQLite for everything.**

3. **Cron trigger replacement for self-hosted:** The gateway uses a cron trigger for daily retention cleanup. workerd supports `runScheduled` but there's no built-in cron scheduler in standalone mode.
   - What we know: workerd has the scheduled handler mechanism but no cron trigger equivalent.
   - What's unclear: How to trigger scheduled events in standalone workerd.
   - Recommendation: Use a startup-registered `setInterval` or DO alarm for periodic cleanup. Alternatively, add a `/__scheduled` HTTP endpoint that a cron container or system cron can hit.

## Revised Architecture Insight

**Critical realization from research:** Since better-sqlite3 (a Node.js native module) won't work inside workerd, and the user wants a single image, the architecture should lean into workerd's OWN SQLite capabilities:

1. **KV replacement:** Use a Durable Object with SQL storage as the KV store. A single DO instance with `enableSql` can implement the full KeyValueStore interface using its built-in SQLite.
2. **D1 replacement:** Use another Durable Object with SQL storage for usage data.
3. **Token coordination:** Existing TokenCoordinator DO works as-is with localDisk.
4. **Rate limiting:** Implement in the worker code itself using in-memory Maps (no external dependency needed).

This eliminates the need for any Node.js process for the gateway, keeping everything inside workerd. The only Node.js process is for serving the dashboard static files (or use workerd's disk service for that too).

**This is the cleanest architecture:** workerd handles everything the gateway needs via DOs with SQL storage. The dashboard is served from a disk service or a minimal static file server.

## Sources

### Primary (HIGH confidence)
- [workerd GitHub](https://github.com/cloudflare/workerd) - Configuration schema, version, Docker usage, DO support
- [workerd.capnp schema](https://github.com/cloudflare/workerd/blob/main/src/workerd/server/workerd.capnp) - All binding types, durableObjectStorage options, disk services, fromEnvironment
- [s6-overlay GitHub](https://github.com/just-containers/s6-overlay) - v3.2.2.0, service definitions, Dockerfile setup
- [Docker multi-process docs](https://docs.docker.com/engine/containers/multi-service_container/) - Official guidance on multi-process containers
- [Docker Compose profiles docs](https://docs.docker.com/compose/how-tos/profiles/) - Profile-based conditional services

### Secondary (MEDIUM confidence)
- [WalshyDev/workerd-example](https://github.com/WalshyDev/workerd-example) - KV disk persistence capnp config example
- [Cloudflare blog: wrangler3](https://blog.cloudflare.com/wrangler3/) - Miniflare v3 architecture, workerd integration
- [Cloudflare blog: SQLite in DOs](https://blog.cloudflare.com/sqlite-in-durable-objects/) - DO SQL storage GA
- [confidence.sh self-host guide](https://confidence.sh/blog/how-to-self-host-cloudflare/) - Basic workerd Docker setup
- [Caddy server](https://caddyserver.com/) - Auto-TLS capabilities

### Tertiary (LOW confidence)
- [self-workerd](https://github.com/giuseppelt/self-workerd) - Proof of concept, minimal docs
- [Vorker](https://github.com/VaalaCat/vorker) - Community project, limited production experience
- workerd standalone alarm behavior - Based on GitHub issues, not official docs

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM - workerd is the correct runtime but self-hosting patterns are still emerging
- Architecture (abstraction layer): HIGH - interface+adapters is a well-understood pattern; using workerd's internal SQLite (via DOs) avoids Node.js native module issues
- Architecture (Docker/s6-overlay): HIGH - well-documented, widely used
- Pitfalls: HIGH - identified through codebase analysis and Cloudflare platform knowledge
- Token coordination: MEDIUM - workerd DO with localDisk is supported but alarm persistence has a known gap
- Init script: HIGH - straightforward POSIX sh with here documents

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (30 days -- workerd releases frequently but core patterns are stable)
