package index

import (
	"bufio"
	"bytes"
	"context"
	"strings"

	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/protocol"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/query"
)

// plocateLimit caps the number of index candidates requested per invocation.
// The pipeline paginates the final result set, so 500 is a reasonable ceiling.
const plocateLimit = "500"

// PlocateIndexer queries the plocate (or locate) mlocate-compatible database.
// It prefers the plocate binary and falls back to locate.
type PlocateIndexer struct {
	runner Runner
	// Bin is the resolved binary path selected at construction time.
	// Exported so callers and tests can verify which binary was chosen.
	Bin   string
	avail bool
}

// NewPlocateIndexer creates a PlocateIndexer using r for command execution.
// It resolves the binary once at construction (plocate preferred over locate);
// Available() returns false if neither is on PATH.
func NewPlocateIndexer(r Runner) *PlocateIndexer {
	bin, ok := LookPath("plocate")
	if !ok {
		bin, ok = LookPath("locate")
	}
	return &PlocateIndexer{runner: r, Bin: bin, avail: ok}
}

func (p *PlocateIndexer) ID() string      { return "plocate" }
func (p *PlocateIndexer) Name() string    { return "plocate" }
func (p *PlocateIndexer) Available() bool { return p.avail }

// Capabilities for plocate:
//   - BooleanOps: false  — plocate matches one pattern at a time
//   - PrefixWildcard: true — plocate accepts glob patterns
//   - InfixWildcard: true  — plocate accepts glob patterns
//   - Regex: true          — plocate --regexp / --regex
//   - PathScope: true      — plocate always matches on the full path
//   - Content: false       — plocate is a path-name index only
func (p *PlocateIndexer) Capabilities() protocol.Capabilities {
	return protocol.Capabilities{
		BooleanOps:     false,
		PrefixWildcard: true,
		InfixWildcard:  true,
		Regex:          true,
		PathScope:      true,
		Content:        false,
	}
}

// Query returns candidate FileResults from the plocate index.
//
// Regex mode: issues a single `<bin> --regexp -i -l 500 -- <pattern>` call.
// plocate handles BRE regex natively; degraded is false.
//
// Substring mode: for each OR branch that has a positive literal seed, issues
// one `<bin> -i -l 500 -- <seed>` call (case-insensitive substring match on
// the full path). Results across branches are unioned. A branch with no
// positive seed (e.g. pure negation) is skipped — no index seed exists.
//
// All paths from stdout are normalized and deduplicated. Paths that fail
// Normalize (stale index entries) are silently dropped.
func (p *PlocateIndexer) Query(ctx context.Context, ast query.Node, _ query.Mode, _ protocol.SearchRequest) ([]protocol.FileResult, bool, error) {
	if pat, ok := RegexPattern(ast); ok {
		out, err := p.runner.Run(ctx, p.Bin, "--regexp", "-i", "-l", plocateLimit, "--", pat)
		if err != nil {
			return nil, false, err
		}
		return normalizeAndDedupe(parsePlocatePaths(out)), false, nil
	}

	// Substring mode: one invocation per OR branch with a resolvable seed.
	var all []string
	for _, branch := range ORBranches(ast) {
		seed, ok := PositiveSeed(branch)
		if !ok {
			// No positive literal anchor (e.g. pure negation); skip this branch.
			continue
		}
		out, err := p.runner.Run(ctx, p.Bin, "-i", "-l", plocateLimit, "--", seed)
		if err != nil {
			continue
		}
		all = append(all, parsePlocatePaths(out)...)
	}
	return normalizeAndDedupe(all), false, nil
}

// parsePlocatePaths reads plocate stdout: one absolute path per line.
// Blank and whitespace-only lines are ignored.
func parsePlocatePaths(out []byte) []string {
	var paths []string
	sc := bufio.NewScanner(bytes.NewReader(out))
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line != "" {
			paths = append(paths, line)
		}
	}
	return paths
}
