package index

import (
	"context"

	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/protocol"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/query"
)

// everythingLimit is the candidate cap passed to es as a CLI argument.
// everythingLimitN is the numeric equivalent used to detect a cap hit (Bug C).
const (
	everythingLimit  = "500"
	everythingLimitN = 500
)

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
// Regex mode: Everything natively supports regex via es -r.
// es uses ECMAScript regex, not RE2. The common subset (\d \w . * + ? {n} [...])
// is compatible; RE2-only constructs ((?i), (?P<name>...), \p{...}) may cause
// es to fail/return empty — under-return for those inputs. The RE2 matcher
// post-filters for precision but cannot recover missing candidates.
// degraded=false because results are a true regex index match.
//
// Substring mode: for each OR branch with a positive literal seed, issues
// one `es -full-path-and-name -n <LIMIT> -- <seed>` call.
// Results across branches are unioned.
//
// -full-path-and-name forces es to emit full paths even on non-default
// Everything configurations; normalizeAndDedupe stats each path and silently
// drops stale entries (path no longer exists).
func (e *EverythingIndexer) Query(ctx context.Context, ast query.Node, _ query.Mode, _ protocol.SearchRequest) ([]protocol.FileResult, bool, error) {
	if pat, ok := RegexPattern(ast); ok {
		// Everything natively supports regex; forward the raw pattern with -r.
		// -full-path-and-name ensures full paths regardless of es configuration.
		// degraded=false: the index itself performs regex filtering.
		out, err := e.runner.Run(ctx, e.Bin, "-r", "-full-path-and-name", "-n", everythingLimit, "--", pat)
		if err != nil {
			return normalizeAndDedupe(nil), false, err
		}
		paths := parseWinPaths(out)
		degraded := len(paths) >= everythingLimitN
		return normalizeAndDedupe(paths), degraded, nil
	}

	// Substring mode: one invocation per OR branch with a resolvable seed.
	var all []string
	degraded := false
	for _, branch := range ORBranches(ast) {
		seed, ok := PositiveSeed(branch)
		if !ok {
			// No positive literal anchor (e.g. pure negation); skip this branch.
			continue
		}
		out, err := e.runner.Run(ctx, e.Bin, "-full-path-and-name", "-n", everythingLimit, "--", seed)
		if err != nil {
			continue
		}
		paths := parseWinPaths(out)
		if len(paths) >= everythingLimitN {
			// Cap hit: the index returned exactly the limit, so results may be
			// incomplete. Signal degraded so the count is not presented as exact.
			degraded = true
		}
		all = append(all, paths...)
	}
	return normalizeAndDedupe(all), degraded, nil
}
