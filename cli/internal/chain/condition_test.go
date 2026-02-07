package chain

import (
	"testing"
)

func TestEvalCondition_NumericGreaterThan(t *testing.T) {
	ctx := testContext()
	got, err := EvalCondition("42 > 0", ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !got {
		t.Error("expected true for 42 > 0")
	}
}

func TestEvalCondition_StringEquals(t *testing.T) {
	ctx := testContext()
	got, err := EvalCondition("hello == hello", ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !got {
		t.Error("expected true for hello == hello")
	}
}

func TestEvalCondition_StringNotEquals(t *testing.T) {
	ctx := testContext()
	got, err := EvalCondition("hello != world", ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !got {
		t.Error("expected true for hello != world")
	}
}

func TestEvalCondition_Contains(t *testing.T) {
	ctx := testContext()
	got, err := EvalCondition("hello world contains world", ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !got {
		t.Error("expected true for 'hello world contains world'")
	}
}

func TestEvalCondition_ExistsWithValue(t *testing.T) {
	ctx := testContext()
	got, err := EvalCondition("exists somevalue", ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !got {
		t.Error("expected true for 'exists somevalue'")
	}
}

func TestEvalCondition_ExistsEmpty(t *testing.T) {
	ctx := testContext()
	got, err := EvalCondition("exists ", ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got {
		t.Error("expected false for 'exists ' (empty value)")
	}
}

func TestEvalCondition_AndBothTrue(t *testing.T) {
	ctx := testContext()
	got, err := EvalCondition("42 > 0 && hello == hello", ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !got {
		t.Error("expected true for '42 > 0 && hello == hello'")
	}
}

func TestEvalCondition_OrOneTrue(t *testing.T) {
	ctx := testContext()
	got, err := EvalCondition("42 > 100 || hello == hello", ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !got {
		t.Error("expected true for '42 > 100 || hello == hello'")
	}
}

func TestEvalCondition_AndOneFalse(t *testing.T) {
	ctx := testContext()
	got, err := EvalCondition("42 > 100 && hello == hello", ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got {
		t.Error("expected false for '42 > 100 && hello == hello'")
	}
}

func TestEvalCondition_LessThanOrEqual(t *testing.T) {
	ctx := testContext()
	got, err := EvalCondition("5 <= 5", ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !got {
		t.Error("expected true for '5 <= 5'")
	}
}

func TestEvalCondition_GreaterThanOrEqualFalse(t *testing.T) {
	ctx := testContext()
	got, err := EvalCondition("5 >= 6", ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got {
		t.Error("expected false for '5 >= 6'")
	}
}

func TestEvalCondition_EmptyExpression(t *testing.T) {
	ctx := testContext()
	got, err := EvalCondition("", ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !got {
		t.Error("expected true for empty expression (unconditional)")
	}
}

func TestEvalCondition_TemplateResolution(t *testing.T) {
	ctx := &ResolveContext{
		Params: map[string]string{},
		Steps: map[string]interface{}{
			"x": map[string]interface{}{
				"count": float64(5),
			},
		},
	}
	got, err := EvalCondition("${{ steps.x.count }} > 0", ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !got {
		t.Error("expected true for '${{ steps.x.count }} > 0' with count=5")
	}
}

func TestEvalCondition_TemplateResolvesToFalseCondition(t *testing.T) {
	ctx := &ResolveContext{
		Params: map[string]string{},
		Steps: map[string]interface{}{
			"x": map[string]interface{}{
				"count": float64(0),
			},
		},
	}
	got, err := EvalCondition("${{ steps.x.count }} > 5", ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got {
		t.Error("expected false for '${{ steps.x.count }} > 5' with count=0")
	}
}

func TestEvalCondition_LessThan(t *testing.T) {
	ctx := testContext()
	got, err := EvalCondition("3 < 10", ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !got {
		t.Error("expected true for '3 < 10'")
	}
}

func TestEvalCondition_LessThanFalse(t *testing.T) {
	ctx := testContext()
	got, err := EvalCondition("10 < 3", ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got {
		t.Error("expected false for '10 < 3'")
	}
}

func TestEvalCondition_NotEqualsFalse(t *testing.T) {
	ctx := testContext()
	got, err := EvalCondition("hello != hello", ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got {
		t.Error("expected false for 'hello != hello'")
	}
}

func TestEvalCondition_ContainsFalse(t *testing.T) {
	ctx := testContext()
	got, err := EvalCondition("hello world contains xyz", ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got {
		t.Error("expected false for 'hello world contains xyz'")
	}
}

func TestEvalCondition_SimpleTruthy(t *testing.T) {
	ctx := testContext()
	got, err := EvalCondition("anything", ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !got {
		t.Error("expected true for truthy value 'anything'")
	}
}

func TestEvalCondition_TruthyFalse(t *testing.T) {
	ctx := testContext()
	got, err := EvalCondition("false", ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got {
		t.Error("expected false for truthy value 'false'")
	}
}

func TestEvalCondition_TruthyZero(t *testing.T) {
	ctx := testContext()
	got, err := EvalCondition("0", ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got {
		t.Error("expected false for truthy value '0'")
	}
}

func TestEvalCondition_ComplexOrAnd(t *testing.T) {
	ctx := testContext()
	// (1 > 10 && yes == yes) || (5 <= 5)
	// first OR group: false && true = false
	// second OR group: true
	// result: true
	got, err := EvalCondition("1 > 10 && yes == yes || 5 <= 5", ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !got {
		t.Error("expected true for complex OR/AND expression")
	}
}

func TestEvalCondition_GreaterThanOrEqualTrue(t *testing.T) {
	ctx := testContext()
	got, err := EvalCondition("10 >= 5", ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !got {
		t.Error("expected true for '10 >= 5'")
	}
}

func TestEvalCondition_GreaterThanOrEqualEqual(t *testing.T) {
	ctx := testContext()
	got, err := EvalCondition("5 >= 5", ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !got {
		t.Error("expected true for '5 >= 5'")
	}
}

func TestEvalCondition_NilContext(t *testing.T) {
	// With nil context, templates resolve to empty, empty expression = true.
	got, err := EvalCondition("", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !got {
		t.Error("expected true for empty expression with nil context")
	}
}

func TestEvalCondition_TemplateExistsCheck(t *testing.T) {
	ctx := &ResolveContext{
		Params: map[string]string{"token": "abc123"},
		Steps:  map[string]interface{}{},
	}
	got, err := EvalCondition("exists ${{ params.token }}", ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !got {
		t.Error("expected true for 'exists ${{ params.token }}' with token set")
	}
}

func TestEvalCondition_TemplateMissingExists(t *testing.T) {
	ctx := &ResolveContext{
		Params: map[string]string{},
		Steps:  map[string]interface{}{},
	}
	got, err := EvalCondition("exists ${{ params.token }}", ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got {
		t.Error("expected false for 'exists ${{ params.token }}' with missing token")
	}
}
