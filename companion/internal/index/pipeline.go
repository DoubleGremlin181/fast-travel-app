package index

import (
	"context"
	"sort"
	"strings"
	"time"

	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/protocol"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/query"
)

// Search runs the full search pipeline:
//  1. Parse the query; return an error (mapped to bad_request by the server) on failure.
//  2. Fetch candidates from the indexer.
//  3. Post-filter with the matcher for correctness:
//     - TitleOnly=false: broaden each "name"-scoped leaf to also match "path",
//       so a plain term like "report" matches both filenames and path components.
//     - TitleOnly=true: coerce all leaf fields to "name" so path-only hits are excluded.
//  4. Apply request filters (Types, ModifiedRange, CreatedRange, PathPrefix).
//  5. Score each result (nameBucket×10 + historyBoost + recency).
//  6. Stable-sort (relevance/created/modified × asc/desc) with Name/Path tiebreak.
//  7. Paginate and return a SearchResponse with a non-nil Results slice.
func Search(ctx context.Context, idx Indexer, req protocol.SearchRequest) (protocol.SearchResponse, error) {
	start := time.Now()

	ast, err := query.Parse(req.Query, req.QueryMode)
	if err != nil {
		return protocol.SearchResponse{}, err
	}

	raw, degraded, err := idx.Query(ctx, ast, req.QueryMode, req)
	if err != nil {
		return protocol.SearchResponse{}, err
	}

	// Build the match AST based on TitleOnly.
	var matchAst query.Node
	if req.Filters.TitleOnly {
		matchAst = coerceFieldsToName(ast)
	} else {
		matchAst = broadenToPath(ast)
	}

	// Post-filter: guarantee correctness via the matcher.
	filtered := make([]protocol.FileResult, 0, len(raw))
	for _, r := range raw {
		if Matches(r, matchAst, req.QueryMode) {
			filtered = append(filtered, r)
		}
	}

	// Apply request filters.
	filtered = applyFilters(filtered, req.Filters)

	// Score each surviving result.
	terms := collectTerms(ast)
	for i := range filtered {
		filtered[i].Score = scoreResult(filtered[i], terms, req.History)
	}

	// Sort results.
	sortResults(filtered, req.Sort)

	total := len(filtered)

	// Paginate.
	page := req.Page
	if page < 0 {
		page = 0
	}
	size := req.PageSize

	var pageSlice []protocol.FileResult
	if size <= 0 {
		// PageSize <= 0 means "return all"; tests always pass a positive size.
		pageSlice = filtered
	} else {
		lo := page * size
		hi := lo + size
		if lo >= total {
			pageSlice = []protocol.FileResult{} // out-of-range page → empty, not nil
		} else {
			if hi > total {
				hi = total
			}
			pageSlice = append([]protocol.FileResult(nil), filtered[lo:hi]...)
		}
	}
	if pageSlice == nil {
		pageSlice = []protocol.FileResult{}
	}

	return protocol.SearchResponse{
		Results:  pageSlice,
		Total:    total,
		Page:     page,
		TookMs:   time.Since(start).Milliseconds(),
		Indexer:  idx.ID(),
		Degraded: degraded,
	}, nil
}

// broadenToPath expands every leaf node with field="name" into an OR that also
// checks field="path". This is the default (TitleOnly=false) behaviour: a plain
// term like "report" matches both filenames and directory path components.
// Leaves that already carry an explicit field (e.g. path:Finance) are unchanged.
func broadenToPath(n query.Node) query.Node {
	switch n.Op {
	case "and", "or":
		children := make([]query.Node, len(n.Nodes))
		for i, child := range n.Nodes {
			children[i] = broadenToPath(child)
		}
		out := n
		out.Nodes = children
		return out
	case "not":
		if n.Node == nil {
			return n
		}
		inner := broadenToPath(*n.Node)
		out := n
		out.Node = &inner
		return out
	case "term", "phrase", "regex":
		if n.Field != "name" {
			return n
		}
		pathLeaf := n
		pathLeaf.Field = "path"
		return query.Node{Op: "or", Nodes: []query.Node{n, pathLeaf}}
	default:
		return n
	}
}

// coerceFieldsToName returns a copy of the AST with every leaf's Field set to
// "name". Used when TitleOnly=true so path-scoped queries match only filenames
// and path-only hits are excluded from results.
func coerceFieldsToName(n query.Node) query.Node {
	switch n.Op {
	case "and", "or":
		children := make([]query.Node, len(n.Nodes))
		for i, child := range n.Nodes {
			children[i] = coerceFieldsToName(child)
		}
		out := n
		out.Nodes = children
		return out
	case "not":
		if n.Node == nil {
			return n
		}
		inner := coerceFieldsToName(*n.Node)
		out := n
		out.Node = &inner
		return out
	case "term", "phrase", "regex":
		out := n
		out.Field = "name"
		return out
	default:
		return n
	}
}

// collectTerms recursively collects the Value of every positive term/phrase leaf
// in the AST. Regex nodes are excluded (they don't contribute to name-bucket
// scoring). NOT subtrees are also skipped so negative terms like "-spam" in
// "report -spam" never inflate a score.
func collectTerms(n query.Node) []string {
	var terms []string
	var walk func(query.Node)
	walk = func(n query.Node) {
		switch n.Op {
		case "and", "or":
			for _, child := range n.Nodes {
				walk(child)
			}
		// "not": intentionally skipped — negative terms must not influence scoring.
		case "term", "phrase":
			terms = append(terms, n.Value)
		// "regex": intentionally excluded from scoring
		}
	}
	walk(n)
	return terms
}

// applyFilters applies each request filter independently, in-place.
// CreatedRange: if any bound is set and r.CreatedAt==0 (birth-time unknown on
// this host), the result is excluded — we cannot prove it falls in range.
func applyFilters(results []protocol.FileResult, f protocol.Filters) []protocol.FileResult {
	out := results[:0]
	for _, r := range results {
		// Types filter.
		if len(f.Types) > 0 {
			matched := false
			for _, t := range f.Types {
				if r.Type == t {
					matched = true
					break
				}
			}
			if !matched {
				continue
			}
		}

		// ModifiedRange filter: a bound of 0 means unbounded on that side.
		if f.ModifiedRange != nil {
			if f.ModifiedRange.From != 0 && r.ModifiedAt < f.ModifiedRange.From {
				continue
			}
			if f.ModifiedRange.To != 0 && r.ModifiedAt > f.ModifiedRange.To {
				continue
			}
		}

		// CreatedRange filter: if any bound is set and createdAt is 0 (unknown), exclude.
		if f.CreatedRange != nil {
			hasBound := f.CreatedRange.From != 0 || f.CreatedRange.To != 0
			if hasBound && r.CreatedAt == 0 {
				continue
			}
			if f.CreatedRange.From != 0 && r.CreatedAt < f.CreatedRange.From {
				continue
			}
			if f.CreatedRange.To != 0 && r.CreatedAt > f.CreatedRange.To {
				continue
			}
		}

		// PathPrefix filter.
		if f.PathPrefix != "" && !strings.HasPrefix(r.Path, f.PathPrefix) {
			continue
		}

		out = append(out, r)
	}
	return out
}

// Scoring weights:
//   - nameBucket × 10: name-prefix match = 30, name-substring = 20,
//     path-only match = 10, no match = 0.
//   - historyBoost = 5: result ID appears in req.History.
//   - recency = ModifiedAt / 2e13: small tiebreaker in [0, 1) for reasonable
//     timestamps (≈ 0.05–0.065 for years 2001–2011); 0 when ModifiedAt is 0.
//
// Scoring is intentionally light — OS indexers do their own ranking; we only
// re-rank lightly to surface name-matches above path-only hits (issue #25).
func scoreResult(r protocol.FileResult, terms []string, history []string) float64 {
	nameLower := strings.ToLower(r.Name)
	pathLower := strings.ToLower(r.Path)

	nameBucket := 0
	for _, t := range terms {
		if strings.HasPrefix(nameLower, strings.ToLower(t)) {
			nameBucket = 3
			break
		}
	}
	if nameBucket == 0 {
		for _, t := range terms {
			if strings.Contains(nameLower, strings.ToLower(t)) {
				nameBucket = 2
				break
			}
		}
	}
	if nameBucket == 0 {
		for _, t := range terms {
			if strings.Contains(pathLower, strings.ToLower(t)) {
				nameBucket = 1
				break
			}
		}
	}

	historyBoost := 0.0
	for _, id := range history {
		if id == r.ID {
			historyBoost = 5
			break
		}
	}

	recency := 0.0
	if r.ModifiedAt != 0 {
		recency = float64(r.ModifiedAt) / 2e13
	}

	return float64(nameBucket*10) + historyBoost + recency
}

// sortResults sorts results in-place according to the sort spec. Missing Field
// defaults to "relevance"; missing Dir defaults to "desc". The sort is stable
// with a deterministic tiebreak on Name (asc) then Path (asc) so equal primary
// keys always produce the same order across runs.
func sortResults(results []protocol.FileResult, s protocol.Sort) {
	field := s.Field
	if field == "" {
		field = "relevance"
	}
	dir := s.Dir
	if dir == "" {
		dir = "desc"
	}
	asc := dir == "asc"

	sort.SliceStable(results, func(i, j int) bool {
		a, b := results[i], results[j]
		switch field {
		case "created":
			if a.CreatedAt != b.CreatedAt {
				if asc {
					return a.CreatedAt < b.CreatedAt
				}
				return a.CreatedAt > b.CreatedAt
			}
		case "modified":
			if a.ModifiedAt != b.ModifiedAt {
				if asc {
					return a.ModifiedAt < b.ModifiedAt
				}
				return a.ModifiedAt > b.ModifiedAt
			}
		default: // "relevance"
			if a.Score != b.Score {
				if asc {
					return a.Score < b.Score
				}
				return a.Score > b.Score
			}
		}
		// Deterministic tiebreak: Name asc, then Path asc.
		if a.Name != b.Name {
			return a.Name < b.Name
		}
		return a.Path < b.Path
	})
}
