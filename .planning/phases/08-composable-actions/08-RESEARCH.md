# Phase 8: Composable Actions - Research

**Researched:** 2026-02-07
**Domain:** Workflow engine, YAML chain definitions, CLI execution, gateway dispatch
**Confidence:** HIGH

## Summary

Phase 8 adds a composable actions engine to Feelr, enabling users to define multi-step workflows (chains) that execute connector actions sequentially with data passing between steps, conditional logic, and runtime parameters. The implementation spans three layers: (1) chain definition format (YAML/JSON schema), (2) Go CLI chain execution with local file loading and gateway dispatch, and (3) gateway-side chain execution endpoint.

The existing codebase provides an excellent foundation. The gateway's v1 dispatch already calls connector action handlers programmatically via the registry, so server-side chain execution can internally loop through steps calling `action.handler()` directly -- no HTTP subrequests needed. The CLI already uses Cobra with subcommands and has a clean gateway client. Adding a `chain` subcommand with YAML loading is straightforward.

For the discretionary decisions, I recommend: GitHub Actions-inspired `${{ }}` template syntax for interpolation, `expr-lang/expr` for condition evaluation (supports all required operators plus AND/OR), step-level `if:` field for conditionals, combined `uses:` field for action references, and a new `feelr chain` subcommand group.

**Primary recommendation:** Build the chain engine in the Go CLI first (local-only execution via sequential gateway API calls), then add a gateway `/v1/chains/run` endpoint for server-side execution that calls action handlers directly without HTTP round-trips.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Support both YAML and JSON for chain definitions -- YAML for humans, JSON for programmatic generation
- Chains stored as local files AND uploadable to gateway for server-side execution
- Runtime parameters are a hard requirement -- chains declare typed input params, users provide at runtime
- Ship 5-6 pre-built chains covering all connector pairs (at least one chain per connector combination)
- Default shows final step output only; --verbose shows all steps
- Dry-run mode is essential -- validates definition, resolves selectors against mock data, shows execution plan
- Full comparison operators: ==, !=, >, <, >=, <=, contains, exists
- Complexity ceiling: max 10 steps, sequential only, no loops, global retry policy

### Claude's Discretion
- Step action reference syntax (combined `uses:` vs separate fields)
- Chain file organization (flat vs namespaced)
- Selector syntax expressiveness level
- Interpolation style (template strings vs input mapping)
- Missing data handling strategy
- Conditional syntax style
- Skipped step output behavior
- Boolean combinator support
- CLI command structure for chains
- Specific pre-built chain selection (must cover all 4 connectors, 5-6 total)
- Global retry policy design

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core (Go CLI -- chain execution engine)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `go.yaml.in/yaml/v3` | v3.0.4 | YAML parsing for chain definitions | Already indirect dep in go.mod; actively maintained fork of go-yaml; drop-in compatible |
| `expr-lang/expr` | latest | Condition evaluation for `if:` expressions | Safe, fast (70ns/op), no side effects, supports all required operators (==, !=, >, <, >=, <=, contains, in) plus AND/OR/NOT, dot access, bracket access, nil coalescing |
| `github.com/spf13/cobra` | v1.10.2 | CLI subcommand structure | Already used for all CLI commands |

### Core (Gateway -- server-side chain execution)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `zod` | 3.25.x | Chain definition schema validation | Already used throughout gateway |
| `hono` | 4.11.x | Route handling for /v1/chains/* | Already used for all gateway routes |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `encoding/json` (stdlib) | Go stdlib | JSON chain parsing + gateway response deserialization | Always available, no dep needed |
| `text/template` (stdlib) | Go stdlib | Template string interpolation fallback | Only if `${{ }}` needs Go template power; otherwise use custom regex parser |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `expr-lang/expr` | Custom condition parser | expr handles edge cases (string quoting, nested access, nil safety) that a hand-rolled parser would miss; 70ns/op is negligible |
| `expr-lang/expr` | `PaesslerAG/gval` | gval is 6x slower (412ns/op) and less maintained; expr is the Go ecosystem standard for expression evaluation |
| `go.yaml.in/yaml/v3` | `gopkg.in/yaml.v3` | gopkg.in/yaml.v3 is unmaintained since April 2025; go.yaml.in is the official successor with identical API |
| Simple in-process execution | Cloudflare Workflows (durable execution) | Workflows adds durability but massive complexity; with max 10 sequential steps and no long-running needs, simple in-process loop is sufficient; Workers paid plan allows 1000 subrequests and 5min CPU which far exceeds needs |

**Installation (Go CLI):**
```bash
cd cli
go get go.yaml.in/yaml/v3@v3.0.4
go get github.com/expr-lang/expr
```

## Architecture Patterns

### Recommended Project Structure

```
cli/
  cmd/
    chain.go              # `feelr chain` parent command
    chain_run.go          # `feelr chain run <name> [--param key=value...]`
    chain_list.go         # `feelr chain list` (list available chains)
    chain_validate.go     # `feelr chain validate <file>`
    chain_show.go         # `feelr chain show <name>` (show chain definition)
  internal/
    chain/
      types.go            # Chain, Step, Param, Condition structs
      loader.go           # YAML/JSON file loading + validation
      executor.go         # Sequential step execution engine
      selector.go         # Data selector/interpolation resolution
      condition.go        # Condition evaluation via expr-lang/expr
      builtin.go          # Pre-built chain registry
      dryrun.go           # Dry-run execution with mock data
    output/
      formatter.go        # (existing -- extend for chain output)

apps/gateway/src/
  routes/
    chains.ts             # POST /v1/chains/run -- server-side chain execution
  lib/
    chain-executor.ts     # TypeScript chain execution engine (mirrors Go logic)
    chain-types.ts        # Chain definition TypeScript types

chains/                   # Pre-built chain definitions (YAML files)
  github-slack-issue-notify.yaml
  github-discord-pr-notify.yaml
  stripe-slack-payment-alert.yaml
  github-stripe-customer-issue.yaml
  slack-discord-cross-post.yaml
  github-slack-pr-review.yaml
```

### Pattern 1: Chain Definition Schema (YAML)

**What:** The standard format for defining a composable action chain
**When to use:** Every chain definition, both pre-built and user-defined

**Recommendation:** Use combined `uses:` field with `connector/action` format (matches GitHub Actions `uses:` pattern which is widely understood). Use `${{ }}` interpolation syntax (also matches GitHub Actions, familiar to developers).

```yaml
# Chain definition format
name: issue-to-slack
description: Creates a GitHub issue and notifies a Slack channel
version: "1.0"

# Runtime parameters -- users provide these when running the chain
params:
  - name: repo
    type: string
    required: true
    description: "Repository in owner/repo format"
  - name: title
    type: string
    required: true
    description: "Issue title"
  - name: channel
    type: string
    required: true
    description: "Slack channel ID or #name"
  - name: body
    type: string
    required: false
    default: ""
    description: "Issue body text"

# Global retry policy
retry:
  max_attempts: 2
  delay_seconds: 3

# Sequential steps (max 10)
steps:
  - id: create_issue
    uses: github/issues.create
    with:
      repo: "${{ params.repo }}"
      title: "${{ params.title }}"
      body: "${{ params.body }}"

  - id: notify_slack
    uses: slack/messages.send
    if: "${{ steps.create_issue.number > 0 }}"
    with:
      channel: "${{ params.channel }}"
      text: "New issue #${{ steps.create_issue.number }}: ${{ steps.create_issue.title }} in ${{ params.repo }}"
```

### Pattern 2: Data Passing via Step Output Selectors

**What:** How data flows from step N output to step N+1 input
**When to use:** Any step that references output from a previous step

**Recommendation:** Use dot notation with bracket access for arrays (NOT full JSONPath). This matches `expr-lang/expr` syntax natively, so the same engine handles both interpolation resolution and condition evaluation.

Selector resolution hierarchy:
1. `params.<name>` -- runtime parameters
2. `steps.<step_id>.<field>` -- output data from a completed step
3. `steps.<step_id>._meta.<field>` -- step metadata (connector, action, duration_ms)

```yaml
steps:
  - id: get_customer
    uses: stripe/customers.get
    with:
      customer_id: "${{ params.customer_id }}"

  - id: send_notification
    uses: slack/messages.send
    with:
      channel: "${{ params.channel }}"
      # Dot notation for nested field access
      text: "Customer ${{ steps.get_customer.name }} (email: ${{ steps.get_customer.email }})"
```

**Missing data handling recommendation:** Use null with default via `??` operator. This matches `expr-lang/expr`'s nil coalescing operator natively.

```yaml
# Null coalescing for missing data
text: "${{ steps.get_customer.name ?? 'Unknown Customer' }}"
```

If a selector references a non-existent field without `??`, the resolved value is an empty string (not an error). This is forgiving for chain authors while still being predictable. Strict mode can be added later if needed.

### Pattern 3: Condition Evaluation

**What:** Step-level conditional execution based on previous step outputs
**When to use:** Any step with an `if:` field

**Recommendation:** Use step-level `if:` field (not a separate conditional block). The `if:` value is an expression evaluated by `expr-lang/expr`. This matches GitHub Actions' `if:` pattern.

```yaml
steps:
  - id: check_payment
    uses: stripe/payments.get
    with:
      payment_id: "${{ params.payment_id }}"

  - id: alert_large_payment
    uses: slack/messages.send
    if: "${{ steps.check_payment.amount > 10000 and steps.check_payment.status == 'succeeded' }}"
    with:
      channel: "#payments"
      text: "Large payment: ${{ steps.check_payment.amount }}"
```

**Boolean combinators:** Support `and`/`or`/`not` (expr-lang supports both word forms and `&&`/`||`/`!`). This adds expressiveness with zero implementation cost since expr already handles it.

**Skipped step output:** When a step is skipped due to `if:` evaluating false, its output is `null`. Subsequent steps referencing skipped step data get `null`, which they can handle via `??` coalescing or their own `if:` guards. This is predictable and non-surprising.

### Pattern 4: CLI Command Structure

**What:** How users interact with chains from the command line
**When to use:** All chain operations

**Recommendation:** New `chain` subcommand group (NOT extending `run`). Rationale: chains have different semantics than single actions -- they take files, have dry-run that shows execution plans, and have different output modes. Mixing into `run` would make it confusingly overloaded.

```bash
# Run a chain (pre-built or custom)
feelr chain run deploy-notify --repo owner/repo --channel "#deploys"
feelr chain run ./my-chain.yaml --repo owner/repo

# List available chains (built-in + local)
feelr chain list

# Validate a chain definition
feelr chain validate ./my-chain.yaml

# Show chain definition details
feelr chain show deploy-notify

# Dry-run: validate + show execution plan with mock data
feelr chain run deploy-notify --repo owner/repo --dry-run
```

**Parameter passing:** Use `--key value` flags (not `key=value` positional args). Rationale: chain params are declared with types and descriptions, so they map naturally to flags. This also avoids ambiguity with the chain file path argument. Cobra can auto-generate flags from chain param definitions.

**Output behavior:**
- Default: stdout gets JSON of final step output only (pipeable)
- `--verbose`: stderr shows each step's name, status, duration; stdout still gets final output
- `--format`: applies to final output (json/minimal/table)

### Pattern 5: Server-Side Chain Execution

**What:** Gateway endpoint for executing chains without CLI
**When to use:** When agents or the dashboard need to trigger chains

The gateway can execute chains internally by calling action handlers directly from the connector registry, avoiding HTTP subrequests entirely. This is efficient and stays well within Workers limits.

```
POST /v1/chains/run
Content-Type: application/json
X-Feelr-Key: <api-key>

{
  "chain": { ... chain definition as JSON ... },
  "params": { "repo": "owner/repo", "channel": "#general" }
}
```

The gateway chain executor:
1. Validates the chain definition against the schema
2. Resolves each step's `uses:` to a registered connector+action
3. Executes steps sequentially, calling `action.handler()` directly
4. Passes data between steps via an in-memory context object
5. Evaluates `if:` conditions (re-implement expr logic in TypeScript or use a simple evaluator)
6. Returns the final step's output in the standard envelope

**Workers feasibility (HIGH confidence):**
- Max 10 steps x ~1 fetch per step = ~10 subrequests (well within 1000 paid limit)
- CPU time is negligible (parsing + condition evaluation)
- No need for Cloudflare Workflows -- simple sequential execution within a single request is sufficient

### Anti-Patterns to Avoid

- **Don't use full JSONPath syntax:** JSONPath is overkill for this use case (max 10 steps, flat response objects). Dot notation + bracket access is sufficient and matches expr-lang natively.
- **Don't use Cloudflare Workflows for chain execution:** Adds durable execution complexity (state persistence, replay semantics) that is unnecessary for max-10-step sequential chains completing in seconds.
- **Don't make HTTP subrequests from gateway to itself for each step:** The gateway has direct access to the connector registry -- call `action.handler()` directly. Self-subrequests waste quota and add latency.
- **Don't build a custom expression parser:** expr-lang/expr is battle-tested, safe, fast, and supports all required operators. Hand-rolling will miss edge cases.
- **Don't combine chain commands into the existing `run` command:** Chains have fundamentally different semantics (file loading, multi-step output, execution plans). A separate `chain` subcommand keeps the CLI clean.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Condition evaluation | Custom parser for ==, !=, >, <, contains, etc. | `expr-lang/expr` | Handles operator precedence, string quoting, nested access, nil safety, AND/OR combinators. 70ns/op. |
| YAML parsing | Custom YAML tokenizer | `go.yaml.in/yaml/v3` | Full YAML 1.2 support, struct tags, streaming API. Already in go.mod. |
| Template interpolation | Full template engine | Regex-based `${{ }}` extractor + expr evaluation | The `${{ }}` syntax only needs to find delimiters and evaluate the inner expression. text/template is overkill and has different escaping rules. |
| JSON schema validation (gateway) | Custom validator | Zod schemas | Already used throughout gateway. Type-safe, composable. |
| CLI flag generation from chain params | Manual flag registration | Cobra dynamic flag creation in PersistentPreRunE | Cobra supports runtime flag creation. Parse chain definition first, then register param flags. |

**Key insight:** The expression evaluation problem (conditions + interpolation) looks simple but has many edge cases: nested field access, nil values, type coercion, operator precedence, string escaping. expr-lang/expr solves all of these with a single dependency.

## Common Pitfalls

### Pitfall 1: Template Interpolation Ambiguity
**What goes wrong:** Mixing `${{ }}` delimiters with YAML's own `{{ }}` mustache-like syntax causes parsing issues.
**Why it happens:** YAML treats `{{ }}` as plain strings, but some YAML tools or linters may flag them.
**How to avoid:** Always quote values containing `${{ }}` in YAML (use double quotes). Document this in chain authoring guide.
**Warning signs:** YAML parse errors mentioning "mapping" or "flow" when using unquoted template expressions.

### Pitfall 2: Step Output Shape Assumptions
**What goes wrong:** Chain authors assume step output has certain fields that depend on the upstream API response shape.
**Why it happens:** Feelr normalizes responses, but the exact fields vary per action (e.g., `issues.create` returns `number`, `title`, `state`; `messages.send` returns `ts`, `text`, `channel`).
**How to avoid:** Dry-run mode should show the expected output schema for each step. Pre-built chains document expected fields in comments. The `feelr chain show` command should display param definitions and output schemas.
**Warning signs:** Null values in interpolated strings, failed conditions on missing fields.

### Pitfall 3: Circular or Forward References
**What goes wrong:** A step references output from a step that hasn't executed yet, or from itself.
**Why it happens:** Chain definition allows referencing any `steps.<id>` without order validation.
**How to avoid:** Validate during loading that each step only references `steps.<id>` where `<id>` appears in a prior step. Reject forward references with a clear error message.
**Warning signs:** Nil/empty values in step inputs, runtime panics.

### Pitfall 4: Gateway Chain Execution Timeout
**What goes wrong:** A chain with multiple slow upstream API calls exceeds the client's HTTP timeout.
**Why it happens:** Each step makes a real API call. 10 steps at 2-3 seconds each = 20-30 seconds total. CLI's 30-second timeout may be insufficient.
**How to avoid:** Increase CLI timeout for chain execution (60-90 seconds). Gateway returns partial results on timeout. Consider streaming step progress via Server-Sent Events in a future iteration.
**Warning signs:** "context deadline exceeded" errors on chains with many steps.

### Pitfall 5: Retry Policy Interaction with Step Conditions
**What goes wrong:** A step fails, is retried, succeeds, but the condition that was based on the original failure state is now stale.
**Why it happens:** Global retry retries the failed step, but conditions in subsequent steps may have been evaluated against the failed state.
**How to avoid:** Retry at the step level, not the chain level. Re-evaluate all subsequent conditions after a retry. The global retry policy applies to individual step execution, not to the entire chain.
**Warning signs:** Steps executing when they shouldn't after a retry.

### Pitfall 6: Dynamic Flag Generation in Cobra
**What goes wrong:** Cobra requires flags to be registered before `Execute()` is called, but chain params aren't known until the chain file is parsed.
**Why it happens:** Cobra's flag parsing happens early in the command lifecycle.
**How to avoid:** Use `cobra.Command.PreRunE` to parse the chain file and validate that all required params were provided as `key=value` trailing args (like the existing `run` command) OR use `--param key=value` repeated flags. The `key=value` approach is simpler and consistent with `feelr run`.
**Warning signs:** "unknown flag" errors when trying to use chain-specific flags.

## Code Examples

### Chain Definition Struct (Go)

```go
// types.go
package chain

// ChainDefinition represents a complete chain definition loaded from YAML/JSON.
type ChainDefinition struct {
    Name        string      `yaml:"name" json:"name"`
    Description string      `yaml:"description" json:"description"`
    Version     string      `yaml:"version" json:"version"`
    Params      []ParamDef  `yaml:"params" json:"params"`
    Retry       RetryPolicy `yaml:"retry" json:"retry"`
    Steps       []StepDef   `yaml:"steps" json:"steps"`
}

// ParamDef declares a runtime parameter for the chain.
type ParamDef struct {
    Name        string `yaml:"name" json:"name"`
    Type        string `yaml:"type" json:"type"`         // string, number, boolean
    Required    bool   `yaml:"required" json:"required"`
    Default     string `yaml:"default,omitempty" json:"default,omitempty"`
    Description string `yaml:"description" json:"description"`
}

// RetryPolicy defines global retry behavior for failed steps.
type RetryPolicy struct {
    MaxAttempts  int `yaml:"max_attempts" json:"max_attempts"`
    DelaySeconds int `yaml:"delay_seconds" json:"delay_seconds"`
}

// StepDef defines a single step in the chain.
type StepDef struct {
    ID   string            `yaml:"id" json:"id"`
    Uses string            `yaml:"uses" json:"uses"`       // "connector/action" format
    If   string            `yaml:"if,omitempty" json:"if,omitempty"`
    With map[string]string `yaml:"with" json:"with"`       // param name -> value (may contain ${{ }} templates)
}
```

### Chain Loader (Go)

```go
// loader.go
package chain

import (
    "encoding/json"
    "fmt"
    "os"
    "path/filepath"
    "strings"

    "go.yaml.in/yaml/v3"
)

// Load reads a chain definition from a YAML or JSON file.
func Load(path string) (*ChainDefinition, error) {
    data, err := os.ReadFile(path)
    if err != nil {
        return nil, fmt.Errorf("reading chain file: %w", err)
    }

    var chain ChainDefinition
    ext := strings.ToLower(filepath.Ext(path))

    switch ext {
    case ".yaml", ".yml":
        if err := yaml.Unmarshal(data, &chain); err != nil {
            return nil, fmt.Errorf("parsing YAML chain: %w", err)
        }
    case ".json":
        if err := json.Unmarshal(data, &chain); err != nil {
            return nil, fmt.Errorf("parsing JSON chain: %w", err)
        }
    default:
        return nil, fmt.Errorf("unsupported chain file format: %s (use .yaml, .yml, or .json)", ext)
    }

    return &chain, Validate(&chain)
}

// Validate checks a chain definition for structural correctness.
func Validate(chain *ChainDefinition) error {
    if chain.Name == "" {
        return fmt.Errorf("chain name is required")
    }
    if len(chain.Steps) == 0 {
        return fmt.Errorf("chain must have at least one step")
    }
    if len(chain.Steps) > 10 {
        return fmt.Errorf("chain exceeds maximum of 10 steps (has %d)", len(chain.Steps))
    }

    // Validate step IDs are unique and uses format is valid
    seen := make(map[string]int) // step ID -> index
    for i, step := range chain.Steps {
        if step.ID == "" {
            return fmt.Errorf("step %d: id is required", i+1)
        }
        if _, exists := seen[step.ID]; exists {
            return fmt.Errorf("step %d: duplicate id %q", i+1, step.ID)
        }
        seen[step.ID] = i

        // Validate uses format: "connector/action"
        parts := strings.SplitN(step.Uses, "/", 2)
        if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
            return fmt.Errorf("step %d: invalid uses %q (expected connector/action)", i+1, step.Uses)
        }

        // Validate no forward references in with values
        // (references to steps that come after this one)
        // ... validation logic ...
    }

    return nil
}
```

### Template Interpolation (Go)

```go
// selector.go
package chain

import (
    "fmt"
    "regexp"
    "strings"

    "github.com/expr-lang/expr"
)

// templatePattern matches ${{ expression }} delimiters.
var templatePattern = regexp.MustCompile(`\$\{\{\s*(.*?)\s*\}\}`)

// ResolveTemplate replaces all ${{ expr }} occurrences in a string
// with evaluated values from the execution context.
func ResolveTemplate(template string, ctx *ExecutionContext) (string, error) {
    var lastErr error

    result := templatePattern.ReplaceAllStringFunc(template, func(match string) string {
        // Extract expression between ${{ and }}
        sub := templatePattern.FindStringSubmatch(match)
        if len(sub) < 2 {
            return match
        }
        expression := sub[1]

        // Build environment for expr evaluation
        env := ctx.BuildEnv()

        // Evaluate expression
        output, err := expr.Eval(expression, env)
        if err != nil {
            lastErr = fmt.Errorf("evaluating %q: %w", expression, err)
            return ""
        }

        return fmt.Sprintf("%v", output)
    })

    return result, lastErr
}

// ExecutionContext holds runtime state during chain execution.
type ExecutionContext struct {
    Params map[string]interface{}            // Runtime parameters
    Steps  map[string]map[string]interface{} // Step ID -> output data
}

// BuildEnv creates an expr-compatible environment map.
func (ctx *ExecutionContext) BuildEnv() map[string]interface{} {
    return map[string]interface{}{
        "params": ctx.Params,
        "steps":  ctx.Steps,
    }
}
```

### Condition Evaluation (Go)

```go
// condition.go
package chain

import (
    "fmt"

    "github.com/expr-lang/expr"
)

// EvaluateCondition evaluates an if expression against the execution context.
// Returns true if the step should execute, false if it should be skipped.
// An empty condition always returns true.
func EvaluateCondition(condition string, ctx *ExecutionContext) (bool, error) {
    if condition == "" {
        return true, nil
    }

    // Strip ${{ }} wrapper if present
    condition = stripTemplateDelimiters(condition)

    env := ctx.BuildEnv()

    output, err := expr.Eval(condition, env)
    if err != nil {
        return false, fmt.Errorf("condition evaluation failed: %w", err)
    }

    result, ok := output.(bool)
    if !ok {
        return false, fmt.Errorf("condition must evaluate to boolean, got %T", output)
    }

    return result, nil
}
```

### Step Executor (Go)

```go
// executor.go -- core execution loop (simplified)
package chain

import (
    "encoding/json"
    "fmt"
    "strings"
    "time"

    "github.com/andrewprograde/feelr/cli/internal/client"
)

// ExecuteChain runs a chain definition with the given parameters.
func ExecuteChain(
    chain *ChainDefinition,
    params map[string]string,
    gwClient *client.GatewayClient,
    verbose bool,
) (*StepResult, error) {
    // Build execution context
    ctx := &ExecutionContext{
        Params: make(map[string]interface{}),
        Steps:  make(map[string]map[string]interface{}),
    }

    // Populate params
    for k, v := range params {
        ctx.Params[k] = v
    }

    var lastResult *StepResult

    for i, step := range chain.Steps {
        // Evaluate condition
        shouldRun, err := EvaluateCondition(step.If, ctx)
        if err != nil {
            return nil, fmt.Errorf("step %q: %w", step.ID, err)
        }

        if !shouldRun {
            // Mark step as skipped with nil output
            ctx.Steps[step.ID] = nil
            if verbose {
                fmt.Fprintf(os.Stderr, "[%d/%d] %s: SKIPPED (condition false)\n",
                    i+1, len(chain.Steps), step.ID)
            }
            continue
        }

        // Parse connector/action from uses
        parts := strings.SplitN(step.Uses, "/", 2)
        connector, action := parts[0], parts[1]

        // Resolve template expressions in with params
        resolvedParams := make(map[string]string)
        for k, v := range step.With {
            resolved, err := ResolveTemplate(v, ctx)
            if err != nil {
                return nil, fmt.Errorf("step %q param %q: %w", step.ID, k, err)
            }
            resolvedParams[k] = resolved
        }

        // Execute via gateway client
        start := time.Now()
        resp, err := gwClient.Run(connector, action, resolvedParams, "")

        // Handle retry on failure
        if err != nil && chain.Retry.MaxAttempts > 1 {
            for attempt := 1; attempt < chain.Retry.MaxAttempts; attempt++ {
                time.Sleep(time.Duration(chain.Retry.DelaySeconds) * time.Second)
                resp, err = gwClient.Run(connector, action, resolvedParams, "")
                if err == nil {
                    break
                }
            }
        }

        if err != nil {
            return nil, fmt.Errorf("step %q failed: %w", step.ID, err)
        }

        duration := time.Since(start)

        // Parse response data into step output
        var stepOutput map[string]interface{}
        if err := json.Unmarshal(resp.Data, &stepOutput); err != nil {
            return nil, fmt.Errorf("step %q: parsing response: %w", step.ID, err)
        }

        // Store in context for subsequent steps
        ctx.Steps[step.ID] = stepOutput

        lastResult = &StepResult{
            StepID:   step.ID,
            Data:     resp.Data,
            Meta:     resp.Meta,
            Duration: duration,
        }

        if verbose {
            fmt.Fprintf(os.Stderr, "[%d/%d] %s: OK (%s)\n",
                i+1, len(chain.Steps), step.ID, duration.Round(time.Millisecond))
        }
    }

    return lastResult, nil
}
```

### Pre-Built Chain Example (YAML)

```yaml
# github-slack-issue-notify.yaml
name: github-slack-issue-notify
description: Creates a GitHub issue and posts a notification to Slack
version: "1.0"

params:
  - name: repo
    type: string
    required: true
    description: "Repository in owner/repo format"
  - name: title
    type: string
    required: true
    description: "Issue title"
  - name: channel
    type: string
    required: true
    description: "Slack channel ID or #name"
  - name: body
    type: string
    required: false
    default: ""
    description: "Issue body (markdown)"
  - name: labels
    type: string
    required: false
    default: ""
    description: "Comma-separated label names"

retry:
  max_attempts: 2
  delay_seconds: 3

steps:
  - id: create_issue
    uses: github/issues.create
    with:
      repo: "${{ params.repo }}"
      title: "${{ params.title }}"
      body: "${{ params.body }}"
      labels: "${{ params.labels }}"

  - id: notify_slack
    uses: slack/messages.send
    with:
      channel: "${{ params.channel }}"
      text: "New issue #${{ steps.create_issue.number }}: ${{ steps.create_issue.title }} - https://github.com/${{ params.repo }}/issues/${{ steps.create_issue.number }}"
```

## Discretionary Decision Recommendations

### 1. Step Action Reference: Combined `uses:` field
**Recommendation:** `uses: "connector/action"` (e.g., `uses: github/issues.create`)
**Rationale:** Single field is more concise, matches GitHub Actions `uses:` pattern, and the `connector/action` format maps 1:1 to the existing gateway route `POST /v1/{connector}/{action}`.

### 2. Chain File Organization: Flat with convention
**Recommendation:** Flat directory `~/.feelr/chains/` for user chains, embedded `chains/` directory for pre-built. No namespacing needed with max 10-20 chains.
**Rationale:** Namespacing adds complexity without benefit at this scale. File names are descriptive enough (e.g., `github-slack-issue-notify.yaml`).

### 3. Selector Syntax: Dot notation with expr-lang
**Recommendation:** Dot notation via expr-lang (`steps.create_issue.number`, `params.repo`). Support bracket notation for edge cases (`steps["my-step"].data`).
**Rationale:** Expr-lang already handles dot and bracket access natively. No need for JSONPath complexity.

### 4. Interpolation Style: `${{ }}` template strings
**Recommendation:** `${{ expression }}` syntax (e.g., `"Issue #${{ steps.create_issue.number }}"`)
**Rationale:** Familiar from GitHub Actions. The entire inner expression is evaluated by expr-lang, which handles string concatenation, field access, nil coalescing. Clean separation between literal text and dynamic values.

### 5. Missing Data Handling: Null with `??` coalescing
**Recommendation:** Missing fields resolve to empty string in interpolation. Use `??` for explicit defaults: `${{ steps.x.name ?? 'Unknown' }}`.
**Rationale:** Forgiving by default (empty string is safe in most contexts). Explicit `??` when default matters. Matches expr-lang's native nil coalescing.

### 6. Conditional Syntax: Step-level `if:` field
**Recommendation:** `if: "${{ expression }}"` on each step.
**Rationale:** Matches GitHub Actions pattern. Simple, flat, no nesting. Each step independently declares its execution condition.

### 7. Skipped Step Output: null resolution
**Recommendation:** Skipped steps have `null` output. Referencing skipped step data returns `nil`, which becomes empty string in interpolation or can be checked with `??`.
**Rationale:** Predictable, non-failing. Chain authors can guard against skipped steps with their own `if:` checks or `??` defaults.

### 8. Boolean Combinators: Support AND/OR/NOT
**Recommendation:** Full support via expr-lang (`and`/`or`/`not` or `&&`/`||`/`!`).
**Rationale:** Zero implementation cost (expr-lang handles it). Useful for multi-condition checks without requiring separate steps.

### 9. CLI Command Structure: New `chain` subcommand
**Recommendation:** `feelr chain run|list|validate|show`
**Rationale:** Clean separation from `feelr run`. Chains have different semantics (file loading, multi-step, execution plans). The `chain` namespace is intuitive.

### 10. Pre-Built Chains (5-6 covering all connectors)

| Chain | Connectors | Description |
|-------|-----------|-------------|
| `github-slack-issue-notify` | GitHub + Slack | Create issue, notify Slack channel |
| `github-discord-pr-notify` | GitHub + Discord | Get PR details, post to Discord channel |
| `stripe-slack-payment-alert` | Stripe + Slack | Check payment, alert Slack if amount > threshold |
| `github-stripe-customer-issue` | GitHub + Stripe | Get Stripe customer, create GitHub issue with details |
| `slack-discord-cross-post` | Slack + Discord | Search Slack messages, cross-post to Discord |
| `github-slack-pr-review` | GitHub + Slack | List open PRs, summarize in Slack message |

### 11. Global Retry Policy
**Recommendation:** Step-level retry (not chain-level). Default: `max_attempts: 1, delay_seconds: 0` (no retry). When set, each failing step is retried individually up to `max_attempts` with `delay_seconds` between attempts. On final failure, the chain halts and reports the error.
**Rationale:** Chain-level retry would re-execute already-succeeded steps (wasteful, potentially duplicating side effects). Step-level retry is precise.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `gopkg.in/yaml.v3` | `go.yaml.in/yaml/v3` | April 2025 | Drop-in replacement, actively maintained |
| `antonmedv/expr` | `expr-lang/expr` | 2024 | Same library, new org. Import path changed. |
| Custom condition parsers | expr-lang/expr | 2023+ | Industry standard for Go expression evaluation |
| JSONPath for data access | Dot notation + expr-lang | N/A | JSONPath is overkill for structured, known-shape data |

**Deprecated/outdated:**
- `gopkg.in/yaml.v3`: Unmaintained since April 2025. Use `go.yaml.in/yaml/v3` (identical API).
- `antonmedv/expr`: Package moved to `expr-lang/expr`. Old import still works but is deprecated.

## Open Questions

1. **Server-side condition evaluation engine**
   - What we know: Go side uses `expr-lang/expr`. Gateway side (TypeScript) needs equivalent.
   - What's unclear: Whether to use a TypeScript expression evaluator library or implement a simple subset manually.
   - Recommendation: For server-side, implement a minimal evaluator that handles the comparison operators and AND/OR since the chain format is constrained. Full expr compatibility is not needed -- chains are authored once and run in both contexts. Alternatively, use a lightweight JS expression evaluator like `expr-eval` or `filtrex`.

2. **Chain upload/storage mechanism**
   - What we know: Chains must be uploadable to gateway for server-side execution.
   - What's unclear: Storage backend (KV? D1?) and management API design.
   - Recommendation: Store chain definitions as JSON in KV (keyed by `chain:{name}`). Add admin routes for CRUD. This can be a follow-up sub-plan after the core engine works.

3. **Chain output envelope format**
   - What we know: CLI shows final step output by default.
   - What's unclear: What the gateway returns -- final step only, or all step results with metadata?
   - Recommendation: Gateway returns full execution trace (all steps with status/duration/output) so the client can choose what to display. The envelope wraps the chain result with step-level detail in meta.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: CLI structure (cmd/*.go), gateway routes (apps/gateway/src/routes/v1.ts), connector SDK (packages/connector-sdk/src/types.ts), connector implementations (connectors/*/src/index.ts)
- [go.yaml.in/yaml/v3 package documentation](https://pkg.go.dev/go.yaml.in/yaml/v3)
- [expr-lang/expr GitHub repository](https://github.com/expr-lang/expr) and [expr-lang.org documentation](https://expr-lang.org/docs/getting-started)
- [Cloudflare Workers limits documentation](https://developers.cloudflare.com/workers/platform/limits/)

### Secondary (MEDIUM confidence)
- [Cloudflare Workflows documentation](https://developers.cloudflare.com/workflows/) -- evaluated and rejected for this use case
- [GitHub Actions workflow syntax](https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions) -- inspiration for `${{ }}` and `if:` patterns
- [Cobra CLI framework](https://github.com/spf13/cobra) -- subcommand patterns

### Tertiary (LOW confidence)
- None -- all findings verified with primary or secondary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries verified via official docs, go.mod analysis, and codebase inspection
- Architecture: HIGH -- patterns derived from existing codebase structure and proven workflow patterns (GitHub Actions)
- Pitfalls: HIGH -- identified from codebase analysis (timeout limits, Cobra flag lifecycle, Workers subrequest limits) and domain knowledge
- Discretionary recommendations: MEDIUM -- based on pattern analysis and ecosystem conventions; user may have preferences

**Research date:** 2026-02-07
**Valid until:** 2026-03-09 (30 days -- stable domain, no fast-moving dependencies)
