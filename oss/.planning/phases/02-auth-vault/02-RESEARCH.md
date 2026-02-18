# Phase 2: Auth Vault - Research

**Researched:** 2026-02-05
**Domain:** Encrypted credential storage, API key management, Durable Objects token coordination on Cloudflare Workers
**Confidence:** HIGH

## Summary

Phase 2 builds the secure credential backbone for Feelr: API key generation/management, encrypted third-party token storage in KV, and a Durable Objects coordinator that serializes token refresh operations across edge locations. The existing Phase 1 gateway already extracts API keys from `X-Feelr-Key` headers (without validation) and passes them through the middleware chain -- Phase 2 upgrades this to real validation against KV-stored key hashes and wires up encrypted credential retrieval for connector actions.

The standard approach uses: (1) prefixed API keys with SHA-256 hashed long tokens stored in KV, (2) AES-256-GCM encryption via Web Crypto API with PBKDF2 key derivation for credential storage, (3) a per-user Durable Object with SQLite storage as the single-writer coordinator for token refresh, using DO alarms for proactive refresh scheduling. No external libraries are needed beyond what the Workers runtime provides natively.

**Primary recommendation:** Use the Workers-native Web Crypto API for all encryption, Cloudflare KV for key/credential storage, and a SQLite-backed Durable Object per user as the token refresh coordinator with alarm-based proactive refresh. Store the master encryption key and admin token as Worker Secrets. Use the Seam-style prefixed API key pattern (prefix + short token + hashed long token) for key management.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### API Key Design
- Key format prefix and structure: Claude's discretion (environment-aware vs single prefix)
- Global keys -- one key accesses all connectors the user has authenticated
- Per-connector scoping deferred to a future enhancement; design storage to support it later
- Soft limit of ~25 keys per user
- Key naming/labels: Claude's discretion (required vs optional)

#### Credential Lifecycle
- Initial credential storage method: Claude's discretion (API-first makes sense since CLI is Phase 4, dashboard Phase 6)
- One credential set per connector per user for now; design storage schema to support multiple later
- Expiry/revocation failure handling: Claude's discretion
- Key revocation vs credential disconnection: Claude's discretion on separation of concerns

#### Token Refresh Behavior
- 3 retries with exponential backoff on refresh failure
- Proactive (eager) refresh -- background check refreshes tokens approaching expiry even without incoming requests
- Concurrent request handling during refresh: Claude's discretion based on DO coordination model
- Failure state after exhausted retries: Claude's discretion

#### Security Boundaries
- Single-user model for Phase 2 -- multi-user isolation comes later (Dashboard phase or beyond)
- Encryption key management: Claude's discretion based on single-user model and Workers capabilities
- Audit logging level: Claude's discretion
- Separate admin mechanism required for credential management (store/delete tokens) -- regular API keys should NOT grant credential management access

#### Specific Ideas
- Admin token separation is a firm requirement -- if a regular API key leaks, it should not expose credential management endpoints
- Storage schema should accommodate future per-connector key scoping and multi-credential per connector, even though neither ships in Phase 2
- Proactive refresh is explicitly preferred over lazy/on-demand -- zero latency hit on the next real request

### Claude's Discretion
- API key prefix format and naming UX
- Credential input flow design (API-first given phase order)
- Failure/disconnection behavior after refresh exhaustion
- Concurrent request handling during active refresh
- Encryption key derivation strategy
- Audit logging scope

### Deferred Ideas (OUT OF SCOPE)
- Per-connector key scoping -- future enhancement after multi-user support
- Multiple credentials per connector (e.g., github/work, github/personal) -- future enhancement
- Multi-user isolation -- Phase 6 (Dashboard) or dedicated phase
- OAuth browser flows -- Phase 5
- CLI `feelr auth` commands -- Phase 4
</user_constraints>

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Web Crypto API | Built-in | AES-256-GCM encryption, PBKDF2 key derivation, SHA-256 hashing | Native to Workers runtime. Zero deps. Significantly faster than JS-based crypto. Supports all required algorithms. |
| Cloudflare KV | Platform | API key storage, encrypted credential storage | High read throughput, sub-ms cached reads, metadata support (1024 bytes), TTL expiration. Ideal for read-heavy auth lookups. |
| Cloudflare Durable Objects | Platform | Token refresh coordination, proactive refresh scheduling | Single-writer guarantee prevents race conditions. SQLite storage for structured state. Built-in alarms for scheduled work. Per-user instance prevents bottlenecks. |
| Hono | ^4.11.7 | Route handlers for auth API endpoints | Already in use from Phase 1. Add new route groups for key management and admin endpoints. |
| Zod | ^3.24.0 | Request validation for auth endpoints | Already in use from Phase 1. Validate key creation/credential storage requests. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `crypto.subtle.timingSafeEqual` | Built-in | Timing-safe comparison for key validation | When comparing API key hashes during authentication. Prevents timing attacks. Workers provides `crypto.subtle.timingSafeEqual()` natively. |
| `crypto.getRandomValues` | Built-in | Cryptographically secure random bytes | API key generation, IV generation, salt generation. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| PBKDF2 for key derivation | HKDF | HKDF is faster (single pass vs 100K iterations) and better suited when the input key material is already high-entropy (like a Worker Secret). PBKDF2 is designed for passwords. **Recommendation: Use HKDF** since the master encryption key is a Worker Secret (already high entropy), not a user password. |
| KV for API keys | D1 (SQLite) | D1 gives relational queries and strong consistency but adds latency for per-request auth lookups. KV's eventually-consistent model is acceptable for API keys (they change rarely). KV metadata stores labels/timestamps without separate queries. |
| KV for encrypted credentials | DO SQLite storage | DO storage is strongly consistent but adds a network hop to the DO instance location. KV with DO as write coordinator gives fast global reads with consistent writes. Best of both worlds. |
| `prefixed-api-key` npm package | Hand-rolled key generation | The npm package is small (~50 lines of logic) and brings a node dependency. The pattern is simple enough to implement with Web Crypto API directly. **Recommendation: Implement the pattern directly** using `crypto.getRandomValues` and `crypto.subtle.digest`. |

**Installation:**
```bash
# No additional packages needed. All functionality is built into the Workers runtime.
# Only wrangler configuration changes are required for KV namespaces and DO bindings.
```

## Architecture Patterns

### Recommended Project Structure
```
apps/gateway/src/
├── auth/                    # NEW: Auth vault module
│   ├── keys.ts              # API key generation, validation, CRUD
│   ├── credentials.ts       # Credential encryption, storage, retrieval
│   ├── crypto.ts            # AES-256-GCM encrypt/decrypt, key derivation
│   └── types.ts             # Auth-specific TypeScript types
├── durable-objects/         # NEW: Durable Object classes
│   └── token-coordinator.ts # Token refresh coordinator DO
├── routes/
│   ├── v1.ts                # Existing connector dispatch routes
│   ├── keys.ts              # NEW: API key management routes
│   └── admin.ts             # NEW: Admin credential management routes
├── middleware/
│   ├── api-key.ts           # MODIFY: Upgrade to real key validation
│   ├── admin-auth.ts        # NEW: Admin token validation middleware
│   └── error-handler.ts     # Existing error handler
├── lib/
│   ├── types.ts             # MODIFY: Add KV, DO bindings to AppEnv
│   ├── envelope.ts          # Existing envelope utilities
│   └── errors.ts            # MODIFY: Add auth-specific error codes
└── index.ts                 # MODIFY: Export DO class, mount new routes
```

### Pattern 1: Prefixed API Key with Hashed Storage

**What:** Generate API keys with a service prefix, a short token (for identification), and a long token (for authentication). Store only the SHA-256 hash of the long token in KV. The full key is shown to the user exactly once at creation time.
**When:** All API key creation and validation.
**Confidence:** HIGH (industry standard pattern used by Stripe, GitHub, Seam, OpenAI)

```typescript
// apps/gateway/src/auth/keys.ts
// Source: Seam prefixed-api-key pattern + Web Crypto API

interface ApiKeyRecord {
  shortToken: string;
  longTokenHash: string;  // SHA-256 hex hash
  label?: string;
  createdAt: string;
  lastUsedAt?: string;
  // Future: scopes?: string[];
}

// Key format: fk_<env>_<shortToken>_<longToken>
// Example:  fk_live_BRTRKs8L_51FwqftsmMDHHbJAMEXXHCgG
// Example:  fk_test_Hx7pQ2mN_9kR3vYzWtLmNpQrStUvWxYz

const KEY_PREFIX = 'fk';
const SHORT_TOKEN_BYTES = 6;  // 8 chars in base62
const LONG_TOKEN_BYTES = 24;  // 32 chars in base62

function generateRandomBase62(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(bytes).map(b => chars[b % 62]).join('');
}

async function hashToken(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function generateApiKey(env: string = 'live', label?: string) {
  const shortToken = generateRandomBase62(SHORT_TOKEN_BYTES);
  const longToken = generateRandomBase62(LONG_TOKEN_BYTES);
  const longTokenHash = await hashToken(longToken);

  const fullKey = `${KEY_PREFIX}_${env}_${shortToken}_${longToken}`;

  const record: ApiKeyRecord = {
    shortToken,
    longTokenHash,
    label,
    createdAt: new Date().toISOString(),
  };

  return { fullKey, record };
}

// KV key structure:
// apikey:<shortToken> -> JSON { longTokenHash, label, createdAt, lastUsedAt }
// apikeys:list -> stored in KV metadata for list operations
```

### Pattern 2: AES-256-GCM Credential Encryption with HKDF Key Derivation

**What:** Derive a per-purpose encryption key from the master secret using HKDF, then encrypt credentials with AES-256-GCM. Each encrypted value includes its own random IV and is self-contained (no external IV storage needed).
**When:** All credential storage and retrieval.
**Confidence:** HIGH (verified via Cloudflare Web Crypto docs and encrypt-workers-kv reference implementation)

```typescript
// apps/gateway/src/auth/crypto.ts
// Source: Web Crypto API docs + encrypt-workers-kv pattern

const HKDF_SALT = new TextEncoder().encode('feelr-credential-encryption-v1');

async function deriveKey(masterSecret: string, info: string): Promise<CryptoKey> {
  // Import the master secret as HKDF key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(masterSecret),
    'HKDF',
    false,
    ['deriveKey']
  );

  // Derive AES-256-GCM key using HKDF
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: HKDF_SALT,
      info: new TextEncoder().encode(info),
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encrypt(
  plaintext: string,
  masterSecret: string,
  purpose: string = 'credential'
): Promise<string> {
  const key = await deriveKey(masterSecret, purpose);
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for AES-GCM

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );

  // Pack: iv (12 bytes) + ciphertext (includes 16-byte auth tag)
  const packed = new Uint8Array(iv.length + ciphertext.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(ciphertext), iv.length);

  // Base64 encode for KV storage
  return btoa(String.fromCharCode(...packed));
}

export async function decrypt(
  encoded: string,
  masterSecret: string,
  purpose: string = 'credential'
): Promise<string> {
  const key = await deriveKey(masterSecret, purpose);

  // Decode base64
  const packed = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));

  // Unpack: iv (12 bytes) + ciphertext
  const iv = packed.slice(0, 12);
  const ciphertext = packed.slice(12);

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(plaintext);
}
```

### Pattern 3: Durable Object Token Refresh Coordinator

**What:** A per-user Durable Object that serializes all token refresh operations and uses alarms for proactive refresh scheduling. Workers read credentials from KV for speed but all refresh writes go through the DO.
**When:** All OAuth token refresh operations.
**Confidence:** HIGH (verified via Cloudflare DO best practices, alarms API, and Hono DO integration example)

```typescript
// apps/gateway/src/durable-objects/token-coordinator.ts
// Source: Cloudflare DO docs, rules of DO best practices

import { DurableObject } from 'cloudflare:workers';

interface TokenState {
  connector: string;
  accessToken: string;       // encrypted
  refreshToken: string;      // encrypted
  expiresAt: number;         // epoch ms
  status: 'active' | 'refreshing' | 'failed';
  retryCount: number;
  lastRefreshAt?: number;
}

export class TokenCoordinator extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Initialize SQLite schema on first instantiation
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS tokens (
          connector TEXT PRIMARY KEY,
          access_token TEXT NOT NULL,
          refresh_token TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          retry_count INTEGER NOT NULL DEFAULT 0,
          last_refresh_at INTEGER,
          created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
        )
      `);
    });
  }

  // Get credentials for a connector, triggering refresh if needed
  async getCredential(connector: string): Promise<TokenState | null> {
    const row = this.ctx.storage.sql.exec(
      'SELECT * FROM tokens WHERE connector = ?', connector
    ).toArray()[0] as TokenState | undefined;

    if (!row) return null;

    // If within 5-minute buffer, trigger proactive refresh
    if (row.expiresAt - Date.now() < 5 * 60 * 1000 && row.status === 'active') {
      // Don't await -- schedule refresh in background via alarm
      await this.scheduleRefresh(connector);
    }

    return row;
  }

  // Store new credentials
  async storeCredential(
    connector: string,
    accessToken: string,
    refreshToken: string,
    expiresAt: number
  ): Promise<void> {
    this.ctx.storage.sql.exec(`
      INSERT OR REPLACE INTO tokens
        (connector, access_token, refresh_token, expires_at, status, retry_count, updated_at)
      VALUES (?, ?, ?, ?, 'active', 0, ?)
    `, connector, accessToken, refreshToken, expiresAt, Date.now());

    // Schedule proactive refresh for 5 minutes before expiry
    await this.scheduleNextRefresh();

    // Write-through to KV for fast global reads
    // (KV write happens in the calling Worker, not the DO)
  }

  // Schedule the next alarm for the earliest expiring token
  private async scheduleNextRefresh(): Promise<void> {
    const row = this.ctx.storage.sql.exec(`
      SELECT MIN(expires_at) as earliest FROM tokens
      WHERE status = 'active' AND refresh_token IS NOT NULL
    `).one() as { earliest: number | null };

    if (row.earliest) {
      const refreshAt = row.earliest - 5 * 60 * 1000; // 5 min before expiry
      const alarmTime = Math.max(refreshAt, Date.now() + 1000); // at least 1s from now
      await this.ctx.storage.setAlarm(alarmTime);
    }
  }

  // Alarm handler: proactive refresh of approaching-expiry tokens
  async alarm(): Promise<void> {
    const buffer = 5 * 60 * 1000;
    const rows = this.ctx.storage.sql.exec(`
      SELECT * FROM tokens
      WHERE status = 'active'
        AND expires_at - ? < ?
        AND refresh_token IS NOT NULL
    `, Date.now(), buffer).toArray();

    for (const row of rows) {
      await this.performRefresh(row as unknown as TokenState);
    }

    // Schedule next alarm
    await this.scheduleNextRefresh();
  }

  private async performRefresh(token: TokenState): Promise<void> {
    if (token.retryCount >= 3) {
      // Mark as failed after 3 retries
      this.ctx.storage.sql.exec(`
        UPDATE tokens SET status = 'failed', updated_at = ?
        WHERE connector = ?
      `, Date.now(), token.connector);
      return;
    }

    this.ctx.storage.sql.exec(`
      UPDATE tokens SET status = 'refreshing', updated_at = ?
      WHERE connector = ?
    `, Date.now(), token.connector);

    try {
      // Actual refresh logic delegated to connector-specific adapter
      // (details TBD in Phase 3/5 when connectors implement refresh)
      // For Phase 2: structure is in place, actual refresh is a stub

      // On success:
      // this.ctx.storage.sql.exec(`
      //   UPDATE tokens SET access_token = ?, refresh_token = ?,
      //     expires_at = ?, status = 'active', retry_count = 0, updated_at = ?
      //   WHERE connector = ?
      // `, newAccessToken, newRefreshToken, newExpiresAt, Date.now(), token.connector);

    } catch (err) {
      // Increment retry count with exponential backoff
      const nextRetryDelay = Math.pow(2, token.retryCount) * 1000; // 1s, 2s, 4s
      this.ctx.storage.sql.exec(`
        UPDATE tokens SET status = 'active', retry_count = retry_count + 1, updated_at = ?
        WHERE connector = ?
      `, Date.now(), token.connector);

      // Schedule retry
      await this.ctx.storage.setAlarm(Date.now() + nextRetryDelay);
    }
  }

  // Remove credentials for a connector
  async removeCredential(connector: string): Promise<void> {
    this.ctx.storage.sql.exec(
      'DELETE FROM tokens WHERE connector = ?', connector
    );
    await this.scheduleNextRefresh();
  }
}
```

### Pattern 4: Admin Token Separation

**What:** Use a static admin token stored as a Worker Secret for credential management endpoints. Regular API keys authenticate connector dispatch only. Admin routes (`/admin/*`) require the admin token in an `Authorization: Bearer <token>` header.
**When:** All credential management operations (store/delete third-party tokens).
**Confidence:** HIGH (standard pattern; Worker Secrets are the correct mechanism for bootstrap credentials)

```typescript
// apps/gateway/src/middleware/admin-auth.ts
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../lib/types';

export const adminAuthMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({
      ok: false,
      error: { code: 'ADMIN_AUTH_REQUIRED', message: 'Admin token required', hint: 'auth' }
    }, 401);
  }

  const token = authHeader.slice(7);
  const expected = c.env.ADMIN_TOKEN;

  // Timing-safe comparison
  const encoder = new TextEncoder();
  const a = encoder.encode(token);
  const b = encoder.encode(expected);

  if (a.byteLength !== b.byteLength) {
    return c.json({
      ok: false,
      error: { code: 'ADMIN_AUTH_INVALID', message: 'Invalid admin token', hint: 'auth' }
    }, 403);
  }

  const isValid = crypto.subtle.timingSafeEqual(a, b);
  if (!isValid) {
    return c.json({
      ok: false,
      error: { code: 'ADMIN_AUTH_INVALID', message: 'Invalid admin token', hint: 'auth' }
    }, 403);
  }

  await next();
});
```

### Pattern 5: KV Key Naming Schema

**What:** Structured key naming that supports current single-user model while allowing future multi-user and multi-credential expansion.
**When:** All KV read/write operations.
**Confidence:** HIGH (standard KV naming convention; verified via Cloudflare KV docs prefix filtering)

```
# API Keys (prefix: apikey:)
apikey:<shortToken>                -> JSON { longTokenHash, label, createdAt, lastUsedAt }

# Encrypted Credentials (prefix: cred:)
cred:<connector>                   -> encrypted JSON { accessToken, refreshToken, expiresAt }

# Future multi-user expansion:
# apikey:<userId>:<shortToken>     -> JSON { ... }
# cred:<userId>:<connector>        -> encrypted JSON { ... }
# cred:<userId>:<connector>:<alias> -> encrypted JSON { ... }

# Metadata for list operations uses KV metadata field (max 1024 bytes per key)
# This avoids separate index keys and reduces KV reads
```

### Anti-Patterns to Avoid

- **Single global Durable Object for all users:** Creates a bottleneck. A single DO handles ~500-1000 req/s. Use one DO per user (user ID as the DO name) so refresh operations are parallelized across users.

- **Storing full API keys in KV:** Only store the SHA-256 hash of the long token. The full key is shown to the user once at creation and never stored server-side. This means a KV data breach does not expose usable keys.

- **Using PBKDF2 with a Worker Secret:** PBKDF2 is designed for low-entropy passwords (100K+ iterations to resist brute force). Worker Secrets are already high-entropy random strings. HKDF is the correct algorithm for deriving multiple keys from a single high-entropy master key -- it is a single-pass operation, much faster than PBKDF2.

- **Reading credentials from DO on every request:** DO instances are located in a single region. Reading from DO on every request adds latency for distant edge locations. Instead, read encrypted credentials from KV (globally cached), and only route through DO for refresh operations.

- **Storing encryption IV separately from ciphertext:** Pack the IV with the ciphertext in a single value. This ensures decryption always has the correct IV and simplifies storage.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Random byte generation | Math.random() based token generation | `crypto.getRandomValues()` | Math.random() is not cryptographically secure. Workers provide crypto.getRandomValues natively. |
| String comparison for auth | `===` for token comparison | `crypto.subtle.timingSafeEqual()` | Regular comparison leaks timing information. Workers provide timing-safe comparison natively. |
| AES key management | Custom key rotation framework | HKDF with purpose-specific `info` parameter | HKDF derives separate keys for separate purposes (encryption, signing) from one master key. Different `info` strings produce independent keys. |
| Alarm scheduling | Custom cron/interval system | Durable Objects Alarms API | Built-in, guaranteed at-least-once execution, automatic retry with exponential backoff (up to 6 retries). |
| Base62/Base58 encoding | Custom encoding function | Simple modulo mapping from random bytes | The encoding does not need a full library. A 3-line function mapping random bytes to a character set is sufficient. |

**Key insight:** The Workers runtime provides every cryptographic primitive needed for this phase. Zero external dependencies are required. The temptation is to reach for npm packages, but the Web Crypto API, KV, and Durable Objects cover everything.

## Common Pitfalls

### Pitfall 1: KV Eventual Consistency on Key Revocation

**What goes wrong:** A user revokes an API key. The KV delete propagates eventually (up to 60 seconds). During propagation, the revoked key continues to work at edge locations that have the old value cached.
**Why it happens:** KV is eventually consistent by design. Deletes and updates take up to 60 seconds to propagate globally.
**How to avoid:** Accept the propagation delay for key revocation (security-acceptable for most use cases -- the key was not compromised, the user chose to revoke it). Document this behavior. For immediate revocation needs (compromised key), maintain a short-lived deny-list in a Durable Object that is checked before KV lookup. Phase 2 scope: accept eventual consistency for revocation; add deny-list in production hardening if needed.
**Warning signs:** User reports "I revoked my key but it still works" within the first minute after revocation.

### Pitfall 2: Alarm Retry Exhaustion Without Notification

**What goes wrong:** DO alarms retry a failed token refresh 6 times (built-in retry) plus the application-level 3 retries. After exhaustion, the token enters a "failed" state. If no request triggers a check, the user has no idea their token is dead until their next API call fails.
**Why it happens:** Proactive refresh runs in background DO alarms. There is no request context to return an error to. The failure is silent.
**How to avoid:** After retry exhaustion, set the token status to `failed` in both DO storage and KV (write-through). The API key validation middleware checks credential status before dispatching to connectors. A `failed` credential returns a clear error: "Credential for {connector} has expired. Re-authenticate to continue." Future: webhook/email notification.
**Warning signs:** Connector calls start failing with auth errors after a period of inactivity.

### Pitfall 3: DO Input Gate Interleaving During Refresh

**What goes wrong:** Multiple concurrent requests hit the DO while a refresh is in progress. The `fetch()` call to the OAuth provider opens the input gate, allowing other requests to interleave. A second request sees `status = 'refreshing'`, doesn't know if the refresh will succeed, and either (a) waits indefinitely or (b) returns stale credentials.
**Why it happens:** Durable Objects pause the input gate during storage operations but open it during non-storage I/O (like `fetch()`). This is documented in the "Rules of Durable Objects" best practices guide.
**How to avoid:** When a request arrives and the token is in `refreshing` status, return the current (possibly stale but not yet expired) access token. The caller uses it optimistically. If the upstream API returns 401, the caller retries once (the refresh should have completed by then). Track `refreshing` status with a timestamp; if a refresh has been in progress for more than 30 seconds, assume it failed and allow a new attempt.
**Warning signs:** Occasional 401 errors from upstream APIs during high-concurrency periods, followed by success on retry.

### Pitfall 4: Encoding Issues with Base64 in Workers

**What goes wrong:** Using `btoa()`/`atob()` with binary data that contains characters outside the Latin1 range. Workers' `btoa()` expects a binary string where each character is a single byte.
**Why it happens:** `btoa()` works with Latin1 strings, not arbitrary binary. If you try to base64-encode a string with multi-byte characters, it throws.
**How to avoid:** Always work with `Uint8Array` for crypto operations. Convert to/from base64 using the byte-level pattern: `btoa(String.fromCharCode(...uint8Array))` for encoding and `Uint8Array.from(atob(str), c => c.charCodeAt(0))` for decoding. This is safe because the input is always raw bytes, never multi-byte text.
**Warning signs:** Intermittent "The string to be encoded contains characters outside of the Latin1 range" errors.

### Pitfall 5: KV Metadata Size Limit (1024 bytes)

**What goes wrong:** Storing too much metadata on a KV key. The metadata field is limited to 1024 bytes when serialized as JSON. Adding future fields (scopes array, permissions, audit trail) can exceed this limit.
**Why it happens:** Metadata starts small (label, timestamp) and grows as features are added.
**How to avoid:** Keep KV metadata lean: only store fields needed for list/filter operations (label, createdAt, connector association). Store the full record as the KV value (JSON string), with metadata duplicating only the fields needed for the `list()` operation.
**Warning signs:** KV put operations start failing with size limit errors after adding new metadata fields.

## Code Examples

Verified patterns from official sources:

### Wrangler Configuration for KV + DO

```toml
# apps/gateway/wrangler.toml
name = "feelr-gateway"
main = "src/index.ts"
compatibility_date = "2026-02-05"

[vars]
ENVIRONMENT = "development"

# KV Namespaces
[[kv_namespaces]]
binding = "AUTH_KV"
id = "<created-via-wrangler-kv-namespace-create>"

# Durable Objects
[durable_objects]
bindings = [
  { name = "TOKEN_COORDINATOR", class_name = "TokenCoordinator" }
]

[[migrations]]
tag = "v1"
new_sqlite_classes = ["TokenCoordinator"]
```

```bash
# Create KV namespace
npx wrangler kv namespace create AUTH_KV
# Note the binding ID, add to wrangler.toml

# Create preview KV namespace for local dev
npx wrangler kv namespace create AUTH_KV --preview

# Set secrets
npx wrangler secret put ENCRYPTION_KEY
npx wrangler secret put ADMIN_TOKEN
```

### Updated AppEnv Type

```typescript
// apps/gateway/src/lib/types.ts
import type { Env } from 'hono';

export interface AppEnv extends Env {
  Bindings: {
    ENVIRONMENT: string;
    AUTH_KV: KVNamespace;
    TOKEN_COORDINATOR: DurableObjectNamespace;
    ENCRYPTION_KEY: string;  // Worker Secret
    ADMIN_TOKEN: string;     // Worker Secret
  };
  Variables: {
    requestId: string;
    apiKey: string | null;
    // Phase 2 additions:
    apiKeyRecord?: ApiKeyRecord;  // Populated after key validation
  };
}
```

### API Key Validation Middleware (Upgraded from Phase 1)

```typescript
// apps/gateway/src/middleware/api-key.ts
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../lib/types';
import { FeelrError } from '../lib/errors';

export const apiKeyMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set('requestId', requestId);

  // Extract API key: header takes priority over query param
  const headerKey = c.req.header('X-Feelr-Key') ?? null;
  const queryKey = new URL(c.req.url).searchParams.get('key');
  const apiKey = headerKey ?? queryKey;

  if (!apiKey) {
    throw new FeelrError('AUTH_REQUIRED', {
      message: 'API key required. Include X-Feelr-Key header or ?key= parameter.',
      hint: 'auth',
      status: 401,
    });
  }

  c.set('apiKey', apiKey);

  // Parse key components: fk_<env>_<shortToken>_<longToken>
  const parts = apiKey.split('_');
  if (parts.length !== 4 || parts[0] !== 'fk') {
    throw new FeelrError('AUTH_INVALID', {
      message: 'Invalid API key format.',
      hint: 'auth',
      status: 401,
    });
  }

  const [, , shortToken, longToken] = parts;

  // Look up key record by short token
  const record = await c.env.AUTH_KV.get(`apikey:${shortToken}`, 'json');
  if (!record) {
    throw new FeelrError('AUTH_INVALID', {
      message: 'API key not found.',
      hint: 'auth',
      status: 401,
    });
  }

  // Hash the provided long token and compare
  const encoded = new TextEncoder().encode(longToken);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const longTokenHash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Timing-safe comparison of hashes
  const a = new TextEncoder().encode(longTokenHash);
  const b = new TextEncoder().encode(record.longTokenHash);
  if (a.byteLength !== b.byteLength || !crypto.subtle.timingSafeEqual(a, b)) {
    throw new FeelrError('AUTH_INVALID', {
      message: 'Invalid API key.',
      hint: 'auth',
      status: 401,
    });
  }

  c.set('apiKeyRecord', record);

  await next();
});
```

### Credential Storage via Admin Endpoint

```typescript
// apps/gateway/src/routes/admin.ts
import { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';
import type { AppEnv } from '../lib/types';
import { encrypt } from '../auth/crypto';
import { adminAuthMiddleware } from '../middleware/admin-auth';

const admin = new OpenAPIHono<AppEnv>();

// All admin routes require admin token
admin.use('*', adminAuthMiddleware);

// Store credentials for a connector
admin.post('/credentials/:connector', async (c) => {
  const connector = c.req.param('connector');
  const body = await c.req.json();

  // Validate input
  const schema = z.object({
    access_token: z.string().min(1),
    refresh_token: z.string().optional(),
    expires_at: z.number().optional(), // epoch ms
  });
  const parsed = schema.parse(body);

  // Encrypt credentials
  const credentialPayload = JSON.stringify({
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token ?? null,
    expiresAt: parsed.expires_at ?? null,
  });

  const encrypted = await encrypt(credentialPayload, c.env.ENCRYPTION_KEY);

  // Store in KV
  await c.env.AUTH_KV.put(`cred:${connector}`, encrypted);

  // If token has expiry, register with DO for proactive refresh
  if (parsed.expires_at && parsed.refresh_token) {
    const id = c.env.TOKEN_COORDINATOR.idFromName('default'); // single-user
    const stub = c.env.TOKEN_COORDINATOR.get(id);
    await stub.storeCredential(
      connector,
      encrypted,  // store encrypted form
      encrypted,  // refresh token also encrypted
      parsed.expires_at
    );
  }

  return c.json({
    ok: true,
    data: { connector, status: 'stored' },
    meta: { request_id: c.get('requestId') },
  });
});

export { admin as adminRoutes };
```

### Vitest Configuration for Testing with KV + DO

```typescript
// apps/gateway/vitest.config.ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          kvNamespaces: ['AUTH_KV'],
          // DO bindings are read from wrangler.toml automatically
        },
      },
    },
  },
});
```

### Testing DO Token Coordinator

```typescript
// apps/gateway/src/__tests__/token-coordinator.test.ts
import { env, runInDurableObject, runDurableObjectAlarm } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('TokenCoordinator', () => {
  it('should store and retrieve credentials', async () => {
    const id = env.TOKEN_COORDINATOR.idFromName('test-user');
    const stub = env.TOKEN_COORDINATOR.get(id);

    await stub.storeCredential(
      'github',
      'encrypted-access-token',
      'encrypted-refresh-token',
      Date.now() + 3600000 // 1 hour
    );

    const cred = await stub.getCredential('github');
    expect(cred).toBeTruthy();
    expect(cred!.connector).toBe('github');
    expect(cred!.status).toBe('active');
  });

  it('should schedule alarm for proactive refresh', async () => {
    const id = env.TOKEN_COORDINATOR.idFromName('test-user-alarm');
    const stub = env.TOKEN_COORDINATOR.get(id);

    await stub.storeCredential(
      'github',
      'encrypted-access-token',
      'encrypted-refresh-token',
      Date.now() + 3 * 60 * 1000 // 3 minutes (within 5-min buffer)
    );

    // Verify alarm was scheduled
    await runInDurableObject(stub, async (instance, state) => {
      const alarm = await state.storage.getAlarm();
      expect(alarm).toBeTruthy();
    });
  });

  it('should trigger alarm and attempt refresh', async () => {
    const id = env.TOKEN_COORDINATOR.idFromName('test-user-refresh');
    const stub = env.TOKEN_COORDINATOR.get(id);

    await stub.storeCredential(
      'github',
      'encrypted-access-token',
      'encrypted-refresh-token',
      Date.now() + 2 * 60 * 1000 // 2 minutes
    );

    // Trigger alarm immediately
    const alarmRan = await runDurableObjectAlarm(stub);
    expect(alarmRan).toBe(true);
  });

  it('should isolate different user coordinators', async () => {
    const stub1 = env.TOKEN_COORDINATOR.get(
      env.TOKEN_COORDINATOR.idFromName('user-1')
    );
    const stub2 = env.TOKEN_COORDINATOR.get(
      env.TOKEN_COORDINATOR.idFromName('user-2')
    );

    await stub1.storeCredential('github', 'enc1', 'ref1', Date.now() + 3600000);
    await stub2.storeCredential('slack', 'enc2', 'ref2', Date.now() + 3600000);

    expect(await stub1.getCredential('github')).toBeTruthy();
    expect(await stub1.getCredential('slack')).toBeNull();
    expect(await stub2.getCredential('slack')).toBeTruthy();
    expect(await stub2.getCredential('github')).toBeNull();
  });
});
```

## Discretion Recommendations

Based on research, here are recommendations for areas marked as Claude's discretion:

### API Key Prefix Format

**Recommendation:** `fk_<env>_<shortToken>_<longToken>`

- `fk` = "Feelr Key" -- unique prefix for GitHub secret scanning detection
- `<env>` = `live` or `test` -- environment-aware to prevent accidental production use
- `<shortToken>` = 8 chars (base62) -- visible in dashboards, logs, for identification
- `<longToken>` = 32 chars (base62) -- the secret portion, SHA-256 hashed for storage

Example: `fk_live_BRTRKs8L_51FwqftsmMDHHbJAMEXXHCgG`

**Confidence:** HIGH -- matches Stripe/GitHub/OpenAI patterns.

### Key Naming/Labels

**Recommendation:** Optional labels with a reasonable default.

- Labels are optional at creation time
- If omitted, auto-generate a sequential name: "Key 1", "Key 2", etc.
- Labels appear in list output and help users distinguish keys by purpose

**Confidence:** MEDIUM -- standard UX pattern.

### Credential Input Flow Design

**Recommendation:** API-first via admin endpoints.

- `POST /admin/credentials/:connector` stores credentials
- `GET /admin/credentials` lists connected connectors (no secrets in response)
- `DELETE /admin/credentials/:connector` removes credentials
- Admin endpoints require `Authorization: Bearer <ADMIN_TOKEN>` header
- This works perfectly for the Phase 4 CLI (`feelr auth` calls these endpoints)
- Dashboard (Phase 6) also calls these endpoints

**Confidence:** HIGH -- natural API-first approach given phase ordering.

### Failure/Disconnection Behavior After Refresh Exhaustion

**Recommendation:** Mark credential as `failed` and return a clear error with re-auth instructions.

- After 3 retries with exponential backoff (1s, 2s, 4s), mark token status as `failed`
- Connector dispatch checks credential status before calling upstream
- `failed` status returns: `{ code: 'CREDENTIAL_EXPIRED', message: 'Credential for {connector} has expired. Store new credentials via admin API.', hint: 'auth' }`
- Credential remains in storage (not deleted) so the user can see what needs re-auth
- A new `POST /admin/credentials/:connector` overwrites the failed credential

**Confidence:** HIGH -- graceful degradation pattern.

### Concurrent Request Handling During Active Refresh

**Recommendation:** Optimistic stale-token serving with retry-on-401.

- When credential status is `refreshing` in the DO, return the current (stale but possibly still valid) access token
- If the upstream API returns 401, the gateway retries once after a short delay (500ms) to allow the refresh to complete
- If the second attempt also fails, return an error to the caller
- This avoids blocking concurrent requests during refresh (which would increase latency)

**Confidence:** MEDIUM -- tradeoff between correctness and latency. The optimistic approach is simpler and faster; blocking would be correct but slow.

### Encryption Key Derivation Strategy

**Recommendation:** Single Worker Secret master key + HKDF with purpose-specific `info` strings.

- One secret: `ENCRYPTION_KEY` (generated as 32+ bytes of random hex)
- HKDF derives separate keys per purpose: `deriveKey(master, 'credential-encryption')`, `deriveKey(master, 'admin-token-signing')`, etc.
- HKDF uses a static salt (hardcoded in code, not secret) and the `info` parameter for domain separation
- Key rotation: generate a new `ENCRYPTION_KEY`, re-encrypt all credentials in a migration script. HKDF makes this clean -- same code, new master key.

**Confidence:** HIGH -- HKDF is the correct algorithm for high-entropy master keys (RFC 5869). PBKDF2 would be wasted cycles.

### Audit Logging Scope

**Recommendation:** Console-based structured logging for Phase 2; defer persistent audit log.

- Log all auth events as structured JSON via `console.log()`: key creation, key revocation, credential storage, credential access, refresh attempts, refresh failures
- Each log entry includes: timestamp, event type, request ID, connector (if applicable), outcome (success/failure)
- Workers automatically captures `console.log()` output in Workers Analytics and `wrangler tail`
- Persistent audit log (D1 table) deferred to production hardening phase
- This is sufficient for a single-user model; multi-user audit trails need D1

**Confidence:** MEDIUM -- adequate for Phase 2 single-user scope, will need D1 for production.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Durable Objects KV-style storage only | SQLite-backed DOs with `sql.exec()` | GA in 2025 | Use SQL for structured state. KV still works but SQL is recommended for new DOs. |
| `DurableObjectStub.fetch()` for communication | RPC methods (typed, direct method calls) | Compatibility date 2024-04-03+ | No more HTTP request/response parsing. Direct method calls with TypeScript types. |
| `DurableObject` constructor takes `(state, env)` | `DurableObject` extends base class with `super(ctx, env)` | 2025 | Use `extends DurableObject<Env>` pattern for typed access. |
| PBKDF2 for all key derivation | HKDF for high-entropy sources, PBKDF2 for passwords | Always (but often confused) | Use HKDF when master key is already high-entropy. PBKDF2 only for user passwords. |
| Separate fetch handler pattern in DO | RPC methods as primary interface | Compatibility date 2024-04-03+ | Better developer experience, TypeScript type safety, no manual request parsing. |

**Deprecated/outdated:**
- `DurableObjectStub.fetch()`: Still works but RPC methods are preferred for new code
- KV-only Durable Objects: SQLite-backed is recommended for all new DOs (use `new_sqlite_classes` in migrations)
- `new_classes` migration tag: Use `new_sqlite_classes` instead

## Open Questions

Things that could not be fully resolved:

1. **Token refresh for static API key connectors (Stripe, GitHub PAT)**
   - What we know: Stripe uses long-lived API keys, GitHub PATs do not expire (unless configured to). These do not need refresh.
   - What's unclear: How to distinguish "refreshable" credentials from "static" credentials in the storage schema.
   - Recommendation: The `refresh_token` field being `null` indicates a non-refreshable credential. The `expires_at` field being `null` indicates no expiry. The DO alarm only schedules for tokens with both fields populated.

2. **KV write rate limit for credential updates**
   - What we know: KV has a 1 write/second limit per key. Token refresh rewrites the credential key.
   - What's unclear: Whether rapid retry of a failed refresh could hit this limit.
   - Recommendation: Exponential backoff (1s, 2s, 4s) naturally stays under the 1 write/sec limit. This is a non-issue for normal operation.

3. **DO instance location and credential decryption latency**
   - What we know: DO instances are located in a single region (closest to first request or location hint). Credential reads from KV are globally cached. But credential writes (refresh) go through the DO.
   - What's unclear: Whether DO refresh latency is acceptable for users far from the DO location.
   - Recommendation: Proactive refresh (via alarm) means the refresh happens in the background, not in the request path. Users always read from KV. The DO location is irrelevant for read latency.

4. **`crypto.subtle.timingSafeEqual()` availability**
   - What we know: The Cloudflare Workers Web Crypto docs mention `timingSafeEqual()` as a non-standard extension.
   - What's unclear: Whether it's available in all compatibility dates.
   - Recommendation: Test during implementation. If not available, implement manually using constant-time XOR comparison of byte arrays. HIGH confidence it exists based on docs.

## Sources

### Primary (HIGH confidence)
- [Cloudflare Durable Objects Best Practices / Rules](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/) -- single-writer pattern, naming, RPC, storage guidance
- [Cloudflare Durable Objects Alarms API](https://developers.cloudflare.com/durable-objects/api/alarms/) -- scheduling, retry behavior, alarm handler
- [Cloudflare Durable Objects Storage API](https://developers.cloudflare.com/durable-objects/api/storage-api/) -- SQL methods, KV methods, transactions, guarantees
- [Cloudflare Workers Web Crypto API](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/) -- AES-GCM, PBKDF2, HKDF, SHA-256, timingSafeEqual
- [Cloudflare KV Write Operations](https://developers.cloudflare.com/kv/api/write-key-value-pairs/) -- put signature, metadata, TTL, rate limits
- [Cloudflare KV Read Operations](https://developers.cloudflare.com/kv/api/read-key-value-pairs/) -- get, getWithMetadata, caching behavior
- [Cloudflare KV List Operations](https://developers.cloudflare.com/kv/api/list-keys/) -- prefix filtering, cursor pagination, metadata in results
- [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/) -- secret creation, access in code, local dev setup
- [Cloudflare Testing Durable Objects with Vitest](https://developers.cloudflare.com/durable-objects/examples/testing-with-durable-objects/) -- test setup, runInDurableObject, alarm testing
- [Hono Cloudflare Durable Objects Example](https://hono.dev/examples/cloudflare-durable-objects) -- DO class with Hono, RPC pattern, wrangler config

### Secondary (MEDIUM confidence)
- [Seam Prefixed API Key pattern](https://github.com/seamapi/prefixed-api-key) -- short token + hashed long token pattern, base58 encoding
- [API Keys Best Practices (Mergify)](https://articles.mergify.com/api-keys-best-practice/) -- prefix conventions, hash storage, lifecycle management
- [API Key Design (Glama)](https://glama.ai/blog/2024-10-18-what-makes-a-good-api-key) -- prefix format, entropy, secret scanning
- [encrypt-workers-kv (GitHub)](https://github.com/bradyjoslin/encrypt-workers-kv) -- AES-GCM + PBKDF2 reference implementation for KV encryption
- [Cloudflare DO Control/Data Plane Pattern](https://developers.cloudflare.com/reference-architecture/diagrams/storage/durable-object-control-data-plane-pattern/) -- coordinator architecture reference

### Tertiary (LOW confidence)
- None -- all findings verified against primary or secondary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all components are platform-native (Web Crypto, KV, DO), no external dependencies needed
- Architecture: HIGH -- patterns verified via official Cloudflare docs, best practices guide, and Hono integration examples
- Pitfalls: HIGH -- KV consistency and DO interleaving documented in official docs; token refresh race conditions verified via Nango research from initial project pitfalls research
- Discretion recommendations: MEDIUM-HIGH -- based on industry patterns (Stripe, GitHub key format) and platform capabilities

**Research date:** 2026-02-05
**Valid until:** 2026-03-05 (30 days -- platform APIs are stable)
