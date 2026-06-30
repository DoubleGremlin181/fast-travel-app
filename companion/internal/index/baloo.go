package index

import (
	"bufio"
	"bytes"
	"context"
	"strings"

	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/protocol"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/query"
)

// balooLimit is the candidate cap passed to baloosearch as a CLI argument.
// balooLimitN is the numeric equivalent used to detect a cap hit (Bug C).
const (
	balooLimit  = "500"
	balooLimitN = 500
)

// BalooIndexer queries the KDE Baloo file index via the baloosearch CLI.
type BalooIndexer struct {
	runner Runner
	avail  bool
}

// NewBalooIndexer creates a BalooIndexer using r for command execution.
// Available() returns true if baloosearch is found on PATH.
func NewBalooIndexer(r Runner) *BalooIndexer {
	_, ok := LookPath("baloosearch")
	return &BalooIndexer{runner: r, avail: ok}
}

func (b *BalooIndexer) ID() string      { return "baloo" }
func (b *BalooIndexer) Name() string    { return "KDE Baloo" }
func (b *BalooIndexer) Available() bool { return b.avail }

// Capabilities for Baloo:
//   - BooleanOps: true   — Baloo's query language supports AND/OR/NOT
//   - PrefixWildcard: true
//   - InfixWildcard: true
//   - Regex: false        — baloosearch has no native regex support
//   - PathScope: true     — Baloo indexes by file path
//   - Content: true       — Baloo indexes file content
func (b *BalooIndexer) Capabilities() protocol.Capabilities {
	return protocol.Capabilities{
		BooleanOps:     true,
		PrefixWildcard: true,
		InfixWildcard:  true,
		Regex:          false,
		PathScope:      true,
		Content:        true,
	}
}

// Query returns candidate FileResults from the KDE Baloo index.
//
// Regex mode is not supported by baloosearch. If the AST is a regex node,
// Query returns (nil, true, nil) so the registry can route the query elsewhere.
//
// Otherwise, for each OR branch with a positive literal seed, issues one
// `baloosearch -l 500 -- <seed>` call and unions the results.
//
// baloosearch output format (confirmed on this host):
//
//	/absolute/path/to/file1
//	/absolute/path/to/file2
//	Elapsed: 11.4065 msecs
//
// The trailing "Elapsed: …" line and any other non-absolute-path lines are
// dropped by parseBalooOutput. All paths are normalized and deduplicated;
// stale index entries (Normalize fails) are silently skipped.
func (b *BalooIndexer) Query(ctx context.Context, ast query.Node, _ query.Mode, _ protocol.SearchRequest) ([]protocol.FileResult, bool, error) {
	if _, ok := RegexPattern(ast); ok {
		// Baloo has no regex; signal degraded so the registry routes elsewhere.
		return nil, true, nil
	}

	var all []string
	degraded := false
	for _, branch := range ORBranches(ast) {
		seed, ok := PositiveSeed(branch)
		if !ok {
			// No positive literal anchor; skip this branch.
			continue
		}
		out, err := b.runner.Run(ctx, "baloosearch", "-l", balooLimit, "--", seed)
		if err != nil {
			continue
		}
		paths := parseBalooOutput(out)
		if len(paths) >= balooLimitN {
			// Cap hit: the index returned exactly the limit, so results may be
			// incomplete. Signal degraded so the count is not presented as exact.
			degraded = true
		}
		all = append(all, paths...)
	}
	return normalizeAndDedupe(all), degraded, nil
}

// parseBalooOutput reads baloosearch stdout. baloosearch prints one absolute
// path per line and appends a trailing "Elapsed: N msecs" summary. Only lines
// beginning with '/' are treated as paths; all others are ignored silently.
func parseBalooOutput(out []byte) []string {
	var paths []string
	sc := bufio.NewScanner(bytes.NewReader(out))
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || !strings.HasPrefix(line, "/") {
			continue
		}
		paths = append(paths, line)
	}
	return paths
}
