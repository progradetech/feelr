package chain

// MaxSteps is the maximum number of steps allowed in a single chain definition.
const MaxSteps = 10

// MaxChainName is the maximum length of a chain name.
const MaxChainName = 64

// Chain represents a complete chain definition loaded from YAML or JSON.
type Chain struct {
	Name        string      `yaml:"name" json:"name"`
	Description string      `yaml:"description" json:"description"`
	Version     string      `yaml:"version" json:"version"`
	Params      []Param     `yaml:"params" json:"params"`
	Retry       RetryPolicy `yaml:"retry" json:"retry"`
	Steps       []Step      `yaml:"steps" json:"steps"`
}

// Param defines a runtime parameter that users provide when executing a chain.
type Param struct {
	Name        string `yaml:"name" json:"name"`
	Type        string `yaml:"type" json:"type"`
	Required    bool   `yaml:"required" json:"required"`
	Description string `yaml:"description" json:"description"`
	Default     string `yaml:"default,omitempty" json:"default,omitempty"`
}

// Step defines a single action in the chain execution sequence.
type Step struct {
	ID      string            `yaml:"id" json:"id"`
	Uses    string            `yaml:"uses" json:"uses"`
	With    map[string]string `yaml:"with" json:"with"`
	If      string            `yaml:"if,omitempty" json:"if,omitempty"`
	Timeout int               `yaml:"timeout,omitempty" json:"timeout,omitempty"`
}

// RetryPolicy defines the global retry behavior for chain steps.
type RetryPolicy struct {
	MaxAttempts  int `yaml:"max_attempts" json:"max_attempts"`
	DelaySeconds int `yaml:"delay_seconds" json:"delay_seconds"`
}
