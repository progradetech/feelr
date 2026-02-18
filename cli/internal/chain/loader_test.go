package chain

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadChainYAML(t *testing.T) {
	yaml := `
name: notify-on-issue
description: Create a Slack notification when a GitHub issue is opened
version: "1.0"
params:
  - name: repo
    type: string
    required: true
    description: GitHub repository (owner/repo)
  - name: channel
    type: string
    required: false
    description: Slack channel
    default: "#general"
retry:
  max_attempts: 3
  delay_seconds: 5
steps:
  - id: fetch_issue
    uses: github/issues.get
    with:
      repo: "${{ params.repo }}"
      issue_number: "${{ params.issue_number }}"
  - id: post_slack
    uses: slack/chat.postMessage
    with:
      channel: "${{ params.channel }}"
      text: "New issue: ${{ steps.fetch_issue.title }}"
    if: "steps.fetch_issue.status == 'success'"
    timeout: 30
`
	chain, err := LoadChainFromBytes([]byte(yaml), "yaml")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if chain.Name != "notify-on-issue" {
		t.Errorf("name = %q, want %q", chain.Name, "notify-on-issue")
	}
	if chain.Description != "Create a Slack notification when a GitHub issue is opened" {
		t.Errorf("description mismatch")
	}
	if chain.Version != "1.0" {
		t.Errorf("version = %q, want %q", chain.Version, "1.0")
	}
	if len(chain.Params) != 2 {
		t.Fatalf("params count = %d, want 2", len(chain.Params))
	}
	if chain.Params[0].Name != "repo" || chain.Params[0].Type != "string" || !chain.Params[0].Required {
		t.Errorf("param[0] = %+v, want repo/string/required", chain.Params[0])
	}
	if chain.Params[1].Default != "#general" {
		t.Errorf("param[1].Default = %q, want %q", chain.Params[1].Default, "#general")
	}
	if chain.Retry.MaxAttempts != 3 || chain.Retry.DelaySeconds != 5 {
		t.Errorf("retry = %+v, want {3, 5}", chain.Retry)
	}
	if len(chain.Steps) != 2 {
		t.Fatalf("steps count = %d, want 2", len(chain.Steps))
	}
	if chain.Steps[0].ID != "fetch_issue" || chain.Steps[0].Uses != "github/issues.get" {
		t.Errorf("step[0] = %+v", chain.Steps[0])
	}
	if chain.Steps[1].If != "steps.fetch_issue.status == 'success'" {
		t.Errorf("step[1].If = %q", chain.Steps[1].If)
	}
	if chain.Steps[1].Timeout != 30 {
		t.Errorf("step[1].Timeout = %d, want 30", chain.Steps[1].Timeout)
	}
}

func TestLoadChainJSON(t *testing.T) {
	jsonData := `{
  "name": "json-chain",
  "description": "A chain from JSON",
  "version": "2.0",
  "params": [
    {"name": "owner", "type": "string", "required": true, "description": "Repo owner"}
  ],
  "steps": [
    {"id": "step1", "uses": "github/repos.get", "with": {"owner": "${{ params.owner }}"}}
  ]
}`
	chain, err := LoadChainFromBytes([]byte(jsonData), "json")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if chain.Name != "json-chain" {
		t.Errorf("name = %q, want %q", chain.Name, "json-chain")
	}
	if chain.Version != "2.0" {
		t.Errorf("version = %q, want %q", chain.Version, "2.0")
	}
	if len(chain.Params) != 1 {
		t.Fatalf("params count = %d, want 1", len(chain.Params))
	}
	if len(chain.Steps) != 1 {
		t.Fatalf("steps count = %d, want 1", len(chain.Steps))
	}
	if chain.Steps[0].With["owner"] != "${{ params.owner }}" {
		t.Errorf("step[0].With[owner] = %q", chain.Steps[0].With["owner"])
	}
	// Default retry should be applied
	if chain.Retry.MaxAttempts != 1 {
		t.Errorf("retry.MaxAttempts = %d, want 1 (default)", chain.Retry.MaxAttempts)
	}
}

func TestLoadChainFromFile(t *testing.T) {
	dir := t.TempDir()

	// Test YAML file
	yamlPath := filepath.Join(dir, "chain.yaml")
	yamlContent := `
name: file-chain
description: loaded from file
version: "1.0"
steps:
  - id: s1
    uses: github/issues.list
    with:
      repo: test/repo
`
	if err := os.WriteFile(yamlPath, []byte(yamlContent), 0644); err != nil {
		t.Fatal(err)
	}
	chain, err := LoadChain(yamlPath)
	if err != nil {
		t.Fatalf("LoadChain YAML: %v", err)
	}
	if chain.Name != "file-chain" {
		t.Errorf("name = %q, want %q", chain.Name, "file-chain")
	}

	// Test JSON file
	jsonPath := filepath.Join(dir, "chain.json")
	jsonContent := `{"name": "json-file", "description": "from json file", "version": "1.0", "steps": [{"id": "s1", "uses": "slack/chat.postMessage", "with": {"text": "hi"}}]}`
	if err := os.WriteFile(jsonPath, []byte(jsonContent), 0644); err != nil {
		t.Fatal(err)
	}
	chain, err = LoadChain(jsonPath)
	if err != nil {
		t.Fatalf("LoadChain JSON: %v", err)
	}
	if chain.Name != "json-file" {
		t.Errorf("name = %q, want %q", chain.Name, "json-file")
	}

	// Test unsupported extension
	txtPath := filepath.Join(dir, "chain.txt")
	if err := os.WriteFile(txtPath, []byte("not a chain"), 0644); err != nil {
		t.Fatal(err)
	}
	_, err = LoadChain(txtPath)
	if err == nil {
		t.Fatal("expected error for .txt extension")
	}
	if !strings.Contains(err.Error(), "unsupported file extension") {
		t.Errorf("error = %q, want unsupported file extension message", err.Error())
	}
}

func TestLoadChainValidationTooManySteps(t *testing.T) {
	yaml := "name: big-chain\ndescription: too many\nversion: \"1.0\"\nsteps:\n"
	for i := 0; i < 11; i++ {
		yaml += "  - id: s" + string(rune('a'+i)) + "\n"
		yaml += "    uses: github/issues.list\n"
		yaml += "    with:\n      repo: test/repo\n"
	}
	_, err := LoadChainFromBytes([]byte(yaml), "yaml")
	if err == nil {
		t.Fatal("expected error for too many steps")
	}
	if !strings.Contains(err.Error(), "maximum is 10") {
		t.Errorf("error = %q, want maximum steps message", err.Error())
	}
}

func TestLoadChainValidationDuplicateStepIDs(t *testing.T) {
	yaml := `
name: dup-chain
description: duplicate IDs
version: "1.0"
steps:
  - id: fetch
    uses: github/issues.get
    with:
      repo: test/repo
  - id: fetch
    uses: slack/chat.postMessage
    with:
      text: hello
`
	_, err := LoadChainFromBytes([]byte(yaml), "yaml")
	if err == nil {
		t.Fatal("expected error for duplicate step IDs")
	}
	if !strings.Contains(err.Error(), "duplicate id") {
		t.Errorf("error = %q, want duplicate id message", err.Error())
	}
}

func TestLoadChainValidationInvalidUsesFormat(t *testing.T) {
	yaml := `
name: bad-uses
description: missing slash
version: "1.0"
steps:
  - id: s1
    uses: github-issues-list
    with:
      repo: test/repo
`
	_, err := LoadChainFromBytes([]byte(yaml), "yaml")
	if err == nil {
		t.Fatal("expected error for invalid uses format")
	}
	if !strings.Contains(err.Error(), "connector/action format") {
		t.Errorf("error = %q, want connector/action format message", err.Error())
	}
}

func TestLoadChainValidationForwardReference(t *testing.T) {
	yaml := `
name: fwd-ref
description: forward reference in if
version: "1.0"
steps:
  - id: first
    uses: github/issues.get
    with:
      repo: test/repo
    if: "steps.second.status == 'success'"
  - id: second
    uses: slack/chat.postMessage
    with:
      text: hello
`
	_, err := LoadChainFromBytes([]byte(yaml), "yaml")
	if err == nil {
		t.Fatal("expected error for forward reference")
	}
	if !strings.Contains(err.Error(), "forward step") {
		t.Errorf("error = %q, want forward step message", err.Error())
	}
}

func TestLoadChainValidationEmptyName(t *testing.T) {
	yaml := `
name: ""
description: no name
version: "1.0"
steps:
  - id: s1
    uses: github/issues.list
    with:
      repo: test/repo
`
	_, err := LoadChainFromBytes([]byte(yaml), "yaml")
	if err == nil {
		t.Fatal("expected error for empty name")
	}
	if !strings.Contains(err.Error(), "name is required") {
		t.Errorf("error = %q, want name is required message", err.Error())
	}
}

func TestLoadChainDefaultRetryPolicy(t *testing.T) {
	yaml := `
name: no-retry
description: no retry specified
version: "1.0"
steps:
  - id: s1
    uses: github/issues.list
    with:
      repo: test/repo
`
	chain, err := LoadChainFromBytes([]byte(yaml), "yaml")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if chain.Retry.MaxAttempts != 1 {
		t.Errorf("retry.MaxAttempts = %d, want 1", chain.Retry.MaxAttempts)
	}
	if chain.Retry.DelaySeconds != 0 {
		t.Errorf("retry.DelaySeconds = %d, want 0", chain.Retry.DelaySeconds)
	}
}

func TestLoadChainValidationInvalidParamType(t *testing.T) {
	yaml := `
name: bad-param
description: invalid param type
version: "1.0"
params:
  - name: count
    type: integer
    required: true
    description: a count
steps:
  - id: s1
    uses: github/issues.list
    with:
      repo: test/repo
`
	_, err := LoadChainFromBytes([]byte(yaml), "yaml")
	if err == nil {
		t.Fatal("expected error for invalid param type")
	}
	if !strings.Contains(err.Error(), "must be one of") {
		t.Errorf("error = %q, want type must be one of message", err.Error())
	}
}

func TestLoadChainValidationEmptyStepID(t *testing.T) {
	yaml := `
name: empty-id
description: step with empty id
version: "1.0"
steps:
  - id: ""
    uses: github/issues.list
    with:
      repo: test/repo
`
	_, err := LoadChainFromBytes([]byte(yaml), "yaml")
	if err == nil {
		t.Fatal("expected error for empty step id")
	}
	if !strings.Contains(err.Error(), "id is required") {
		t.Errorf("error = %q, want id is required message", err.Error())
	}
}

func TestLoadChainValidationEmptyUses(t *testing.T) {
	yaml := `
name: empty-uses
description: step with empty uses
version: "1.0"
steps:
  - id: s1
    uses: ""
    with:
      repo: test/repo
`
	_, err := LoadChainFromBytes([]byte(yaml), "yaml")
	if err == nil {
		t.Fatal("expected error for empty uses")
	}
	if !strings.Contains(err.Error(), "uses is required") {
		t.Errorf("error = %q, want uses is required message", err.Error())
	}
}

func TestLoadChainValidationNoSteps(t *testing.T) {
	yaml := `
name: no-steps
description: chain with no steps
version: "1.0"
steps: []
`
	_, err := LoadChainFromBytes([]byte(yaml), "yaml")
	if err == nil {
		t.Fatal("expected error for no steps")
	}
	if !strings.Contains(err.Error(), "at least 1 step") {
		t.Errorf("error = %q, want at least 1 step message", err.Error())
	}
}

func TestLoadChainValidationUsesExtraSlash(t *testing.T) {
	yaml := `
name: extra-slash
description: uses with too many slashes
version: "1.0"
steps:
  - id: s1
    uses: github/issues/list
    with:
      repo: test/repo
`
	// SplitN with limit 3 means "github/issues/list" splits to ["github","issues","list"] (len 3)
	// which fails the len(parts) != 2 check
	_, err := LoadChainFromBytes([]byte(yaml), "yaml")
	if err == nil {
		t.Fatal("expected error for uses with extra slash")
	}
	if !strings.Contains(err.Error(), "connector/action format") {
		t.Errorf("error = %q, want connector/action format message", err.Error())
	}
}
