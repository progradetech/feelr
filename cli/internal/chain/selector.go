package chain

// ResolveContext holds the runtime data available for template resolution.
// params: user-provided runtime parameters (map[string]string).
// steps: outputs from previously executed steps (map[string]interface{} keyed by step ID).
type ResolveContext struct {
	Params map[string]string
	Steps  map[string]interface{}
}

// ResolveTemplate resolves all ${{ expression }} templates in the given string
// against the provided context. Missing data resolves to empty string.
func ResolveTemplate(template string, ctx *ResolveContext) string {
	return ""
}

// ResolveStepWith resolves all template expressions in a step's With map,
// returning a new map with all values resolved.
func ResolveStepWith(with map[string]string, ctx *ResolveContext) map[string]string {
	return nil
}
