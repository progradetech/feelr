# Pitfalls Research

**Domain:** Agent-friendly API simplification layer (API gateway + CLI + dashboard + connector ecosystem)
**Researched:** 2026-02-05
**Confidence:** HIGH (verified against official Cloudflare docs, Nango OAuth research, and multiple community sources)

## Critical Pitfalls

### Pitfall 1: Using Cloudflare KV as a Token/Credential Store Without Understanding Consistency Limits

**What goes wrong:**
Cloudflare KV is eventually consistent with up to 60+ seconds of propagation delay across global locations. The official documentation explicitly states KV "is not ideal for applications where you need support for atomic operations" and values "cannot be read and written in a single transaction." When an OAuth token is refreshed and written to KV, a concurrent request from a different Cloudflare edge location may read the stale (expired) token, trigger an unnecessary re-auth or API failure, and potentially overwrite the freshly refreshed token with a second refresh -- losing the valid refresh token entirely.

**Why it happens:**
KV is Cloudflare's most well-known storage product and the natural first choice. Its documentation even lists "credentials (API keys)" as a use case. However, static API keys that rarely change are fundamentally different from OAuth tokens that rotate every 30-60 minutes. The documentation buries the consistency caveat deep in the "How KV works" page rather than surfacing it prominently in the use-case recommendations.

**How to avoid:**
- Use KV only for static credentials (API keys that do not rotate) and configuration data.
- For OAuth tokens that rotate, use one of two strategies:
  1. **Durable Objects as token coordinator:** Each user's token set lives in a Durable Object that provides strongly consistent, transactional storage. Workers read tokens from KV for speed, but all writes and refreshes go through the Durable Object, which then writes-through to KV. This gives you read-your-own-write consistency from the DO and global eventual read from KV.
  2. **External token store via Hyperdrive:** Store tokens in a Postgres database (Neon, Supabase) accessed via Hyperdrive. This gives ACID consistency but adds latency.
- Encrypt all stored tokens at the application layer using AES-256-GCM via the Web Crypto API, regardless of storage backend, because KV's account-level access scoping means anyone with Workers access in the account can read all KV namespaces.

**Warning signs:**
- OAuth flows work in dev (single location) but fail intermittently in production (multi-location)
- Sporadic "invalid_grant" errors from providers after token refresh
- Users randomly forced to re-authenticate despite tokens not being expired
- Race condition manifests only under concurrent requests for the same user

**Phase to address:**
Phase 1 (Core Gateway + Auth Vault) -- this is a foundational architecture decision that cannot be retrofitted without rewriting the entire auth layer.

---

### Pitfall 2: OAuth Provider Quirks Treated as Standard Deviations Rather Than Fundamental Design Constraints

**What goes wrong:**
Teams implement a single generic OAuth flow and expect minor parameter tweaks per provider. In reality, OAuth providers deviate from the standard in incompatible, undocumented, and sometimes contradictory ways. Verified examples from Nango's research across 50+ APIs:

- **Slack** rejects `http://localhost` redirect URIs even for development; requires HTTPS. Also implements separate `user_scopes` parameter distinct from standard `scope` (bot vs. user auth).
- **Discord** follows the standard more closely but has unique rate limiting on token endpoints and requires bot token + OAuth token management as separate concepts.
- **LinkedIn** breaks entirely if you include optional PKCE parameters, returning vague "invalid OAuth request" errors.
- **Notion** eliminates the standard `scope` parameter entirely, replacing it with "capabilities" configured at app registration. Token requests must use JSON instead of standard `x-www-url-form-encoded`.
- **Salesforce** omits access token expiration time from token responses, requiring a separate endpoint query.
- **Shopify/Zendesk** require dynamic subdomain-based authorization URLs per customer.

**Why it happens:**
OAuth 2.0 is a framework, not a strict protocol. RFC 6749 leaves most implementation details to providers. Each provider implements "the parts they think they need" and adds proprietary extensions. Teams building multi-provider OAuth read the RFC, build a generic flow, and then discover each provider needs its own adapter -- after already shipping.

**How to avoid:**
- Design the connector auth layer as a provider-specific adapter system from day one. Each provider gets its own auth module with:
  - Custom authorization URL construction
  - Custom token request format (headers vs. body, JSON vs. form-encoded)
  - Custom scope handling (or lack thereof)
  - Custom token response parsing (some return extra fields like `realmID`, `instance_url`)
  - Custom refresh behavior (new refresh token issued vs. same token reused)
- Build a test harness that exercises the full OAuth flow (authorize, callback, token exchange, refresh, revoke) per provider before marking a connector as "done."
- For Feelr's initial 4 connectors: GitHub uses personal access tokens (simple), Stripe uses API keys (simple), but Slack and Discord use full OAuth with distinct quirks. Budget 2-3x more time for Slack/Discord auth than GitHub/Stripe auth.

**Warning signs:**
- Auth works for Provider A but silently fails for Provider B
- Generic "invalid request" errors from providers with no clear cause
- Token refresh works for one provider but not another
- Users report needing to re-authenticate on one provider but not others

**Phase to address:**
Phase 1 (Core Gateway + Auth Vault) -- the auth adapter architecture must be designed before any connector is built. Phase 2 (Connector SDK) should formalize this into the connector development contract.

---

### Pitfall 3: Cloudflare Workers Free Tier is Unsuitable for an API Gateway

**What goes wrong:**
The free tier imposes a 10ms CPU time limit per request. For an API gateway that needs to: parse the incoming request, look up auth credentials from KV, decrypt them, construct the upstream API request, and serialize the response -- 10ms of CPU time is razor thin. Any JSON parsing of a moderately complex response, any encryption/decryption operation, or any response transformation will exceed this. The Worker throws a 1102 error and the request fails silently. There is no graceful degradation.

Additionally, the free tier is limited to 100,000 requests/day and 50 subrequests per request. A single composable action that chains 3 API calls already uses 3 of your 50 subrequests, and the daily request cap means roughly 1.15 requests/second sustained -- inadequate for any production use.

**Why it happens:**
Teams prototype on the free tier, everything works because test payloads are small and there is no concurrent load. When real users arrive with real payloads, the 10ms wall hits hard. The paid tier jumps to 5 minutes of CPU time (a 30,000x increase), but teams often delay the upgrade thinking "we'll optimize later."

**How to avoid:**
- Start development on the Workers Paid plan ($5/month). This is non-negotiable for an API gateway.
- Design all response handling to stream rather than buffer. Use `TransformStream` and avoid `response.json()` on large payloads.
- Monitor CPU time per request from day one using Workers Analytics. Set alerts at 50% of your CPU budget.
- For composable actions: count subrequests at composition time and reject compositions that would exceed 1,000 subrequests per request (paid tier limit).

**Warning signs:**
- Sporadic 1102 errors in production
- Requests fail only for large API responses
- Composable actions fail for complex chains but work for simple ones
- "Works on my machine" because local development uses Miniflare with no CPU limits

**Phase to address:**
Phase 0 (Project Setup) -- configure the paid Workers plan before writing any code. Phase 1 should include CPU time monitoring as part of the observability setup.

---

### Pitfall 4: Response Normalization That Destroys Information Needed by AI Agents

**What goes wrong:**
The core value proposition of Feelr is simplifying APIs for AI agents. Teams aggressively flatten nested JSON, strip metadata, and normalize field names -- destroying information that agents actually need. Common examples:

- Stripping pagination cursors/metadata, so agents cannot paginate through results
- Flattening nested objects (e.g., `user.profile.avatar_url` becomes `user_profile_avatar_url`) which loses the semantic structure agents use to understand relationships
- Removing null/empty fields, which hides the schema from agents that need to know what fields exist
- Normalizing error responses so heavily that the original error code/message from the upstream API is lost
- Dropping HTTP headers from upstream responses that contain rate limit information, retry-after hints, or deprecation warnings

**Why it happens:**
"Simplification" is interpreted as "make it smaller" rather than "make it predictable." The goal should be consistent structure and predictable schema, not minimal data. AI agents are not humans -- they handle verbose, well-structured data far better than minimal, lossy data.

**How to avoid:**
- Define normalization as "consistent envelope + predictable schema" not "fewer fields":
  ```json
  {
    "data": { ... },           // Full response, structure-preserved
    "meta": {
      "pagination": { ... },   // Always present, standardized format
      "rate_limit": { ... },   // Always present, standardized format
      "upstream": {
        "status": 200,
        "headers": { ... }     // Selected upstream headers preserved
      }
    }
  }
  ```
- Never flatten nested objects. Instead, document the schema per connector so agents know what to expect.
- Always include pagination metadata in a standardized format, even if the upstream API uses cursors, page numbers, or link headers.
- Preserve upstream error codes alongside your normalized error codes.
- Build a "raw mode" escape hatch that returns the upstream response as-is for agents that need it.

**Warning signs:**
- Agents cannot paginate through results (pagination metadata was stripped)
- Agents fail to handle edge cases because error detail was normalized away
- Users request "raw response" access, meaning your normalization is too lossy
- Rate limiting information is invisible to agents, causing them to get rate-limited upstream

**Phase to address:**
Phase 1 (Core Gateway) -- the response envelope format must be defined before any connector is built. Phase 2 (Connector SDK) should enforce it as a contract.

---

### Pitfall 5: Connector SDK That is Tightly Coupled to Cloudflare Workers Runtime

**What goes wrong:**
The connector SDK is designed around Cloudflare Workers APIs (KV bindings, `fetch` with CF-specific options, `ctx.waitUntil`, etc.). When the self-hosted version needs to run on Node.js or Bun without Cloudflare infrastructure, every connector breaks. Alternatively, community contributors cannot develop or test connectors without a Cloudflare account.

**Why it happens:**
It is natural to use the platform's native APIs directly. Workers bindings for KV, DO, and other services are convenient and performant. But embedding platform-specific APIs in the connector interface means every connector is a Cloudflare Worker, not a portable module.

**How to avoid:**
- Define the connector SDK interface using only Web Standard APIs (fetch, Request, Response, crypto, streams). This is Hono's philosophy and it works.
- Abstract all platform-specific operations behind interfaces:
  ```typescript
  interface CredentialStore {
    get(userId: string, provider: string): Promise<Credentials>;
    set(userId: string, provider: string, creds: Credentials): Promise<void>;
  }

  interface ConnectorContext {
    credentials: CredentialStore;
    fetch: typeof fetch;  // Standard fetch, not CF-specific
    log: Logger;
  }
  ```
- Provide two implementations of the platform interfaces: one for Cloudflare (using KV/DO bindings) and one for self-hosted (using local storage/database).
- Test connectors against the interface, not the implementation. Connectors should be testable with `vitest` without `wrangler`.

**Warning signs:**
- Connectors import from `@cloudflare/workers-types` directly
- Connector tests require `wrangler dev` to run
- Community contributors report they cannot test connectors locally
- Self-hosted mode requires rewriting connectors rather than swapping the platform layer

**Phase to address:**
Phase 2 (Connector SDK) -- this is the defining design decision of the SDK. Must be settled before the first community connector is accepted.

---

### Pitfall 6: OAuth Token Refresh Race Conditions in a Distributed Edge Environment

**What goes wrong:**
Multiple concurrent API requests for the same user hit different Cloudflare edge locations. Two requests simultaneously detect an expired token and both attempt to refresh. Provider A issues a new refresh token with each refresh (Slack, Discord do this). Request 1 gets new refresh token R1, Request 2 gets new refresh token R2 (invalidating R1). Request 1 writes R1 to storage. Request 2 overwrites with R2. Now R1 is stored but R2 (the only valid one) is lost. All subsequent refreshes fail. User must re-authenticate.

This is the "thundering herd on token refresh" problem, and it is especially severe on Cloudflare Workers because requests are distributed globally by design.

**Why it happens:**
Edge computing distributes requests to the nearest point of presence. There is no single process to serialize token refreshes through. Standard in-memory locking (Map/Mutex) does not work because each edge location runs in its own isolate.

**How to avoid:**
- Use a Durable Object as the single point of serialization for token refreshes per user. All refresh operations route through the user's DO, which guarantees single-writer semantics.
- Implement a "refresh lock" pattern: when a Worker detects an expired token, it sends a refresh request to the user's DO. The DO checks if a refresh is already in progress, and if so, returns the pending result rather than starting a second refresh.
- Add a token TTL buffer: refresh tokens 5 minutes before actual expiry to avoid the "expired in transit" race window.
- Implement 401 retry logic: if an API call returns 401, attempt one refresh-and-retry before failing. This handles the case where a token expired between read and use.
- Cache refreshed tokens in the Worker's isolate for 1-2 minutes to avoid hitting the DO for every request.

**Warning signs:**
- Users report intermittent "please re-authenticate" prompts
- Provider dashboards show duplicate token refresh calls
- Token refresh errors spike during high-traffic periods
- "invalid_grant" errors in logs from OAuth providers

**Phase to address:**
Phase 1 (Auth Vault) -- the Durable Object token coordinator must be implemented alongside the initial auth flow. Cannot be added later without a rewrite.

---

### Pitfall 7: Composable Actions Becoming a Turing-Complete Workflow Engine

**What goes wrong:**
The composable action system starts with simple chaining ("get GitHub issues, then post to Slack"). Feature requests arrive: conditional branching, loops, error handling per step, variable scoping, retry policies per step, parallel execution. Before long, you have built a workflow engine (Temporal/Inngest competitor) inside a Cloudflare Worker with a 5-minute CPU limit and 128MB memory cap. The action definition DSL becomes its own programming language that is harder to use than the APIs it was supposed to simplify.

**Why it happens:**
Every individual feature request is reasonable. "I need to post to Slack only if the issue is critical" (conditional). "I need to create issues for each item in a list" (loop). "I need to retry if Slack rate-limits me" (retry policy). Each addition is small. The aggregate is a monster.

**How to avoid:**
- Define a strict complexity ceiling for v1 composable actions:
  - Sequential steps only (no parallel execution)
  - Data passing from step N output to step N+1 input via JSONPath/jq-like selectors
  - One level of conditional logic (if/else, not nested)
  - No loops (agents can call the action multiple times instead)
  - Global retry policy, not per-step
  - Maximum 10 steps per composition
  - Maximum 1,000 subrequests total (Workers limit)
- Document this ceiling publicly. "Feelr is not a workflow engine. For complex orchestration, use Temporal/Inngest and call Feelr connectors as steps."
- Track which compositions hit the ceiling. If 80% of compositions use less than 5 steps, the ceiling is correct. If 80% hit the 10-step limit, re-evaluate.

**Warning signs:**
- Action definition JSON/YAML requires its own documentation site
- Users request "variables" or "state management" within actions
- Error messages from action execution are incomprehensible
- Action execution time approaches the Workers CPU limit
- You are building a visual action builder in the dashboard

**Phase to address:**
Phase 3 (Composable Actions) -- define the complexity ceiling in the design spec before writing any action execution code. Resist expanding it until there is quantitative evidence (usage data) that the ceiling is too low.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Storing OAuth tokens in KV without a DO coordinator | Simpler architecture, faster to ship | Race conditions cause token loss under concurrent load | Never for OAuth tokens; acceptable for static API keys |
| Hardcoding provider OAuth URLs instead of using adapter pattern | Ship first connector faster | Every new provider requires changes to core gateway code | For initial prototype only; refactor before second connector |
| Buffering full API responses in Worker memory instead of streaming | Simpler response transformation logic | 128MB memory limit hit on large payloads; OOM kills request | Acceptable for MVP if responses are known to be under 10MB |
| Single `docker-compose.yml` for self-hosted with no environment abstraction | Faster to ship self-hosted version | Cloud and self-hosted configs diverge; features work in one but not the other | For initial self-hosted release; abstract within 2 releases |
| Building CLI with `go run` instead of proper release pipeline | Ship CLI faster for testing | No reproducible builds, no checksums, no update mechanism | During development only; never for public release |
| Putting connector-specific logic in the gateway instead of the connector | Fixes a bug faster | Gateway becomes a dumping ground for provider workarounds; testing becomes impossible | Never; always push provider logic into the connector |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| GitHub API | Using personal access tokens without checking rate limits (5,000/hour for authenticated, 60/hour for unauthenticated) | Always include `X-RateLimit-Remaining` in normalized response; implement preemptive backoff at 10% remaining |
| Slack OAuth | Assuming standard OAuth scopes work; ignoring `user_scopes` vs `bot_scopes` distinction | Implement Slack-specific scope handling; document that Slack OAuth requires HTTPS redirect URIs even in development |
| Discord OAuth | Not handling Discord's aggressive rate limiting on token endpoints (global 50/sec) | Implement per-provider rate limit tracking; use exponential backoff on 429 responses from Discord token endpoint |
| Stripe API | Treating Stripe API keys like OAuth tokens; attempting to "refresh" them | Stripe uses long-lived API keys, not OAuth. Do not implement refresh for Stripe connector. Clearly distinguish "API key" connectors from "OAuth" connectors in the SDK |
| Cloudflare KV | Writing tokens from multiple edge locations simultaneously | Route all token writes through a Durable Object; read from KV for speed |
| Vercel (Dashboard) | Assuming Vercel serverless functions and Cloudflare Workers have the same runtime APIs | Dashboard API routes run on Vercel/Node.js, gateway runs on CF Workers. Do not share runtime-specific code between them; share only types and interfaces |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Buffering full upstream responses in Worker memory | OOM errors, request timeouts | Use `TransformStream` for response processing; stream instead of buffer | Responses exceeding ~50MB (conservative, given 128MB isolate limit shared across concurrent requests) |
| Making serial subrequests in composable actions instead of parallel where possible | Action execution time grows linearly with step count | Identify independent steps and execute in parallel (respecting 6 concurrent connection limit) | Compositions with more than 3 sequential API calls to slow providers |
| Not caching connector metadata/schemas | Every request re-fetches connector config from KV | Cache connector definitions in Worker global scope (persists across requests in same isolate) | More than 100 requests/second to the gateway |
| KV list operations for user token lookups | Slow, eventually consistent, cannot filter | Use structured key naming (`user:{id}:provider:{name}:token`) for direct gets instead of list-and-filter | More than 1,000 users with stored credentials |
| Single Durable Object for all token refreshes | DO becomes a bottleneck; all refreshes serialize globally | One DO per user (or per user+provider pair); use user ID as DO name | More than 50 concurrent token refreshes |
| Dashboard polling for real-time updates | Vercel serverless cold starts + polling interval = poor UX | Use WebSocket via Durable Objects for real-time action status; SSE as fallback | More than 10 active dashboard users |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing user OAuth tokens encrypted with a single global key | One key compromise exposes ALL user tokens | Use per-user encryption keys derived from a master key via HKDF. Store the master key as a Worker Secret, not in KV |
| Returning upstream API tokens or keys in error messages | Token leakage in logs, error responses to agents | Sanitize all error responses; never include credential material in any response body or log entry |
| KV account-level access scoping means all team members can read all tokens | Insider threat; credential exposure to team members who should not have access | Apply application-layer encryption (AES-256-GCM via Web Crypto API) so raw KV reads return ciphertext |
| Self-hosted users storing encryption keys in docker-compose.yml checked into git | Credential leakage via source control | Use Docker secrets or environment variables from a `.env` file with `.gitignore`; document this prominently in self-hosted setup guide |
| CLI storing auth credentials in plaintext config file | Credential theft from disk | Use OS keychain (macOS Keychain, Windows Credential Manager, Linux libsecret) via Go `keyring` library; fall back to encrypted file with user passphrase |
| Not validating OAuth `state` parameter on callback | CSRF attacks on OAuth flow | Generate cryptographically random state, store in KV with short TTL, validate on callback before exchanging code for token |
| Connector code executing user-provided JSONPath/jq selectors without sandboxing | Denial of service via pathological selectors; potential data exfiltration | Use a safe JSONPath evaluator with recursion limits; timeout selector execution; never use `eval()` |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Requiring users to configure OAuth apps themselves (create Slack app, get client ID/secret) | Massive onboarding friction; most users abandon | Provide pre-configured OAuth apps for cloud-hosted version; only require custom OAuth apps for self-hosted or enterprise |
| CLI auth flow that opens browser but has no fallback for headless/SSH environments | Cannot authenticate CLI on servers or CI/CD | Implement device code flow (like `gh auth login`) as fallback; support `--token` flag for direct token input |
| Error messages from connectors that say "API error" with no actionable detail | Users cannot debug; open support tickets for every error | Include upstream status code, error type, and a human-readable suggestion. Example: "Slack returned 429 Too Many Requests. Retry in 30 seconds. See https://docs.feelr.dev/errors/rate-limit" |
| Dashboard showing connector status as "connected" when tokens are actually expired | False confidence; actions fail silently | Proactively validate tokens on dashboard load; show "connected," "needs re-auth," or "expired" states with re-auth button |
| Composable action builder with no dry-run/preview capability | Users build complex actions and discover errors only at runtime | Implement `--dry-run` in CLI and "Preview" in dashboard that validates the action graph, checks credentials, and simulates data flow without executing |
| Self-hosted setup requiring 10+ configuration steps | Users abandon self-hosted setup | Provide a single `docker compose up` that works with sensible defaults; require configuration only for customization |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **OAuth flow:** Often missing token refresh implementation -- verify that refresh works after token expiry, not just initial auth
- [ ] **OAuth flow:** Often missing revocation -- verify users can disconnect a provider and tokens are actually deleted from storage
- [ ] **Connector:** Often missing rate limit handling -- verify the connector respects upstream rate limits and surfaces them to the caller
- [ ] **Connector:** Often missing pagination -- verify the connector can paginate through multi-page results, not just return page 1
- [ ] **Response normalization:** Often missing error case normalization -- verify that upstream 4xx/5xx responses are normalized to the same envelope format as success responses
- [ ] **Composable actions:** Often missing partial failure handling -- verify behavior when step 3 of 5 fails (do steps 1-2 results persist? is the error surfaced?)
- [ ] **CLI:** Often missing update mechanism -- verify that `feelr update` or `feelr version` checks for updates and provides upgrade instructions
- [ ] **CLI:** Often missing shell completion -- verify `feelr completion bash/zsh/fish` works and is documented
- [ ] **Self-hosted:** Often missing migration path -- verify that upgrading from v1.0 to v1.1 does not require wiping the database
- [ ] **Self-hosted:** Often missing health check endpoint -- verify that `/health` returns meaningful status for all dependencies (DB, KV equivalent, upstream connectivity)
- [ ] **Dashboard:** Often missing loading/error states -- verify every data-fetching component handles loading, empty, and error states
- [ ] **Auth vault:** Often missing key rotation strategy -- verify that encryption keys can be rotated without decrypting and re-encrypting all stored credentials in a single operation

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| KV eventual consistency causes token loss | MEDIUM | Implement a "force re-auth" endpoint; add DO coordinator for future refreshes; migrate existing tokens to DO-backed storage in background |
| Response normalization is too lossy | HIGH | Add "raw mode" as escape hatch; redesign envelope format; version the API (v2 with richer responses); migrate agents gradually |
| Connector SDK is CF-Workers-coupled | HIGH | Define platform abstraction interfaces; refactor existing connectors one by one; this is essentially a rewrite of the connector contract |
| Composable actions are too complex | MEDIUM | Freeze the feature; document complexity ceiling; deprecate advanced features over 2 releases; point users to dedicated workflow tools |
| Go CLI has no update mechanism | LOW | Add `selfupdate` package (e.g., `go-github-selfupdate`); ship as patch release; existing users must manually update this one time |
| OAuth race conditions cause re-auth prompts | MEDIUM | Deploy DO token coordinator; run migration to move tokens from raw KV to DO-managed KV; apologize to affected users and trigger re-auth |
| Self-hosted and cloud versions diverge | HIGH | Adopt single-codebase strategy with feature flags; audit all divergence points; establish CI that tests both deployment modes |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| KV consistency for token storage | Phase 1: Auth Vault | Integration test: concurrent token refreshes from two simulated edge locations produce no token loss |
| OAuth provider quirks | Phase 1: Auth Vault + Phase 2: Connector SDK | Each connector has an end-to-end OAuth test that covers authorize, callback, token exchange, refresh, and revoke |
| Workers free tier inadequacy | Phase 0: Project Setup | Wrangler.toml configured for paid plan; CI includes CPU time budget assertions |
| Response normalization data loss | Phase 1: Core Gateway | Contract tests verify that pagination metadata, rate limit info, and error details survive normalization |
| Connector SDK CF-coupling | Phase 2: Connector SDK | Connector tests run with `vitest` without `wrangler`; at least one connector tested in both CF and Node.js runtimes |
| Token refresh race conditions | Phase 1: Auth Vault | Load test: 50 concurrent requests for same user with expired token produce exactly 1 refresh call to provider |
| Composable action complexity creep | Phase 3: Composable Actions | Design doc defines complexity ceiling with quantitative limits before any code is written |
| Go CLI distribution | Phase 2 or Phase 4: CLI | GoReleaser config produces binaries for linux/darwin/windows amd64/arm64; checksums published; Homebrew tap and Scoop bucket configured |
| Self-hosted divergence | Phase 4 or Phase 5: Self-Hosted | CI matrix tests both `wrangler deploy` (cloud) and `docker compose up` (self-hosted) for every PR |
| Encryption key management | Phase 1: Auth Vault | Key rotation runbook exists and has been tested; per-user key derivation verified |
| CLI auth in headless environments | Phase 2 or Phase 4: CLI | CI test runs `feelr auth login --token` in a headless Docker container |
| Dashboard false "connected" states | Phase 4 or Phase 5: Dashboard | Dashboard periodically validates tokens; UI shows three states (connected, needs-reauth, expired) |

## Sources

- [Cloudflare Workers Limits (official documentation)](https://developers.cloudflare.com/workers/platform/limits/)
- [How KV works (official documentation)](https://developers.cloudflare.com/kv/concepts/how-kv-works/) -- confirms eventual consistency and lack of atomic operations
- [KV Data Security (official documentation)](https://developers.cloudflare.com/kv/reference/data-security/) -- confirms AES-256 at rest, account-level access scoping
- [Cloudflare Storage Options comparison (official documentation)](https://developers.cloudflare.com/workers/platform/storage-options/) -- recommends DO for strong consistency
- [Workers now support up to 5 minutes of CPU time (changelog)](https://developers.cloudflare.com/changelog/2025-03-25-higher-cpu-limits/)
- [Why is OAuth still hard in 2025 (Nango Blog)](https://nango.dev/blog/why-is-oauth-still-hard) -- detailed provider-specific quirks
- [Concurrency with OAuth token refreshes (Nango Blog)](https://nango.dev/blog/concurrency-with-oauth-token-refreshes) -- race condition patterns and lock mechanisms
- [OAuth Token Refresh in Distributed Systems (neekey.net)](https://neekey.net/2025/07/20/oauth-token-refresh-in-distributed-systems/) -- distributed edge token refresh patterns
- [Hardening Workers KV (Cloudflare Blog)](https://blog.cloudflare.com/workers-kv-restoring-reliability/) -- KV production incidents and reliability work
- [GoReleaser documentation](https://goreleaser.com/customization/builds/go/) -- Go CLI distribution best practices
- [Self-hosted vs Cloud SaaS (getmonetizely.com)](https://www.getmonetizely.com/articles/should-you-offer-self-hosted-or-cloud-only-for-your-open-source-saas) -- feature parity challenges
- [Cloudflare Workers Secrets (official documentation)](https://developers.cloudflare.com/workers/configuration/secrets/) -- recommended approach for sensitive configuration
- [encrypt-workers-kv (GitHub)](https://github.com/bradyjoslin/encrypt-workers-kv) -- application-layer encryption pattern for KV

---
*Pitfalls research for: Agent-friendly API simplification layer (Feelr)*
*Researched: 2026-02-05*
