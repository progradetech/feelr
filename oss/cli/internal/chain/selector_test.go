package chain

import (
	"testing"
)

// helper builds a ResolveContext with common test data.
func testContext() *ResolveContext {
	return &ResolveContext{
		Params: map[string]string{
			"repo":   "owner/repo",
			"branch": "main",
			"label":  "bug",
		},
		Steps: map[string]interface{}{
			"create_issue": map[string]interface{}{
				"number": float64(42),
				"title":  "Fix login",
				"user": map[string]interface{}{
					"login":      "octocat",
					"avatar_url": "https://example.com/avatar.png",
				},
				"labels": []interface{}{
					map[string]interface{}{"name": "bug"},
					map[string]interface{}{"name": "urgent"},
				},
			},
			"list": map[string]interface{}{
				"items": []interface{}{
					map[string]interface{}{"name": "first", "id": float64(1)},
					map[string]interface{}{"name": "second", "id": float64(2)},
					map[string]interface{}{"name": "third", "id": float64(3)},
				},
				"total": float64(3),
			},
			"empty_step": map[string]interface{}{},
		},
	}
}

// --- Simple param resolution ---

func TestResolveTemplate_SimpleParam(t *testing.T) {
	ctx := testContext()
	got := ResolveTemplate("${{ params.repo }}", ctx)
	if got != "owner/repo" {
		t.Errorf("expected %q, got %q", "owner/repo", got)
	}
}

func TestResolveTemplate_ParamBranch(t *testing.T) {
	ctx := testContext()
	got := ResolveTemplate("${{ params.branch }}", ctx)
	if got != "main" {
		t.Errorf("expected %q, got %q", "main", got)
	}
}

// --- Step output: simple field ---

func TestResolveTemplate_StepSimpleField(t *testing.T) {
	ctx := testContext()
	got := ResolveTemplate("${{ steps.create_issue.number }}", ctx)
	if got != "42" {
		t.Errorf("expected %q, got %q", "42", got)
	}
}

func TestResolveTemplate_StepStringField(t *testing.T) {
	ctx := testContext()
	got := ResolveTemplate("${{ steps.create_issue.title }}", ctx)
	if got != "Fix login" {
		t.Errorf("expected %q, got %q", "Fix login", got)
	}
}

// --- Nested field access ---

func TestResolveTemplate_NestedField(t *testing.T) {
	ctx := testContext()
	got := ResolveTemplate("${{ steps.create_issue.user.login }}", ctx)
	if got != "octocat" {
		t.Errorf("expected %q, got %q", "octocat", got)
	}
}

func TestResolveTemplate_DeepNestedField(t *testing.T) {
	ctx := testContext()
	got := ResolveTemplate("${{ steps.create_issue.user.avatar_url }}", ctx)
	if got != "https://example.com/avatar.png" {
		t.Errorf("expected %q, got %q", "https://example.com/avatar.png", got)
	}
}

// --- Array index access ---

func TestResolveTemplate_ArrayIndex(t *testing.T) {
	ctx := testContext()
	got := ResolveTemplate("${{ steps.list.items[0].name }}", ctx)
	if got != "first" {
		t.Errorf("expected %q, got %q", "first", got)
	}
}

func TestResolveTemplate_ArrayIndexSecond(t *testing.T) {
	ctx := testContext()
	got := ResolveTemplate("${{ steps.list.items[1].name }}", ctx)
	if got != "second" {
		t.Errorf("expected %q, got %q", "second", got)
	}
}

func TestResolveTemplate_ArrayIndexLast(t *testing.T) {
	ctx := testContext()
	got := ResolveTemplate("${{ steps.list.items[2].id }}", ctx)
	if got != "3" {
		t.Errorf("expected %q, got %q", "3", got)
	}
}

func TestResolveTemplate_NestedArrayInStep(t *testing.T) {
	ctx := testContext()
	got := ResolveTemplate("${{ steps.create_issue.labels[0].name }}", ctx)
	if got != "bug" {
		t.Errorf("expected %q, got %q", "bug", got)
	}
}

func TestResolveTemplate_NestedArraySecondElement(t *testing.T) {
	ctx := testContext()
	got := ResolveTemplate("${{ steps.create_issue.labels[1].name }}", ctx)
	if got != "urgent" {
		t.Errorf("expected %q, got %q", "urgent", got)
	}
}

// --- Null coalescing ---

func TestResolveTemplate_NullCoalesceUsed(t *testing.T) {
	ctx := testContext()
	got := ResolveTemplate("${{ steps.missing.field ?? 'default' }}", ctx)
	if got != "default" {
		t.Errorf("expected %q, got %q", "default", got)
	}
}

func TestResolveTemplate_NullCoalesceNotNeeded(t *testing.T) {
	ctx := testContext()
	got := ResolveTemplate("${{ steps.create_issue.title ?? 'fallback' }}", ctx)
	if got != "Fix login" {
		t.Errorf("expected %q, got %q", "Fix login", got)
	}
}

func TestResolveTemplate_NullCoalesceOnNilNested(t *testing.T) {
	ctx := testContext()
	got := ResolveTemplate("${{ steps.create_issue.nonexistent.deep ?? 'Unknown' }}", ctx)
	if got != "Unknown" {
		t.Errorf("expected %q, got %q", "Unknown", got)
	}
}

func TestResolveTemplate_NullCoalesceDoubleQuotes(t *testing.T) {
	ctx := testContext()
	got := ResolveTemplate(`${{ steps.missing.x ?? "double-quoted" }}`, ctx)
	if got != "double-quoted" {
		t.Errorf("expected %q, got %q", "double-quoted", got)
	}
}

// --- Mixed template strings ---

func TestResolveTemplate_MixedString(t *testing.T) {
	ctx := testContext()
	got := ResolveTemplate("Issue #${{ steps.create_issue.number }} in ${{ params.repo }}", ctx)
	if got != "Issue #42 in owner/repo" {
		t.Errorf("expected %q, got %q", "Issue #42 in owner/repo", got)
	}
}

func TestResolveTemplate_MultipleExpressions(t *testing.T) {
	ctx := testContext()
	got := ResolveTemplate("${{ steps.create_issue.title }} by ${{ steps.create_issue.user.login }}", ctx)
	if got != "Fix login by octocat" {
		t.Errorf("expected %q, got %q", "Fix login by octocat", got)
	}
}

func TestResolveTemplate_ThreeExpressions(t *testing.T) {
	ctx := testContext()
	got := ResolveTemplate("${{ params.repo }}#${{ steps.create_issue.number }}: ${{ steps.create_issue.title }}", ctx)
	if got != "owner/repo#42: Fix login" {
		t.Errorf("expected %q, got %q", "owner/repo#42: Fix login", got)
	}
}

// --- No template ---

func TestResolveTemplate_NoTemplate(t *testing.T) {
	ctx := testContext()
	got := ResolveTemplate("no templates here", ctx)
	if got != "no templates here" {
		t.Errorf("expected %q, got %q", "no templates here", got)
	}
}

func TestResolveTemplate_EmptyString(t *testing.T) {
	ctx := testContext()
	got := ResolveTemplate("", ctx)
	if got != "" {
		t.Errorf("expected empty string, got %q", got)
	}
}

// --- Missing data returns empty string ---

func TestResolveTemplate_MissingParam(t *testing.T) {
	ctx := testContext()
	got := ResolveTemplate("${{ params.missing }}", ctx)
	if got != "" {
		t.Errorf("expected empty string, got %q", got)
	}
}

func TestResolveTemplate_MissingStep(t *testing.T) {
	ctx := testContext()
	got := ResolveTemplate("${{ steps.missing.field }}", ctx)
	if got != "" {
		t.Errorf("expected empty string, got %q", got)
	}
}

func TestResolveTemplate_MissingNestedField(t *testing.T) {
	ctx := testContext()
	got := ResolveTemplate("${{ steps.create_issue.nonexistent }}", ctx)
	if got != "" {
		t.Errorf("expected empty string, got %q", got)
	}
}

func TestResolveTemplate_MissingArrayIndex(t *testing.T) {
	ctx := testContext()
	got := ResolveTemplate("${{ steps.list.items[99].name }}", ctx)
	if got != "" {
		t.Errorf("expected empty string, got %q", got)
	}
}

func TestResolveTemplate_MissingDeepPath(t *testing.T) {
	ctx := testContext()
	got := ResolveTemplate("${{ steps.create_issue.user.login.extra.deep }}", ctx)
	if got != "" {
		t.Errorf("expected empty string, got %q", got)
	}
}

// --- Unknown namespace ---

func TestResolveTemplate_UnknownNamespace(t *testing.T) {
	ctx := testContext()
	got := ResolveTemplate("${{ env.HOME }}", ctx)
	if got != "" {
		t.Errorf("expected empty string, got %q", got)
	}
}

// --- Edge cases ---

func TestResolveTemplate_WhitespaceVariations(t *testing.T) {
	ctx := testContext()

	// Extra whitespace inside braces
	got := ResolveTemplate("${{   params.repo   }}", ctx)
	if got != "owner/repo" {
		t.Errorf("extra spaces: expected %q, got %q", "owner/repo", got)
	}

	// Minimal whitespace
	got = ResolveTemplate("${{params.repo}}", ctx)
	if got != "owner/repo" {
		t.Errorf("no spaces: expected %q, got %q", "owner/repo", got)
	}
}

func TestResolveTemplate_NilContext(t *testing.T) {
	// Should not panic with nil context
	got := ResolveTemplate("${{ params.repo }}", nil)
	if got != "" {
		t.Errorf("expected empty string for nil context, got %q", got)
	}
}

func TestResolveTemplate_EmptyContext(t *testing.T) {
	ctx := &ResolveContext{}
	got := ResolveTemplate("${{ params.repo }}", ctx)
	if got != "" {
		t.Errorf("expected empty string for empty context, got %q", got)
	}
}

func TestResolveTemplate_MixedWithMissing(t *testing.T) {
	ctx := testContext()
	// One expression resolves, one is missing -- missing becomes empty string
	got := ResolveTemplate("repo=${{ params.repo }}, missing=${{ params.missing }}", ctx)
	if got != "repo=owner/repo, missing=" {
		t.Errorf("expected %q, got %q", "repo=owner/repo, missing=", got)
	}
}

// --- ResolveStepWith ---

func TestResolveStepWith(t *testing.T) {
	ctx := testContext()
	input := map[string]string{
		"repo":    "${{ params.repo }}",
		"title":   "Issue #${{ steps.create_issue.number }}",
		"static":  "no-template",
		"missing": "${{ steps.missing.field }}",
	}

	got := ResolveStepWith(input, ctx)

	if got["repo"] != "owner/repo" {
		t.Errorf("repo: expected %q, got %q", "owner/repo", got["repo"])
	}
	if got["title"] != "Issue #42" {
		t.Errorf("title: expected %q, got %q", "Issue #42", got["title"])
	}
	if got["static"] != "no-template" {
		t.Errorf("static: expected %q, got %q", "no-template", got["static"])
	}
	if got["missing"] != "" {
		t.Errorf("missing: expected empty string, got %q", got["missing"])
	}
}

func TestResolveStepWith_NilInput(t *testing.T) {
	ctx := testContext()
	got := ResolveStepWith(nil, ctx)
	if got != nil {
		t.Errorf("expected nil for nil input, got %v", got)
	}
}
