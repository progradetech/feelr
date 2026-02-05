# Feature Research

**Domain:** Agent-friendly API simplification layer / hosted service + CLI + dashboard
**Researched:** 2026-02-05
**Confidence:** MEDIUM (multiple web sources cross-referenced; no single authoritative source for this nascent product category)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| API key generation and management | Every API platform provides this. Developers will not adopt a service without self-serve key provisioning. | LOW | Standard pattern: create, revoke, rotate, list keys. Show partial key in dashboard, full key only on creation. |
| At least 2-3 working connectors at launch | An API simplification layer with zero or one connector has no network value. Users need enough breadth to justify adoption. | HIGH | GitHub + Slack are the minimum viable pair for developer audiences. Stripe adds monetization relevance. |
| Consistent, predictable response format | The entire value proposition is simplification. If each connector returns differently shaped JSON, the product fails its core promise. | MEDIUM | Flat JSON with consistent envelope: `{ ok, data, error, meta }`. Every connector must conform. |
| Standardized error format | Agents cannot recover from errors without machine-parseable error structures. Every API gateway and platform provides this. | LOW | `{ ok: false, error: { code, message, action } }` where `action` tells the agent what to do (retry, auth, abort). |
| Authentication flow (API keys + OAuth) | Users expect to connect external services (GitHub, Slack, Stripe) without manual token management. OAuth is table stakes for any integration platform. | HIGH | One-time `feelr auth <connector>` flow that handles OAuth dance, stores tokens, and refreshes automatically. API keys for Feelr itself are simpler. |
| CLI that works in shell pipelines | Target audience is developers with agents. If CLI output cannot be piped, parsed, or composed in shell, the tool is broken for its primary use case. | MEDIUM | JSON output by default, `--format` flag for table/minimal, exit codes that scripts can check. |
| Rate limiting | Without rate limits, a single runaway agent can exhaust upstream API quotas or rack up costs. Every API platform enforces this. | MEDIUM | Per-key and per-connector limits. Return `429` with `Retry-After` header. Dashboard shows usage against limits. |
| Usage tracking and metering | Users need to know how many calls they are making, both for cost awareness and debugging. Every API dashboard shows this. | MEDIUM | Track requests per key, per connector, per time window. Display in dashboard. Required foundation for billing. |
| Documentation with examples | Developers will not adopt a tool they cannot understand in 5 minutes. Every API platform has getting-started docs and per-endpoint references. | MEDIUM | Docs site at feelr.dev/docs. Quick-start, per-connector action reference, auth setup guide. |
| HTTPS and encrypted credential storage | Storing OAuth tokens and API keys in plaintext is a dealbreaker. Security is non-negotiable for any auth-handling service. | MEDIUM | TLS everywhere. Encrypt credentials at rest (AES-256 or equivalent via Cloudflare Workers secrets / KV encryption). |
| Health check and status endpoint | Agents and monitoring systems need to verify the service is operational before making calls. | LOW | `GET /status` returning service health. `feelr status` CLI command. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Ultra-low token overhead (~50-100 tokens per tool description) | **This is the core differentiator.** MCP servers consume 500-1,000 tokens per tool definition and 10K-20K tokens across a typical server. Feelr's promise of ~50 tokens per action description is a 10-100x improvement. Agents can load Feelr's entire tool catalog in fewer tokens than a single MCP server. | MEDIUM | Requires ruthless description editing. Each action needs a one-liner description + minimal parameter list. Verify with actual tokenizer. Confidence: HIGH -- Anthropic's own engineering blog confirms MCP token bloat is a real problem. |
| Response flattening / normalization | Upstream APIs return deeply nested, inconsistent JSON. Feelr flattens to predictable, shallow structures, saving agents from parsing 500-token nested objects when 50 tokens of flat data suffice. | MEDIUM | Strip nested objects to key fields. E.g., GitHub PR response goes from 150+ fields to 10-15 essential fields. Must be per-action configurable so power users can request raw responses if needed. |
| Composable actions (pre-built chains) | Multi-step workflows like "create GitHub issue then post to Slack" are common agent patterns. Pre-built chains reduce multi-call overhead to a single call. Competitors (Zapier, Make) do this but with massive overhead and non-agent-friendly interfaces. | HIGH | Start with pre-built chains only (e.g., `github.issue-to-slack`). User-defined chains with conditional logic and data passing is significantly more complex -- defer full custom chains to post-MVP. |
| Progressive tool discovery via `feelr tools` | Instead of dumping all schemas upfront (MCP's approach), agents call `feelr tools` to get a lightweight catalog, then drill into specific actions. Mirrors the "progressive discovery" pattern identified as best practice for MCP servers. | LOW | `feelr tools` returns connector list. `feelr tools github` returns action list with one-liner descriptions. `feelr tools github.create-issue` returns full schema. Three levels of detail, agent picks what it needs. |
| Agent-optimized output modes | Different agents want different output shapes. A coding agent wants minimal JSON. A chat agent wants formatted tables. An orchestrator wants structured data. Offering mode switching (`--format json|minimal|table`) lets one CLI serve all agent types. | LOW | `--format` flag on CLI. `Accept` header on HTTP API. Three modes: `json` (full response), `minimal` (values only, no keys), `table` (human-readable). |
| Self-hostable with open-source core | Composio, Nango, and Auth0 Token Vault are all hosted-only or have significant self-hosting friction. An open-source, self-hostable Feelr with simple Docker deployment differentiates for security-conscious teams and enterprises. | MEDIUM | All code open-source. Billing is a toggleable feature (disabled for self-hosted). Docker Compose for local deployment. Confidence: HIGH -- open-source model is validated by Nango's success. |
| Zero-config agent integration | One `feelr auth github` command + one `feelr run github.list-issues` command gets an agent operational. No server processes to manage (unlike MCP), no JSON-RPC setup, no schema registration. | LOW | The CLI is the integration layer. No daemon process, no server management, no config files beyond auth credentials. |
| Encrypted credential vault with automatic token refresh | Auth0 Token Vault and Composio AgentAuth prove this pattern works. Storing encrypted OAuth tokens with automatic refresh so agents never deal with expired credentials is a significant DX improvement over raw OAuth management. | HIGH | Vault stores encrypted OAuth tokens + refresh tokens. Background refresh before expiration. Agents never see raw credentials -- vault injects auth headers into requests. |
| Team key sharing | Solo developers upgrade to teams. Shared API keys with scoped permissions let a team of agents and developers share connector access without credential duplication. | MEDIUM | Team-level keys that inherit connector auth. Per-key permission scopes. Audit log of which key made which call. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full MCP-compatible mode in v1 | "MCP is the standard, you should support it" | MCP compatibility means inheriting MCP's token bloat problem. The entire point of Feelr is to be lighter than MCP. Adding MCP support dilutes the value proposition and adds significant protocol complexity (JSON-RPC, server process management, bidirectional communication). | Keep MCP as a future consideration. Offer a thin MCP-to-Feelr bridge tool later if demand materializes, but do not make Feelr itself an MCP server. |
| User-defined custom chain builder with visual editor | "I want to build my own workflows with a drag-and-drop UI" | Visual chain builders are enormous scope (Zapier spent years building theirs). They appeal to non-developers but Feelr's target audience is developers with agents. A visual editor is a separate product. | Support user-defined chains via code/config (YAML or JSON chain definitions). Let agents compose chains programmatically. No visual builder. |
| Python/Node/Ruby SDKs in v1 | "I want a native SDK for my language" | SDKs are maintenance multipliers. Each SDK needs testing, versioning, documentation, and release management. The CLI + HTTP API already serves every language. | CLI + HTTP API is the universal SDK. Publish OpenAPI spec so users can auto-generate clients if they want. Add official SDKs only after proving demand with usage data. |
| Real-time streaming / WebSocket responses | "I want to stream long-running API responses" | Streaming adds significant infrastructure complexity (persistent connections, backpressure, reconnection logic) and most upstream APIs Feelr wraps are request-response anyway. Agents work better with complete, flat responses than partial streams. | Return complete, flat JSON responses. For long-running operations, use a polling pattern: start operation, return job ID, poll for completion. |
| Connector marketplace with third-party submissions | "Let the community build connectors" | Third-party connectors introduce quality control, security review, and maintenance burdens. A connector that breaks silently is worse than no connector. Premature ecosystem building before core stability is a common startup mistake. | Provide a connector SDK/template so developers can build private connectors for their own use. Curate the official connector catalog tightly. Open community contributions only after establishing quality standards and review processes. |
| GraphQL API | "GraphQL lets agents request exactly the fields they need" | GraphQL adds query parsing complexity, introduces a second API paradigm, and the response flattening layer already solves the "too many fields" problem. Agents are better at calling simple REST endpoints than constructing GraphQL queries. | REST-only with field filtering via query parameters (e.g., `?fields=id,title,status`). The response flattening layer handles the rest. |
| Per-user OAuth on behalf of end-users (multi-tenant) | "I want my SaaS app to connect each user's GitHub through Feelr" | Multi-tenant OAuth delegation is an enormous auth complexity jump. It requires per-user token isolation, consent flows, and turns Feelr into an auth platform (competing with Auth0, not API gateways). | v1 targets developers connecting their own accounts. The developer's API key maps to their own OAuth tokens. Multi-tenant delegation is a v2+ enterprise feature if demand exists. |
| Automatic API schema detection / scraping | "Just point Feelr at any API and it auto-generates a connector" | API auto-detection is unreliable, produces low-quality connectors, and undermines the hand-crafted simplification that is Feelr's value. Auto-generated connectors would be no better than raw API calls. | Hand-craft each connector with curated, minimal action sets. Quality over quantity. Each connector is opinionated about which actions matter. |

## Feature Dependencies

```
[API Key Management]
    |
    +-- requires --> [Edge Gateway (request routing)]
    |                    |
    |                    +-- requires --> [At least 1 Connector]
    |                    |                    |
    |                    |                    +-- requires --> [Response Flattening Layer]
    |                    |                    +-- requires --> [Standardized Error Format]
    |                    |
    |                    +-- requires --> [Rate Limiting]
    |
    +-- enables --> [Usage Tracking/Metering]
                        |
                        +-- enables --> [Billing Integration]
                        +-- enables --> [Dashboard Usage Stats]

[OAuth/Auth Flow]
    |
    +-- requires --> [Encrypted Credential Vault]
    |                    |
    |                    +-- enables --> [Automatic Token Refresh]
    |                    +-- enables --> [Team Key Sharing]
    |
    +-- enables --> [Connector Authentication] (per-connector OAuth)

[CLI Binary]
    |
    +-- requires --> [Edge Gateway] (to call)
    +-- requires --> [API Key Management] (to authenticate)
    +-- enables --> [Progressive Tool Discovery] (feelr tools)
    +-- enables --> [Agent Output Modes] (--format flag)
    +-- enables --> [feelr auth] (OAuth setup flow)

[Composable Actions]
    |
    +-- requires --> [At least 2 Connectors] (cross-connector chains need multiple connectors)
    +-- requires --> [Response Flattening] (chain data passing needs predictable shapes)
    +-- requires --> [Standardized Error Format] (chain error handling)

[Dashboard]
    |
    +-- requires --> [API Key Management]
    +-- requires --> [Usage Tracking]
    +-- enhances --> [Billing Integration]
    +-- enhances --> [Connected Services View]

[Documentation Site]
    |
    +-- requires --> [At least 1 Working Connector]
    +-- enhances --> [Progressive Tool Discovery] (docs complement CLI discovery)
```

### Dependency Notes

- **Edge Gateway requires at least 1 Connector:** The gateway is useless without something to route to. Gateway + first connector must ship together.
- **Composable Actions require 2+ Connectors:** Cross-connector chains (the most valuable kind) need multiple connectors working. Single-connector chains (e.g., GitHub: create issue then add label) are possible with one, but the feature's value is limited.
- **Billing requires Usage Tracking:** Cannot bill without metering. Usage tracking must ship before or with billing.
- **Team Key Sharing requires Credential Vault:** Shared keys need centralized, encrypted credential storage with per-key scoping.
- **Dashboard requires API Key Management + Usage Tracking:** The dashboard surfaces data from these systems. Without them, the dashboard has nothing to show.
- **Response Flattening enables Composable Actions:** Chain data passing only works reliably when output shapes are predictable and flat.

## MVP Definition

### Launch With (v1)

Minimum viable product -- what is needed to validate the concept and post on HN/Reddit with confidence.

- [ ] **Edge gateway on Cloudflare Workers + Hono** -- The routing layer everything depends on
- [ ] **GitHub connector (8+ actions)** -- Highest-value connector for developer audience; issues, PRs, repos
- [ ] **Slack connector (3-5 actions)** -- Second-highest value; send message, list channels, search
- [ ] **Response flattening layer** -- Core differentiator; flat, predictable JSON from nested API responses
- [ ] **Standardized error format** -- Agents need machine-parseable errors to recover autonomously
- [ ] **API key generation and management** -- Self-serve key creation, revocation, listing
- [ ] **OAuth auth flow for GitHub + Slack** -- `feelr auth github` one-time setup
- [ ] **Encrypted credential vault** -- OAuth tokens encrypted at rest with auto-refresh
- [ ] **Go CLI: `feelr run`, `feelr tools`, `feelr auth`, `feelr status`** -- The primary interface for agents
- [ ] **Progressive tool discovery** -- `feelr tools` with ~100-token descriptions per action
- [ ] **Agent output modes** -- `--format json|minimal|table`
- [ ] **Rate limiting** -- Per-key limits with 429 responses and Retry-After headers
- [ ] **Usage metering** -- Track request counts per key, per connector, per time window
- [ ] **Documentation site** -- Quick-start, auth setup, per-connector action reference
- [ ] **Health check endpoint** -- `GET /status` and `feelr status`

### Add After Validation (v1.x)

Features to add once core is working and initial users provide feedback.

- [ ] **Stripe connector** -- Add when billing integration validates paid tier demand
- [ ] **Discord connector** -- Add when community/notification use cases are validated by user requests
- [ ] **Pre-built composable actions** -- Add when users demonstrate multi-step workflow patterns in their usage (e.g., "I always create a GitHub issue then post to Slack")
- [ ] **Next.js dashboard** -- Add when self-serve key management via CLI feels insufficient and users request a visual interface for usage stats
- [ ] **Team key sharing** -- Add when solo developer users start inviting collaborators
- [ ] **Stripe billing integration** -- Add when hosted cloud usage justifies monetization

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **User-defined custom chains** -- Requires a chain definition language (YAML/JSON), validation, error handling, and conditional logic. Defer until pre-built chains prove the pattern works.
- [ ] **MCP-to-Feelr bridge** -- Only if MCP becomes so dominant that users demand compatibility. Build as a thin adapter, not native MCP support.
- [ ] **Multi-tenant OAuth (per-end-user auth)** -- Enterprise feature for SaaS builders who want their users to auth through Feelr. Massive complexity increase.
- [ ] **Connector SDK for community contributions** -- Open the connector template for external developers only after internal quality standards are battle-tested across 6+ first-party connectors.
- [ ] **Python/Node SDKs** -- Auto-generate from OpenAPI spec only when usage data shows significant demand beyond CLI + HTTP.
- [ ] **Additional connectors (Notion, Vercel, Linear, Jira, etc.)** -- Expand based on user demand data, not speculation.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Edge gateway + routing | HIGH | MEDIUM | P1 |
| GitHub connector | HIGH | HIGH | P1 |
| Slack connector | HIGH | MEDIUM | P1 |
| Response flattening | HIGH | MEDIUM | P1 |
| Standardized error format | HIGH | LOW | P1 |
| API key management | HIGH | LOW | P1 |
| OAuth flow + credential vault | HIGH | HIGH | P1 |
| Go CLI (run, tools, auth, status) | HIGH | MEDIUM | P1 |
| Progressive tool discovery | HIGH | LOW | P1 |
| Agent output modes | MEDIUM | LOW | P1 |
| Rate limiting | MEDIUM | MEDIUM | P1 |
| Usage metering | MEDIUM | MEDIUM | P1 |
| Documentation site | HIGH | MEDIUM | P1 |
| Health check endpoint | MEDIUM | LOW | P1 |
| Stripe connector | HIGH | MEDIUM | P2 |
| Discord connector | MEDIUM | MEDIUM | P2 |
| Pre-built composable actions | HIGH | HIGH | P2 |
| Next.js dashboard | MEDIUM | HIGH | P2 |
| Team key sharing | MEDIUM | MEDIUM | P2 |
| Billing integration | MEDIUM | HIGH | P2 |
| User-defined custom chains | MEDIUM | HIGH | P3 |
| MCP bridge | LOW | MEDIUM | P3 |
| Multi-tenant OAuth | LOW | HIGH | P3 |
| Community connector SDK | MEDIUM | HIGH | P3 |
| Language SDKs | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when validated by usage
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | MCP Servers | Composio | Zapier/Make | Nango | Feelr Approach |
|---------|-------------|----------|-------------|-------|----------------|
| Token overhead per tool | 500-1,000 tokens per tool; 10K-20K+ per server | Not documented; SDK-based so moderate | N/A (not LLM-native) | N/A (not LLM-native) | ~50-100 tokens per action. 10-100x less than MCP. |
| Auth management | None built-in; developer manages | Full managed OAuth (AgentAuth) for 500+ services | Managed for 8,000+ apps | OAuth + API key management for 400+ APIs | Encrypted vault with auto-refresh. Fewer connectors but deeper quality per connector. |
| Connector count | Hundreds of community servers (variable quality) | 500-850+ integrations | 8,000+ apps | 400+ APIs | 2-4 at launch (GitHub, Slack, then Stripe, Discord). Quality over quantity. |
| Response optimization | Raw API responses (no flattening) | Structured but not flattened | Transformed but for workflow, not LLM consumption | Raw or custom-mapped | Active flattening: strip nested objects to essential flat fields. Purpose-built for LLM token efficiency. |
| Self-hostable | Yes (individual servers) | No (hosted only) | No (hosted only) | Yes (open-source) | Yes (full open-source, Docker deployment, billing toggle) |
| CLI-native | mcp-cli exists but secondary | CLI available but SDK-first | No CLI | No CLI | CLI-first. The CLI IS the product for agents. |
| Composable workflows | No (single-tool calls) | Limited action chaining | Full workflow builder (visual) | Sync scripts (code-based) | Pre-built chains, then user-defined YAML/JSON chains. No visual builder. |
| Pricing model | Free (community) | Usage-based (free tier + paid) | Subscription + per-task | Open-source + hosted plans | Open-source free; hosted cloud with usage-based billing |
| Tool discovery | `tools/list` dumps all schemas (token-heavy) | SDK-based discovery | GUI-based | API catalog | Progressive 3-level discovery (connectors -> actions -> schemas) |
| Target audience | Framework developers, power users | AI agent developers, enterprises | Non-technical automation users | Integration developers | Solo developers with agents, agent framework builders |

### Competitive Positioning Summary

Feelr occupies a specific niche: **lighter than MCP, more developer-native than Composio, more agent-friendly than Nango, and simpler than Zapier**. The positioning is not "more connectors" (Feelr will always have fewer) but "less overhead per connector" and "zero-config agent integration."

The most dangerous competitor is Composio, which has significant funding, 500+ integrations, and managed auth. Feelr's advantages over Composio are: open-source/self-hostable, CLI-first (not SDK-first), dramatically lower token overhead, and response flattening.

MCP is not a direct competitor but the ecosystem Feelr operates adjacent to. MCP's token bloat problem is Feelr's raison d'etre. If MCP solves its token problem (via progressive discovery adoption), Feelr's core differentiator weakens -- but this is unlikely to happen quickly given MCP's governance structure and backwards-compatibility constraints.

## Sources

- [MCP Token Bloat Issue (SEP-1576)](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1576) -- HIGH confidence, official GitHub issue documenting the token overhead problem
- [Anthropic Engineering: Code Execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp) -- HIGH confidence, first-party source confirming 134K token overhead in MCP setups
- [Speakeasy: Reducing MCP Token Usage by 100x](https://www.speakeasy.com/blog/how-we-reduced-token-usage-by-100x-dynamic-toolsets-v2) -- MEDIUM confidence, third-party benchmarks showing dynamic toolset approaches
- [Klavis AI: 4 MCP Design Patterns](https://www.klavis.ai/blog/less-is-more-mcp-design-patterns-for-ai-agents) -- MEDIUM confidence, identifies progressive discovery as best practice
- [Auth0 Token Vault Documentation](https://auth0.com/ai/docs/intro/token-vault) -- HIGH confidence, official docs for credential vault architecture
- [ScaleKit: Token Vault for AI Agents](https://www.scalekit.com/blog/token-vault-ai-agent-workflows) -- MEDIUM confidence, good architectural overview of vault patterns
- [Composio: Unified API Platforms Review](https://composio.dev/blog/best-unified-api-platforms) -- LOW confidence (Composio-authored, biased), but useful for feature landscape
- [Composio: iPaaS vs Agent-Native](https://composio.dev/blog/ai-agent-integration-platforms-ipaas-zapier-agent-native) -- LOW confidence (same bias caveat)
- [Nango GitHub](https://github.com/NangoHQ/nango) -- HIGH confidence, open-source project showing feature set directly
- [MCP Specification (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25) -- HIGH confidence, official spec
- [Zapier MCP Integration](https://zapier.com/mcp) -- MEDIUM confidence, shows Zapier's MCP approach
- [API Rate Limiting Guide 2026](https://www.levo.ai/resources/blogs/api-rate-limiting-guide-2026) -- MEDIUM confidence, general best practices
- [Moesif: Rate Limiting Best Practices](https://www.moesif.com/blog/technical/rate-limiting/Best-Practices-for-API-Rate-Limits-and-Quotas-With-Moesif-to-Avoid-Angry-Customers/) -- MEDIUM confidence, established API analytics company

---
*Feature research for: Agent-friendly API simplification layer*
*Researched: 2026-02-05*
