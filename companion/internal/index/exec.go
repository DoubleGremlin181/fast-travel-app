package index

import (
	"context"
	"os/exec"
)

// Runner abstracts command execution so backends can be tested without shelling
// out to real binaries. Inject ExecRunner{} for production use.
type Runner interface {
	Run(ctx context.Context, name string, args ...string) (stdout []byte, err error)
}

// ExecRunner is the production Runner that shells out via exec.CommandContext.
// stdout is captured and returned; stderr is discarded (index tools write
// diagnostic output to stderr and meaningful results to stdout).
type ExecRunner struct{}

// Run executes name with the given args and returns its stdout.
func (ExecRunner) Run(ctx context.Context, name string, args ...string) ([]byte, error) {
	return exec.CommandContext(ctx, name, args...).Output()
}

// LookPath reports whether name is resolvable on PATH and returns the full
// binary path. It wraps exec.LookPath so callers do not import os/exec.
func LookPath(name string) (string, bool) {
	path, err := exec.LookPath(name)
	return path, err == nil
}
