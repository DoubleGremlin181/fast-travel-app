package index

import (
	"context"

	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/protocol"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/query"
)

// everythingLimit caps the number of index candidates requested per invocation.
const everythingLimit = "500"

// EverythingIndexer queries Voidtools Everything via the es CLI (Everything
// Search). It supports native regex via es -r, making it the preferred
// regex-capable backend on Windows. Inert on Linux/macOS where es is absent.
type EverythingIndexer struct {
	runner Runner
	// Bin is the resolved es binary path, selected at construction time.
	// Exported so tests can set it explicitly without PATH lookups.
	Bin   string
	avail bool
}

// NewEverythingIndexer creates an EverythingIndexer using r for command
// execution. It resolves es / es.exe at construction time; Available() returns
// false if neither is on PATH (e.g. on Linux/macOS).
func NewEverythingIndexer(r Runner) *EverythingIndexer {
	bin, ok := LookPath("es")
	if !ok {
		bin, ok = LookPath("es.exe")
	}
	return &EverythingIndexer{runner: r, Bin: bin, avail: ok}
}

func (e *EverythingIndexer) ID() string      { return "everything" }
func (e *EverythingIndexer) Name() string    { return "Everything" }
func (e *EverythingIndexer) Available() bool { return e.avail }

// Capabilities for Everything (Voidtools):
//   - BooleanOps: true     — es space-separated terms imply AND
//   - PrefixWildcard: true — glob wildcard support
//   - InfixWildcard: true  — glob wildcard support
//   - Regex: true          — native regex via es -r
//   - PathScope: true      — Everything always indexes and returns full paths
//   - Content: false       — Everything is a path/name index only
func (e *EverythingIndexer) Capabilities() protocol.Capabilities {
	return protocol.Capabilities{
		BooleanOps:     true,
		PrefixWildcard: true,
		InfixWildcard:  true,
		Regex:          true,
		PathScope:      true,
		Content:        false,
	}
}

// Query returns candidate FileResults from the Everything index.
//
// Regex mode: Everything natively supports regex via es -r. The raw RE2
// pattern is forwarded directly as: es -r -n <LIMIT> -- <pattern>.
// degraded=false because results are a true regex index match.
//
// Substring mode: for each OR branch with a positive literal seed, issues
// one `es -n <LIMIT> -- <seed>` call (substring/glob match on path/name).
// Results across branches are unioned.
//
// es prints one full absolute path per line by default. normalizeAndDedupe
// stats each path and silently drops stale entries (path no longer exists).
func (e *EverythingIndexer) Query(ctx context.Context, ast query.Node, _ query.Mode, _ protocol.SearchRequest) ([]protocol.FileResult, bool, error) {
	if pat, ok := RegexPattern(ast); ok {
		// Everything natively supports regex; forward the raw pattern with -r.
		// degraded=false: the index itself performs regex filtering.
		out, err := e.runner.Run(ctx, e.Bin, "-r", "-n", everythingLimit, "--", pat)
		if err != nil {
			return normalizeAndDedupe(nil), false, err
		}
		return normalizeAndDedupe(parseWinPaths(out)), false, nil
	}

	// Substring mode: one invocation per OR branch with a resolvable seed.
	var all []string
	for _, branch := range ORBranches(ast) {
		seed, ok := PositiveSeed(branch)
		if !ok {
			// No positive literal anchor (e.g. pure negation); skip this branch.
			continue
		}
		out, err := e.runner.Run(ctx, e.Bin, "-n", everythingLimit, "--", seed)
		if err != nil {
			continue
		}
		all = append(all, parseWinPaths(out)...)
	}
	return normalizeAndDedupe(all), false, nil
}
