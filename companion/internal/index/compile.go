package index

import (
	"strings"

	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/protocol"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/query"
)

// ORBranches returns the immediate child nodes when n is an "or" node, or a
// single-element slice containing n for any other op. Backends call this to
// iterate over independent OR branches and issue one native query per branch.
func ORBranches(n query.Node) []query.Node {
	if n.Op == "or" {
		return n.Nodes
	}
	return []query.Node{n}
}

// PositiveSeed returns the longest contiguous literal fragment from positive
// (not under a "not") term and phrase nodes in branch. Wildcard characters
// ('*' and '?') split a term value into fragments; the longest fragment wins.
// Regex nodes are always skipped — their values are not safe as literal seeds.
//
// Recall safety: using any literal substring as the native query seed means the
// index returns a superset of true matches. The pipeline matcher enforces the
// full query semantics over that superset.
//
// Returns ("", false) if no fragment of length ≥ 1 exists (e.g. pure negation,
// or a regex node).
func PositiveSeed(branch query.Node) (string, bool) {
	best := ""
	var walk func(n query.Node, negated bool)
	walk = func(n query.Node, negated bool) {
		switch n.Op {
		case "and", "or":
			for _, child := range n.Nodes {
				walk(child, negated)
			}
		case "not":
			if n.Node != nil {
				walk(*n.Node, true)
			}
		case "term", "phrase":
			if negated {
				return
			}
			for _, frag := range wildcardFragments(n.Value) {
				if len(frag) > len(best) {
					best = frag
				}
			}
			// "regex": intentionally skipped — pass through to default.
		}
	}
	walk(branch, false)
	if len(best) == 0 {
		return "", false
	}
	return best, true
}

// wildcardFragments splits s on '*' and '?' and returns the non-empty pieces.
// A value with no wildcards returns a single-element slice [s].
func wildcardFragments(s string) []string {
	return strings.FieldsFunc(s, func(r rune) bool {
		return r == '*' || r == '?'
	})
}

// RegexPattern returns (n.Value, true) when n is a "regex" node, signalling
// that the query was parsed in regex mode and the pattern can be forwarded
// directly to an index binary that supports native regex (e.g. plocate --regexp).
func RegexPattern(n query.Node) (string, bool) {
	if n.Op == "regex" {
		return n.Value, true
	}
	return "", false
}

// normalizeAndDedupe converts a slice of filesystem paths into FileResults.
// Each path is stat-ed via Normalize; paths that fail (stale index entries)
// are silently skipped. Duplicate paths are removed. The returned slice is
// always non-nil.
func normalizeAndDedupe(paths []string) []protocol.FileResult {
	seen := make(map[string]struct{}, len(paths))
	results := make([]protocol.FileResult, 0, len(paths))
	for _, p := range paths {
		if _, dup := seen[p]; dup {
			continue
		}
		seen[p] = struct{}{}
		r, err := Normalize(p)
		if err != nil {
			continue // stale index entry — path no longer exists
		}
		results = append(results, r)
	}
	return results
}
