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
//   - FEELR_PROFILE selects the config profile (default: "default")
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

// Exists checks whether the config file exists at the default location.
func Exists() bool {
	_, err := os.Stat(ConfigPath())
	return err == nil
}

// LoadAdminToken reads the admin_token from the config file for the given profile.
// Returns empty string if not found.
func LoadAdminToken(profile string) string {
	v := viper.New()
	v.SetConfigName("config")
	v.SetConfigType("toml")

	home, err := os.UserHomeDir()
	if err == nil {
		v.AddConfigPath(filepath.Join(home, ".feelr"))
	}
	v.AddConfigPath(".")

	if err := v.ReadInConfig(); err != nil {
		return ""
	}

	return v.GetString(profile + ".admin_token")
}

// Write writes a config file for the given profile to ~/.feelr/config.toml.
// Uses simple string formatting (not Viper) to preserve comments and formatting.
// The config directory is created with 0700 permissions and the file with 0600
// (since it contains API keys).
func Write(cfg *Config) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("determining home directory: %w", err)
	}

	dir := filepath.Join(home, ".feelr")
	if err := os.MkdirAll(dir, 0700); err != nil {
		return fmt.Errorf("creating config directory: %w", err)
	}

	profile := cfg.Profile
	if profile == "" {
		profile = "default"
	}

	content := fmt.Sprintf(`# Feelr configuration
# See: https://feelr.dev/docs/config

[%s]
gateway = "%s"
api_key = "%s"
`, profile, cfg.Gateway, cfg.APIKey)

	configFile := filepath.Join(dir, "config.toml")
	if err := os.WriteFile(configFile, []byte(content), 0600); err != nil {
		return fmt.Errorf("writing config file: %w", err)
	}

	return nil
}
