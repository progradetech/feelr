// Package config handles TOML configuration loading with profile support
// and environment variable overrides.
package config

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/viper"
)

// Config holds the resolved configuration for a CLI session.
type Config struct {
	Gateway string
	APIKey  string
	Profile string
}

// Load reads configuration for the given profile from ~/.feelr/config.toml
// with environment variable overrides. Environment variables take precedence
// over config file values:
//   - FEELR_API_KEY overrides api_key
//   - FEELR_GATEWAY overrides gateway
func Load(profile string) (*Config, error) {
	v := viper.New()
	v.SetConfigName("config")
	v.SetConfigType("toml")

	// Config file search paths.
	home, err := os.UserHomeDir()
	if err == nil {
		v.AddConfigPath(filepath.Join(home, ".feelr"))
	}
	v.AddConfigPath(".")

	// Read config file; ignore not-found (env-only usage is valid).
	if err := v.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, fmt.Errorf("reading config file: %w", err)
		}
	}

	// Resolve profile section values.
	gateway := v.GetString(profile + ".gateway")
	apiKey := v.GetString(profile + ".api_key")

	// Environment variable overrides (highest precedence).
	if envKey := os.Getenv("FEELR_API_KEY"); envKey != "" {
		apiKey = envKey
	}
	if envGW := os.Getenv("FEELR_GATEWAY"); envGW != "" {
		gateway = envGW
	}

	// Default gateway if still empty.
	if gateway == "" {
		gateway = "https://api.feelr.dev"
	}

	return &Config{
		Gateway: gateway,
		APIKey:  apiKey,
		Profile: profile,
	}, nil
}

// ConfigPath returns the expected path for the config file.
func ConfigPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ".feelr/config.toml"
	}
	return filepath.Join(home, ".feelr", "config.toml")
}
