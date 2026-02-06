package main

import (
	"errors"
	"fmt"
	"os"

	"github.com/andrewprograde/feelr/cli/cmd"
	"github.com/andrewprograde/feelr/cli/internal/client"
)

// version is set by -ldflags at build time.
var version = "dev"

func main() {
	cmd.SetVersion(version)

	if err := cmd.Execute(); err != nil {
		// Format the error to stderr (Cobra's SilenceErrors means we handle it).
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(exitCodeFromError(err))
	}
}

func exitCodeFromError(err error) int {
	var cliErr *client.CLIError
	if errors.As(err, &cliErr) {
		return cliErr.ExitCode
	}
	return 1
}
