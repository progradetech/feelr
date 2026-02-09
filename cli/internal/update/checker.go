// Package update provides a silent CLI update checker that queries GitHub
// Releases with a 24-hour disk cache. Errors are silently ignored so that
// update checking never interferes with normal CLI operation.
package update

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const (
	// releasesURL is the GitHub API endpoint for the latest release.
	releasesURL = "https://api.github.com/repos/andrewprograde/feelr/releases/latest"

	// cacheTTL is how long to trust the cached version before rechecking.
	cacheTTL = 24 * time.Hour

	// httpTimeout caps the GitHub API request duration.
	httpTimeout = 5 * time.Second
)

// cacheEntry stores the last-checked version alongside a timestamp.
type cacheEntry struct {
	LatestVersion string `json:"latest_version"`
	CheckedAt     int64  `json:"checked_at"` // Unix seconds
}

// releaseResponse is the minimal GitHub release JSON we need.
type releaseResponse struct {
	TagName string `json:"tag_name"`
}

// CheckForUpdate compares currentVersion against the latest GitHub release.
// If a newer version is available, a one-line notice is printed to stderr.
// Development builds (version "dev") skip the check entirely.
// All errors are silently ignored -- this function never returns an error and
// never blocks normal CLI operation beyond the HTTP timeout.
func CheckForUpdate(currentVersion string) {
	if currentVersion == "dev" {
		return
	}

	latest, err := latestVersion(currentVersion)
	if err != nil || latest == "" {
		return
	}

	if compareVersions(currentVersion, latest) {
		fmt.Fprintf(os.Stderr,
			"Update available: %s -> %s (brew upgrade feelr or visit https://github.com/andrewprograde/feelr/releases)\n",
			currentVersion, latest)
	}
}

// latestVersion returns the latest release version, using the disk cache when
// fresh and falling back to a GitHub API call otherwise.
func latestVersion(currentVersion string) (string, error) {
	cachePath := cacheFilePath()

	// Try reading cached result.
	if data, err := os.ReadFile(cachePath); err == nil {
		var entry cacheEntry
		if json.Unmarshal(data, &entry) == nil {
			if time.Since(time.Unix(entry.CheckedAt, 0)) < cacheTTL {
				return entry.LatestVersion, nil
			}
		}
	}

	// Cache miss or stale -- fetch from GitHub.
	client := &http.Client{Timeout: httpTimeout}
	resp, err := client.Get(releasesURL)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	var release releaseResponse
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return "", err
	}

	latest := strings.TrimPrefix(release.TagName, "v")

	// Write cache (best-effort).
	writeCache(cachePath, latest)

	return latest, nil
}

// cacheFilePath returns the path to the update-check cache file.
func cacheFilePath() string {
	configDir, err := os.UserConfigDir()
	if err != nil {
		configDir = filepath.Join(os.Getenv("HOME"), ".config")
	}
	return filepath.Join(configDir, "feelr", "update-check")
}

// writeCache persists the latest version to the cache file. Errors are
// silently ignored since the cache is purely an optimization.
func writeCache(path, latestVersion string) {
	entry := cacheEntry{
		LatestVersion: latestVersion,
		CheckedAt:     time.Now().Unix(),
	}
	data, err := json.Marshal(entry)
	if err != nil {
		return
	}
	// Ensure directory exists.
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return
	}
	_ = os.WriteFile(path, data, 0600)
}

// compareVersions returns true if latest is strictly greater than current.
// Both strings are expected to be semver without the "v" prefix (e.g. "1.2.3").
func compareVersions(current, latest string) bool {
	cp := parseVersion(current)
	lp := parseVersion(latest)

	for i := 0; i < 3; i++ {
		if lp[i] > cp[i] {
			return true
		}
		if lp[i] < cp[i] {
			return false
		}
	}
	return false
}

// parseVersion splits a "major.minor.patch" string into [3]int.
// Missing or unparseable parts default to 0.
func parseVersion(v string) [3]int {
	var parts [3]int
	for i, s := range strings.SplitN(v, ".", 3) {
		if i >= 3 {
			break
		}
		n, err := strconv.Atoi(s)
		if err == nil {
			parts[i] = n
		}
	}
	return parts
}
