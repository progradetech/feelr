package auth

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"github.com/andrewprograde/feelr/cli/internal/client"
	"golang.org/x/term"
)

// IsInteractive checks whether stdin is connected to a terminal.
// Returns false for piped input, cron jobs, CI environments, etc.
func IsInteractive() bool {
	return term.IsTerminal(int(os.Stdin.Fd()))
}

// PromptReauth prompts the user to re-authenticate when a token has expired.
// Returns (true, nil) if the user accepts, (false, nil) if declined or non-interactive.
func PromptReauth(provider string) (bool, error) {
	if !IsInteractive() {
		return false, nil
	}

	fmt.Fprintf(os.Stderr, "Token expired. Re-authenticate now? [Y/n] ")

	scanner := bufio.NewScanner(os.Stdin)
	if !scanner.Scan() {
		return false, scanner.Err()
	}

	answer := strings.TrimSpace(scanner.Text())
	if answer == "" || strings.HasPrefix(strings.ToLower(answer), "y") {
		return true, nil
	}

	return false, nil
}

// ReauthError creates a CLIError for non-interactive token expiry.
// Exit code 2 (auth error) with clear re-authentication instructions.
func ReauthError(provider string) *client.CLIError {
	return &client.CLIError{
		ExitCode: 2,
		Message:  fmt.Sprintf("Authentication expired for %s. Run 'feelr auth %s' to re-authenticate.", provider, provider),
	}
}
