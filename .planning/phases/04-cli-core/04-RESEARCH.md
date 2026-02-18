# Phase 4: CLI Core - Research

**Researched:** 2026-02-06
**Domain:** Go CLI development (Cobra/Viper), HTTP client, agent-friendly output
**Confidence:** HIGH

## Summary

Phase 4 builds a Go CLI binary (`feelr`) that communicates with the existing Cloudflare Workers gateway over HTTP. The CLI provides `run`, `tools`, `status`, `init`, and `completion` commands. The standard Go CLI stack is Cobra (commands) + Viper (config) + pflag (flags), which are the de facto ecosystem choices used by GitHub CLI, Kubernetes, Docker, and Hugo.

A critical finding: the gateway currently has NO discovery/introspection endpoint. The CLI's `tools` progressive discovery feature requires a new gateway endpoint (e.g., `GET /v1/tools`) that exposes connector definitions, action lists, and parameter schemas. This must be built as part of Phase 4 or as a prerequisite.

The Go module will live alongside the existing TypeScript monorepo as `cli/` at the repo root, with its own `go.mod`. It does NOT participate in pnpm/Turbo -- it is built with standard `go build`.

**Primary recommendation:** Use Cobra v1.10.x + Viper v1.21.x + Go 1.25.x. Structure as `cli/` directory with standard Go layout. Build gateway discovery endpoint first, then CLI commands.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Full connector names required (`github`, not `gh`) -- no aliases in v1
- Architecture should support adding connector aliases later
- `--dry-run` global flag included -- shows the HTTP request that would be sent without executing
- JSON output (default) prints unwrapped `data` field, not full envelope; `--verbose` for full `{ ok, data, error, meta }` envelope
- `--format table` for human-readable tabular output
- No color by default; `--color` flag to enable (agent/pipe safety first)
- No MCP server mode in v1 -- agents use CLI via shell
- No batch mode in v1 -- single action per invocation (batch is Phase 8)
- API key stored in config file (default) with environment variable override (`FEELR_API_KEY`)
- Named profiles supported -- each profile has its own API key and gateway URL (`feelr --profile staging run ...`)
- Config file format: TOML (`~/.feelr/config.toml`)
- `feelr init` interactive wizard for first-time setup; direct config/env editing for CI
- Both paths (interactive and manual) work for initial setup
- TOML chosen specifically over YAML -- aligns with Go ecosystem preferences

### Claude's Discretion
- Action parameter passing style (flags, key=value, or hybrid)
- `tools` discovery: live gateway vs local cache with refresh
- Minimal output format design
- Error stream routing (stderr vs stdout)
- Tool schema output format
- Description embedding vs gateway fetching
- Shell completion implementation details
- Exit code semantics beyond 0/1/2

### Deferred Ideas (OUT OF SCOPE)
- Connector aliases (e.g., `gh` for `github`) -- future enhancement
- MCP server mode -- potential future phase
- Batch execution mode -- Phase 8
- CLI distribution (GoReleaser, Homebrew) -- Phase 10
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Go | 1.25.x | Language runtime | Latest stable (1.25.7 released 2026-02-04) |
| github.com/spf13/cobra | v1.10.2 | Command framework | De facto standard; used by gh, kubectl, docker, hugo |
| github.com/spf13/viper | v1.21.0 | Config management | Native TOML support, env var override, multi-source precedence |
| github.com/spf13/pflag | v1.0.9 | POSIX-compliant flags | Bundled with Cobra, POSIX short/long flags |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| text/tabwriter (stdlib) | - | Table formatting | `--format table` output; no external dep needed |
| net/http (stdlib) | - | HTTP client | Gateway communication; no need for third-party HTTP client |
| net/http/httputil (stdlib) | - | Request dumping | `--dry-run` request preview via DumpRequestOut |
| encoding/json (stdlib) | - | JSON encoding/decoding | All JSON output and gateway response parsing |
| os (stdlib) | - | Stream handling | stdout/stderr routing |
| fmt (stdlib) | - | Formatted output | Minimal format, error messages |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| text/tabwriter | olekukonko/tablewriter v1.1.x | Richer tables but external dep; tabwriter is sufficient for simple tables |
| net/http | hashicorp/go-retryablehttp | Auto-retry with backoff; NOT needed for v1 since gateway handles upstream retries |
| Viper | Manual TOML parsing | Viper handles env var override, flag binding, and config file discovery natively |
| encoding/json | bytedance/sonic | Faster JSON but overkill for CLI response sizes |

**Installation:**
```bash
# Install Go 1.25.x (from go.dev/dl)
# Then in the cli/ directory:
go mod init github.com/user/feelr/cli
go get github.com/spf13/cobra@v1.10.2
go get github.com/spf13/viper@v1.21.0
```

## Architecture Patterns

### Recommended Project Structure
```
cli/
├── go.mod                    # Go module (independent of pnpm/turbo)
├── go.sum
├── main.go                   # Thin entry point: calls cmd.Execute()
├── cmd/
│   ├── root.go               # Root command, global flags (--profile, --format, --verbose, --dry-run, --color)
│   ├── run.go                # `feelr run <connector> <action> [params...]`
│   ├── tools.go              # `feelr tools [connector[.action]]` -- progressive discovery
│   ├── status.go             # `feelr status` -- gateway + connector health
│   ├── init_cmd.go           # `feelr init` -- interactive first-time setup wizard
│   └── completion.go         # `feelr completion [bash|zsh|fish]` -- shell completion scripts
├── internal/
│   ├── client/
│   │   ├── client.go         # HTTP client wrapper (gateway URL, API key, timeout)
│   │   └── client_test.go
│   ├── config/
│   │   ├── config.go         # TOML config loading, profile resolution, env override
│   │   └── config_test.go
│   ├── output/
│   │   ├── json.go           # JSON formatter (unwrapped data / verbose envelope)
│   │   ├── minimal.go        # Minimal formatter (key=value or single-line)
│   │   ├── table.go          # Table formatter (text/tabwriter)
│   │   ├── formatter.go      # Formatter interface + factory
│   │   └── formatter_test.go
│   └── gateway/
│       ├── types.go          # Go structs mirroring gateway response envelope
│       └── types_test.go
├── Makefile                  # Build targets: build, test, install, lint
└── .goreleaser.yml           # Placeholder for Phase 10 distribution
```

### Monorepo Integration
The Go CLI lives as a peer directory to `apps/`, `packages/`, and `connectors/`. It does NOT participate in pnpm workspaces or Turborepo. It has its own independent build:

```
feelr/                        # Repo root
├── apps/gateway/             # TypeScript (Cloudflare Worker)
├── packages/connector-sdk/   # TypeScript (shared types)
├── connectors/github/        # TypeScript (GitHub connector)
├── cli/                      # Go (CLI binary) -- NEW
│   ├── go.mod
│   └── ...
├── pnpm-workspace.yaml       # Does NOT include cli/
└── turbo.json                # Does NOT include cli/
```

### Pattern 1: Gateway Discovery Endpoint (NEW, Required)
**What:** A new gateway endpoint exposing connector metadata for CLI `tools` command
**When to use:** Required before CLI `tools` command can function

The gateway currently has `listConnectors()` in the registry but no HTTP endpoint exposing it. The CLI needs:

```
GET /v1/tools                          -> list of connectors with basic info
GET /v1/tools/:connector               -> list of actions for a connector
GET /v1/tools/:connector/:action       -> full param schema for an action
```

These endpoints should return connector definitions, action lists, and parameter schemas from the existing `ConnectorDefinition` / `ActionDefinition` / `ParamDefinition` types. They MUST be authenticated (require API key, same as dispatch routes).

Example response for `GET /v1/tools`:
```json
{
  "ok": true,
  "data": [
    {
      "name": "github",
      "display_name": "GitHub",
      "version": "0.1.0",
      "auth_type": "bearer_token",
      "action_count": 10
    }
  ]
}
```

Example response for `GET /v1/tools/github`:
```json
{
  "ok": true,
  "data": {
    "name": "github",
    "actions": [
      { "name": "issues.list", "description": "Lists issues for a repository...", "returns": "list" },
      { "name": "issues.get", "description": "Gets a single issue...", "returns": "single" }
    ]
  }
}
```

Example response for `GET /v1/tools/github/issues.list`:
```json
{
  "ok": true,
  "data": {
    "name": "issues.list",
    "description": "Lists issues for a repository...",
    "params": [
      { "name": "repo", "type": "string", "required": true, "description": "Repository in owner/repo format" },
      { "name": "state", "type": "string", "required": false, "description": "Filter by state", "default": "open" }
    ],
    "returns": "list"
  }
}
```

**Confidence:** HIGH -- gateway already has `listConnectors()` and full type definitions. This is a thin HTTP layer over existing data.

### Pattern 2: Key=Value Parameter Passing (Claude's Discretion Recommendation)
**What:** Parameters passed as positional key=value pairs after the action name
**Recommendation:** Hybrid approach: key=value positional args + flags for system params

```bash
# Key=value for action params (natural, low token count for agents)
feelr run github issues.list repo=owner/repo state=open per_page=50

# Flags for system/meta params only
feelr run github issues.list repo=owner/repo --format minimal --verbose --dry-run --cursor abc123
```

**Rationale:**
- Key=value is more natural for agents (lower token cost than `--repo owner/repo`)
- Avoids flag name conflicts between action params and system flags
- Matches the gateway's flat param model perfectly
- Easy to parse: split on first `=`, key is left side, value is right side
- Cobra supports this via `Args: cobra.ArbitraryArgs` + manual parsing in RunE

**Confidence:** HIGH -- this pattern is used by many agent-oriented CLIs and maps cleanly to the gateway's param model.

### Pattern 3: Output Formatter Interface
**What:** Pluggable output formatting via interface
**When to use:** All command output

```go
// Formatter interface for all output modes
type Formatter interface {
    FormatSuccess(data interface{}, meta *ResponseMeta) error
    FormatError(err *ErrorResponse) error
}

// Factory function based on --format flag
func NewFormatter(format string, verbose bool, color bool, w io.Writer) Formatter {
    switch format {
    case "json":
        return &JSONFormatter{verbose: verbose, w: w}
    case "minimal":
        return &MinimalFormatter{w: w}
    case "table":
        return &TableFormatter{color: color, w: w}
    default:
        return &JSONFormatter{verbose: verbose, w: w}
    }
}
```

### Pattern 4: Minimal Format Design (Claude's Discretion Recommendation)
**What:** Ultra-compact output optimized for agent token consumption
**Recommendation:** Single-line key=value for single items, newline-separated for lists

```bash
# Single item (e.g., issues.get)
$ feelr run github issues.get repo=owner/repo number=42 --format minimal
number=42 state=open title="Fix login bug" user=alice labels=bug,urgent

# List items (e.g., issues.list)
$ feelr run github issues.list repo=owner/repo --format minimal
42|open|Fix login bug|alice
43|closed|Add docs|bob
44|open|Refactor auth|charlie
```

**Rationale:** Pipe-delimited for lists (easy to parse, minimal tokens), key=value for single items (self-documenting). Agents can parse either format trivially.

**Confidence:** MEDIUM -- this is a reasonable design but may need iteration based on actual agent usage.

### Pattern 5: Error/Data Stream Separation (Claude's Discretion Recommendation)
**What:** Route errors to stderr, data to stdout
**Recommendation:** All data output to stdout, all errors/status/progress to stderr

```go
// Data always goes to stdout
fmt.Fprintln(os.Stdout, jsonOutput)

// Errors always go to stderr
fmt.Fprintln(os.Stderr, "error: authentication required")

// Progress/status messages to stderr (don't pollute piped data)
fmt.Fprintln(os.Stderr, "connecting to gateway...")
```

**Rationale:** Standard Unix convention. Enables `feelr run ... | jq .` without error messages corrupting the JSON pipe. Agents parsing stdout get clean data only.

**Confidence:** HIGH -- this is the universal Unix CLI pattern and the correct choice for agent consumption.

### Pattern 6: Tools Discovery (Claude's Discretion Recommendation)
**What:** Whether `tools` fetches live from gateway or uses local cache
**Recommendation:** Live gateway fetch with NO local cache in v1

**Rationale:**
- Simplicity: No cache invalidation logic, no stale data bugs
- The gateway is fast (edge-deployed, low latency)
- `tools` is an infrequent command (used for discovery, not hot path)
- Caching adds complexity better deferred to when performance data justifies it

**Confidence:** HIGH -- premature caching optimization is a common pitfall in CLIs.

### Pattern 7: Tool Schema Output (Claude's Discretion Recommendation)
**What:** Format for `feelr tools github.issues.list` detailed schema output
**Recommendation:** Default human-readable help-style; `--schema` flag for JSON Schema

```bash
# Default: human-readable
$ feelr tools github.issues.list
github.issues.list - Lists issues for a repository (excludes pull requests)

PARAMETERS:
  repo       string  (required)  Repository in "owner/repo" format
  state      string  (optional)  Filter by state: open, closed, or all [default: open]
  labels     string  (optional)  Comma-separated label names to filter by
  sort       string  (optional)  Sort by: created, updated, or comments [default: created]
  per_page   number  (optional)  Results per page (max 100) [default: 30]

Returns: list

# With --schema: JSON Schema for programmatic consumption
$ feelr tools github.issues.list --schema
{
  "name": "issues.list",
  "description": "Lists issues for a repository...",
  "params": [
    { "name": "repo", "type": "string", "required": true, "description": "..." }
  ],
  "returns": "list"
}
```

**Rationale:** Human-readable by default (useful for `feelr tools` exploration), JSON Schema available for agents that need structured metadata.

**Confidence:** HIGH -- dual-mode (human + machine) is standard in modern CLIs.

### Pattern 8: Exit Code Semantics (Claude's Discretion Recommendation)
**What:** Meaningful exit codes for script/agent consumption
**Recommendation:**

| Exit Code | Meaning | When |
|-----------|---------|------|
| 0 | Success | Action completed successfully |
| 1 | Error | Runtime error (network, gateway error, validation) |
| 2 | Auth required | API key missing, invalid, or expired |
| 3 | Not found | Connector or action not found |
| 4 | Usage error | Invalid flags, missing required params |

**Confidence:** MEDIUM -- 0/1/2 are locked. 3 and 4 are reasonable extensions but could also be collapsed into 1.

### Anti-Patterns to Avoid
- **Calling os.Exit() inside command functions:** Always return errors from RunE; handle exit codes centrally in main.go
- **Hardcoding gateway URL:** Must come from config/env/flag, never hardcoded
- **Using Viper global state for tests:** Pass config structs explicitly; Viper global singletons make testing difficult
- **Mixing data and error output on stdout:** Breaks agent piping; use stderr for errors
- **Blocking on user input in non-interactive mode:** Check if stdin is a terminal before prompting (relevant for `feelr init`)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Command tree + flags | Custom arg parser | Cobra + pflag | Flag conflicts, subcommand routing, help generation, completion |
| Config file + env override | Manual TOML + os.Getenv | Viper | Precedence handling (flag > env > config > default) is tricky |
| Shell completion scripts | Hand-written bash/zsh/fish scripts | Cobra's built-in completion | Cross-shell compatibility, dynamic completions via ValidArgsFunction |
| Table formatting | Custom column alignment | text/tabwriter | Elastic tab stops handle variable-width content correctly |
| HTTP request preview | Manual string building | httputil.DumpRequestOut | Includes all headers, handles encoding, matches wire format |
| POSIX flag parsing | Manual flag parsing | pflag (via Cobra) | Short/long flags, flag groups, mutual exclusion |

**Key insight:** The Go stdlib + Cobra + Viper cover 95% of CLI needs. The only custom code should be: gateway HTTP client, output formatters, and the `init` wizard.

## Common Pitfalls

### Pitfall 1: No Gateway Discovery Endpoint
**What goes wrong:** CLI `tools` command has nothing to call; connector metadata is only available server-side
**Why it happens:** Gateway was built for dispatch, not introspection
**How to avoid:** Build `/v1/tools` discovery routes on the gateway BEFORE building CLI `tools` command
**Warning signs:** Trying to embed connector definitions in the CLI binary (defeats the purpose of dynamic discovery)

### Pitfall 2: Viper Global State in Tests
**What goes wrong:** Tests interfere with each other because Viper uses a global singleton by default
**Why it happens:** `viper.Get()` and `viper.Set()` modify global state
**How to avoid:** Create Viper instances with `viper.New()` and pass them explicitly. Or define a Config struct and pass that to commands.
**Warning signs:** Tests pass individually but fail when run together

### Pitfall 3: Default net/http Client Has No Timeout
**What goes wrong:** CLI hangs indefinitely if gateway is unreachable
**Why it happens:** Go's `http.DefaultClient` has 0 timeout (infinite)
**How to avoid:** Create custom `http.Client{Timeout: 30 * time.Second}` in the client package
**Warning signs:** CLI hangs instead of erroring on network issues

### Pitfall 4: JSON Output Corruption from Cobra/Viper Logging
**What goes wrong:** Cobra prints usage strings or Viper logs debug info to stdout, corrupting JSON output
**Why it happens:** Default Cobra behavior prints usage on errors; Viper can log to stdout
**How to avoid:** Set `cmd.SilenceUsage = true` and `cmd.SilenceErrors = true` on root command. Handle all output explicitly.
**Warning signs:** `feelr run ... | jq .` fails with parse errors

### Pitfall 5: go.mod in Monorepo Root vs Subdirectory
**What goes wrong:** Go module conflicts with Node.js tooling or IDE confusion
**Why it happens:** Putting go.mod at repo root makes the entire repo a Go module
**How to avoid:** Place go.mod inside `cli/` subdirectory. The Go module is `cli/` only.
**Warning signs:** IDE tries to resolve TypeScript files as Go packages

### Pitfall 6: Interactive Prompts Breaking Agents/CI
**What goes wrong:** `feelr init` wizard blocks waiting for input in non-interactive environments
**Why it happens:** No terminal detection before prompting
**How to avoid:** Check `term.IsTerminal(int(os.Stdin.Fd()))` before prompting. In non-interactive mode, require all config via flags/env or error with helpful message.
**Warning signs:** CI pipeline hangs on `feelr init`

### Pitfall 7: Flag/Param Name Collisions
**What goes wrong:** Action parameter named same as a global flag (e.g., an action has a `format` param)
**Why it happens:** If using flags for action params, they collide with global `--format`
**How to avoid:** Use key=value positional args for action params, flags only for system params. This completely avoids namespace collisions.
**Warning signs:** `--format` flag intended for output format gets consumed as action param

## Code Examples

### Main Entry Point
```go
// Source: Standard Cobra pattern
package main

import (
    "fmt"
    "os"
    "github.com/user/feelr/cli/cmd"
)

func main() {
    if err := cmd.Execute(); err != nil {
        // Error already printed to stderr by command
        // Determine exit code from error type
        os.Exit(exitCodeFromError(err))
    }
}

func exitCodeFromError(err error) int {
    var cliErr *cmd.CLIError
    if errors.As(err, &cliErr) {
        return cliErr.ExitCode
    }
    return 1
}
```

### Root Command with Global Flags
```go
// Source: Cobra documentation + enterprise guide patterns
var rootCmd = &cobra.Command{
    Use:   "feelr",
    Short: "Agent-friendly API simplification layer",
    Long:  "Feelr simplifies complex APIs into minimal, predictable CLI commands for AI agents.",
    SilenceUsage:  true,
    SilenceErrors: true,
}

func init() {
    // Global persistent flags (available to all subcommands)
    rootCmd.PersistentFlags().StringP("profile", "p", "default", "Named profile to use")
    rootCmd.PersistentFlags().StringP("format", "f", "json", "Output format: json, minimal, table")
    rootCmd.PersistentFlags().BoolP("verbose", "v", false, "Show full response envelope")
    rootCmd.PersistentFlags().Bool("dry-run", false, "Show HTTP request without executing")
    rootCmd.PersistentFlags().Bool("color", false, "Enable colored output")
    rootCmd.PersistentFlags().String("gateway", "", "Override gateway URL")

    // Bind flags to Viper for config file fallback
    viper.BindPFlag("gateway", rootCmd.PersistentFlags().Lookup("gateway"))
}
```

### Run Command with Key=Value Parsing
```go
// Source: Custom pattern for Feelr agent ergonomics
var runCmd = &cobra.Command{
    Use:   "run <connector> <action> [key=value...]",
    Short: "Execute a connector action",
    Args:  cobra.MinimumNArgs(2), // connector + action required
    RunE: func(cmd *cobra.Command, args []string) error {
        connector := args[0]
        action := args[1]

        // Parse key=value pairs from remaining args
        params := make(map[string]string)
        for _, arg := range args[2:] {
            key, value, ok := strings.Cut(arg, "=")
            if !ok {
                return &CLIError{
                    Message:  fmt.Sprintf("invalid parameter %q: expected key=value format", arg),
                    ExitCode: 4,
                }
            }
            params[key] = value
        }

        // Check for --dry-run
        dryRun, _ := cmd.Flags().GetBool("dry-run")

        // Build and optionally preview the request
        req := client.BuildRequest(connector, action, params)
        if dryRun {
            dump, _ := httputil.DumpRequestOut(req, true)
            fmt.Fprintln(os.Stderr, string(dump))
            return nil
        }

        // Execute
        resp, err := client.Do(req)
        if err != nil {
            return err
        }

        // Format output
        return formatter.Format(resp)
    },
}
```

### TOML Config File Structure
```toml
# ~/.feelr/config.toml

# Default profile
[default]
gateway = "https://api.feelr.dev"
api_key = "flr_abc123..."

# Named profile
[staging]
gateway = "https://staging.feelr.dev"
api_key = "flr_staging_xyz..."

# Another profile
[local]
gateway = "http://localhost:8787"
api_key = "flr_local_test..."
```

### Config Loading with Profile Support
```go
// Source: Viper documentation + custom profile pattern
func LoadConfig(profile string) (*Config, error) {
    v := viper.New()
    v.SetConfigName("config")
    v.SetConfigType("toml")
    v.AddConfigPath("$HOME/.feelr")
    v.AddConfigPath(".")

    // Environment variable overrides
    v.SetEnvPrefix("FEELR")
    v.AutomaticEnv()

    if err := v.ReadInConfig(); err != nil {
        if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
            return nil, fmt.Errorf("reading config: %w", err)
        }
        // Config file not found -- rely on env vars
    }

    // Resolve profile section
    gateway := v.GetString(profile + ".gateway")
    apiKey := v.GetString(profile + ".api_key")

    // Env var FEELR_API_KEY overrides config file
    if envKey := v.GetString("api_key"); envKey != "" {
        apiKey = envKey
    }
    if envGW := v.GetString("gateway"); envGW != "" {
        gateway = envGW
    }

    return &Config{
        Gateway: gateway,
        APIKey:  apiKey,
        Profile: profile,
    }, nil
}
```

### HTTP Client with Timeout
```go
// Source: Go stdlib best practices
type GatewayClient struct {
    httpClient *http.Client
    baseURL    string
    apiKey     string
}

func NewGatewayClient(baseURL, apiKey string) *GatewayClient {
    return &GatewayClient{
        httpClient: &http.Client{
            Timeout: 30 * time.Second,
        },
        baseURL: strings.TrimRight(baseURL, "/"),
        apiKey:  apiKey,
    }
}

func (c *GatewayClient) Run(connector, action string, params map[string]string) (*GatewayResponse, error) {
    url := fmt.Sprintf("%s/v1/%s/%s", c.baseURL, connector, action)

    // Build JSON body from params
    body, _ := json.Marshal(params)
    req, _ := http.NewRequest("POST", url, bytes.NewReader(body))
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("Authorization", "Bearer " + c.apiKey)

    resp, err := c.httpClient.Do(req)
    if err != nil {
        return nil, fmt.Errorf("gateway request failed: %w", err)
    }
    defer resp.Body.Close()

    // Parse response envelope
    var envelope GatewayResponse
    if err := json.NewDecoder(resp.Body).Decode(&envelope); err != nil {
        return nil, fmt.Errorf("parsing gateway response: %w", err)
    }
    return &envelope, nil
}
```

### Shell Completion with Dynamic Args
```go
// Source: Cobra completion documentation
var completionCmd = &cobra.Command{
    Use:   "completion [bash|zsh|fish]",
    Short: "Generate shell completion scripts",
    Args:  cobra.ExactValidArgs(1),
    ValidArgs: []string{"bash", "zsh", "fish"},
    RunE: func(cmd *cobra.Command, args []string) error {
        switch args[0] {
        case "bash":
            return rootCmd.GenBashCompletion(os.Stdout)
        case "zsh":
            return rootCmd.GenZshCompletion(os.Stdout)
        case "fish":
            return rootCmd.GenFishCompletion(os.Stdout, true)
        }
        return nil
    },
}

// Dynamic completion for connector names in `run` command
var runCmd = &cobra.Command{
    Use: "run <connector> <action> [params...]",
    ValidArgsFunction: func(cmd *cobra.Command, args []string, toComplete string) ([]string, cobra.ShellCompDirective) {
        if len(args) == 0 {
            // Complete connector names
            connectors, _ := client.FetchConnectors()
            return connectors, cobra.ShellCompDirectiveNoFileComp
        }
        if len(args) == 1 {
            // Complete action names for the given connector
            actions, _ := client.FetchActions(args[0])
            return actions, cobra.ShellCompDirectiveNoFileComp
        }
        // No completion for params
        return nil, cobra.ShellCompDirectiveNoFileComp
    },
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| BurntSushi/toml | pelletier/go-toml v2 (via Viper) | 2023+ | Viper handles TOML natively; no direct dep needed |
| Go 1.21 | Go 1.25.7 | 2026-02-04 | Generics, improved JSON, better container support |
| Cobra v1.8.x | Cobra v1.10.2 | 2024-12-04 | Context in help, better completions, flag groups |
| Manual flag parsing | pflag v1.0.9 | Stable | POSIX-compliant, works with Cobra automatically |
| Global Viper singleton | viper.New() instances | Available since v1.x | Enables parallel testing without state conflicts |

**Deprecated/outdated:**
- `cobra.Command.Run` (without E): Use `RunE` for error handling
- `BurntSushi/toml` direct usage: Viper wraps TOML parsing; no need for direct import
- Go 1.23 and earlier: EOL as of 2025-08-12; use 1.24+ minimum (1.25.x recommended)

## Open Questions

1. **Gateway discovery endpoint authorization**
   - What we know: Dispatch routes (`/v1/:connector/:action`) require API key via middleware
   - What's unclear: Should discovery routes require the same API key, or be open for easier tooling integration?
   - Recommendation: Require API key (consistent with existing auth model; tools command uses the configured key)

2. **Go installation as prerequisite**
   - What we know: Go is NOT installed in the current environment
   - What's unclear: Whether to install Go via the system package manager or from go.dev tarball
   - Recommendation: Install from go.dev tarball for latest stable version (system packages often lag)

3. **Gateway endpoint for `feelr status` format**
   - What we know: Gateway already has `GET /status` returning health + connector status
   - What's unclear: Whether the existing envelope format maps cleanly to CLI needs
   - Recommendation: Existing format is sufficient; CLI just needs to format the response

4. **Viper TOML profile sections**
   - What we know: Viper reads TOML and supports nested sections
   - What's unclear: Whether `viper.Sub("profilename")` works reliably with TOML sections for the profile pattern
   - Recommendation: Test during implementation; fallback to manual key prefixing (`profile.key`) if `Sub()` is unreliable

## Sources

### Primary (HIGH confidence)
- [Cobra v1.10.2 on pkg.go.dev](https://pkg.go.dev/github.com/spf13/cobra) -- latest version, API reference
- [Cobra GitHub releases](https://github.com/spf13/cobra/releases) -- version history, v1.10.2 Dec 2024
- [Viper v1.21.0 on pkg.go.dev](https://pkg.go.dev/github.com/spf13/viper) -- TOML support confirmed, Go 1.23+ required
- [Viper GitHub releases](https://github.com/spf13/viper/releases) -- version history
- [Go release history](https://go.dev/doc/devel/release) -- Go 1.25.7 latest (Feb 2026)
- [Cobra shell completion docs](https://cobra.dev/docs/how-to-guides/shell-completion/) -- bash/zsh/fish generation
- [Cobra completions reference](https://github.com/spf13/cobra/blob/main/site/content/completions/_index.md) -- ValidArgsFunction, ShellCompDirective
- [Cobra enterprise guide](https://cobra.dev/docs/explanations/enterprise-guide/) -- testing patterns, architecture
- Existing gateway codebase: `apps/gateway/src/routes/v1.ts`, `packages/connector-sdk/src/types.ts` -- API surface and type definitions

### Secondary (MEDIUM confidence)
- [Go net/http timeout guide (Cloudflare)](https://blog.cloudflare.com/the-complete-guide-to-golang-net-http-timeouts/) -- HTTP client timeout patterns
- [Cobra exit code patterns](https://github.com/spf13/cobra/issues/2124) -- RunE + SilenceUsage pattern
- [Go project layout conventions](https://github.com/golang-standards/project-layout) -- cmd/internal/pkg structure
- [text/tabwriter docs](https://pkg.go.dev/text/tabwriter) -- table formatting stdlib

### Tertiary (LOW confidence)
- WebSearch results on Go monorepo with TypeScript -- limited guidance on polyglot pnpm+Go monorepos
- WebSearch results on minimal output format -- no established standard; custom design needed

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Cobra/Viper are overwhelmingly dominant in Go CLI ecosystem
- Architecture: HIGH -- cmd/internal pattern is well-established; gateway API surface is fully understood from codebase
- Gateway discovery endpoint: HIGH -- straightforward to build from existing registry + type definitions
- Pitfalls: HIGH -- well-documented issues with net/http defaults, Viper global state, Cobra output
- Output format design: MEDIUM -- JSON/table are straightforward; minimal format is custom design
- Profile config: MEDIUM -- Viper TOML profile sections need validation during implementation

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (30 days -- stable ecosystem, unlikely to change)
