package index

import (
	"bufio"
	"bytes"
	"context"
	"net/url"
	"strings"

	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/protocol"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/query"
)

// trackerLimit is the candidate cap passed to tracker as a CLI argument.
// trackerLimitN is the numeric equivalent used to detect a cap hit (Bug C).
const (
	trackerLimit  = "500"
	trackerLimitN = 500
)

// TrackerIndexer queries the GNOME Tracker (TinySPARQL) file index via the
// tracker3 or tracker CLI. tracker3 is preferred; tracker is the legacy fallback.
type TrackerIndexer struct {
	runner Runner
	// Bin is the resolved binary path selected at construction time.
	// Exported so callers and tests can verify which binary was chosen.
	Bin   string
	avail bool
}

// NewTrackerIndexer creates a TrackerIndexer using r for command execution.
// It resolves the binary once at construction (tracker3 preferred over tracker);
// Available() returns false if neither is on PATH.
func NewTrackerIndexer(r Runner) *TrackerIndexer {
	bin, ok := LookPath("tracker3")
	if !ok {
		bin, ok = LookPath("tracker")
	}
	return &TrackerIndexer{runner: r, Bin: bin, avail: ok}
}

func (t *TrackerIndexer) ID() string      { return "tracker" }
func (t *TrackerIndexer) Name() string    { return "GNOME Tracker" }
func (t *TrackerIndexer) Available() bool { return t.avail }

// Capabilities for Tracker:
//   - BooleanOps: false  — tracker search handles one pattern at a time
//   - PrefixWildcard: true — tracker supports prefix/stemmed matching
//   - InfixWildcard: false — no infix glob wildcard support
//   - Regex: false         — no native regex support
//   - PathScope: false     — Tracker is a content index, not a path-name index
//   - Content: true        — Tracker indexes file content
func (t *TrackerIndexer) Capabilities() protocol.Capabilities {
	return protocol.Capabilities{
		BooleanOps:     false,
		PrefixWildcard: true,
		InfixWildcard:  false,
		Regex:          false,
		PathScope:      false,
		Content:        true,
	}
}

// Query returns candidate FileResults from the GNOME Tracker index.
//
// Regex mode is not supported by tracker. If the AST is a regex node,
// Query returns (nil, true, nil) — degraded, no error — so the registry
// can route the query elsewhere.
//
// Otherwise, for each OR branch with a positive literal seed, issues one
// `<bin> search --files --limit 500 -- <seed>` call and unions the results.
//
// tracker3 search --files output format (the canned format our tests assert against):
//
//	Results:
//	  file:///home/user/Documents/report.pdf
//	  file:///home/user/Pictures/vacation%20photo.png
//
//	  2 results found.
//
// The "Results:" header, blank lines, and trailing count line are silently
// ignored — only lines containing a "file://" token are processed. The URL is
// percent-decoded via net/url, converted to a filesystem path, and normalized;
// stale entries that fail Normalize are silently dropped.
func (t *TrackerIndexer) Query(ctx context.Context, ast query.Node, _ query.Mode, _ protocol.SearchRequest) ([]protocol.FileResult, bool, error) {
	if _, ok := RegexPattern(ast); ok {
		// Tracker has no native regex; signal degraded so the registry routes elsewhere.
		return nil, true, nil
	}

	var all []string
	degraded := false
	for _, branch := range ORBranches(ast) {
		seed, ok := PositiveSeed(branch)
		if !ok {
			// No positive literal anchor (e.g. pure negation); skip this branch.
			continue
		}
		out, err := t.runner.Run(ctx, t.Bin, "search", "--files", "--limit", trackerLimit, "--", seed)
		if err != nil {
			continue
		}
		paths := parseTrackerOutput(out)
		if len(paths) >= trackerLimitN {
			// Cap hit: the index returned exactly the limit, so results may be
			// incomplete. Signal degraded so the count is not presented as exact.
			degraded = true
		}
		all = append(all, paths...)
	}
	return normalizeAndDedupe(all), degraded, nil
}

// parseTrackerOutput extracts filesystem paths from tracker search --files stdout.
// Tracker outputs file:// URLs, typically indented two spaces and preceded by a
// "Results:" header line and followed by a trailing count line. Any line that
// contains a "file://" token has the URL extracted from that position, trimmed,
// percent-decoded via net/url, and converted to an absolute filesystem path.
// Lines with no "file://" token (header, blank, count) are silently ignored.
func parseTrackerOutput(out []byte) []string {
	var paths []string
	sc := bufio.NewScanner(bytes.NewReader(out))
	for sc.Scan() {
		line := sc.Text()
		idx := strings.Index(line, "file://")
		if idx < 0 {
			continue
		}
		// Extract from "file://" to end of line (trim trailing whitespace).
		rawURL := strings.TrimSpace(line[idx:])
		u, err := url.Parse(rawURL)
		if err != nil || u.Scheme != "file" || u.Path == "" {
			continue
		}
		// u.Path is already percent-decoded by net/url.
		paths = append(paths, u.Path)
	}
	return paths
}
