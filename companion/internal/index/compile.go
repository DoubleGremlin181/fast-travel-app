package index

import (
	"strings"

	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/protocol"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/query"
)

// ORBranches returns the immediate child nodes when n is an "or" node, or a
// single-element slice containing n for any other op. Backends call this to
// iterate over independent OR branches and issue one native query per branch.
//
// Flat-OR invariant: the query grammar has no grouping syntax, so the parser
// emits only a single flat top-level "or" — branches never contain a nested
// "or" node. PositiveSeed relies on this: it walks branch internals without
// needing to handle recursive OR splitting.
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
// Flat-OR invariant: branches passed here are leaves of a flat OR (see
// ORBranches). They may contain AND/NOT nodes but never a nested OR, so the
// walk below does not need to split on "or" to remain recall-safe.
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

// RegexSeeds derives plocate substring seeds from an RE2 pattern that are
// recall-safe: every string the pattern matches contains at least one of the
// returned seeds. It splits the pattern on top-level alternation and extracts
// the longest REQUIRED literal run from each alternative. If any alternative has
// no usable required literal (len >= 2), it returns broad=true, signalling the
// caller to fall back to a whole-index scan (the RE2 matcher still filters).
//
// Seeds are deduplicated before return.
func RegexSeeds(pattern string) (seeds []string, broad bool) {
	alternatives := splitTopLevelAlternation(pattern)
	seen := make(map[string]struct{}, len(alternatives))
	var result []string
	for _, alt := range alternatives {
		seed := longestRequiredLiteralRun(alt)
		if len(seed) < 2 {
			return nil, true
		}
		if _, dup := seen[seed]; !dup {
			seen[seed] = struct{}{}
			result = append(result, seed)
		}
	}
	return result, false
}

// splitTopLevelAlternation splits pattern on top-level '|' characters —
// those not escaped (\|), not inside a char class ([...]), and not inside
// a group (...). It returns at least one element.
func splitTopLevelAlternation(pattern string) []string {
	var alternatives []string
	depth := 0
	inClass := false
	start := 0
	i := 0
	for i < len(pattern) {
		ch := pattern[i]
		switch {
		case ch == '\\' && i+1 < len(pattern):
			i += 2 // skip the escaped character
		case inClass:
			if ch == ']' {
				inClass = false
			}
			i++
		case ch == '[':
			inClass = true
			i++
		case ch == '(':
			depth++
			i++
		case ch == ')':
			if depth > 0 {
				depth--
			}
			i++
		case ch == '|' && depth == 0:
			alternatives = append(alternatives, pattern[start:i])
			start = i + 1
			i++
		default:
			i++
		}
	}
	alternatives = append(alternatives, pattern[start:])
	return alternatives
}

// longestRequiredLiteralRun finds the longest contiguous run of characters
// that MUST appear in every string matched by the RE2 alternative alt.
//
// Rules (left-to-right scan):
//   - Ordinary literal chars and escaped non-letter metacharacters (\. \* \\ etc.)
//     extend the current run.
//   - Quantifiers after a run char: '*' or '?' → drop the last char (may be
//     zero), break the run. '+' → keep the char (at least one), break the run.
//     '{' (any interval) → drop the last char (conservatively), skip to '}',
//     break the run.
//   - Run-breakers (start a new empty run): '.', '[…]' (skip the class),
//     '(', ')', '^', '$', any '\<letter>' escape (\d \w \s etc.).
//   - Quantifiers on breaker elements are consumed but don't affect an empty run.
//   - Only TOP-LEVEL literals (paren depth 0) are collected: a group (…) may be
//     quantified/optional (e.g. (foo)*bar), so its contents are never required.
func longestRequiredLiteralRun(alt string) string {
	best := ""
	cur := make([]byte, 0, 16)

	endRun := func() {
		if len(cur) > len(best) {
			best = string(cur)
		}
		cur = cur[:0]
	}
	dropLastAndEndRun := func() {
		if len(cur) > 0 {
			cur = cur[:len(cur)-1]
		}
		endRun()
	}
	// consumeQuantifier advances i past an optional quantifier at position i.
	// Returns the new i.
	consumeQuantifier := func(i int) int {
		if i >= len(alt) {
			return i
		}
		switch alt[i] {
		case '*', '?', '+':
			return i + 1
		case '{':
			i++
			for i < len(alt) && alt[i] != '}' {
				i++
			}
			if i < len(alt) {
				i++ // skip '}'
			}
		}
		return i
	}

	depth := 0
	i := 0
	for i < len(alt) {
		ch := alt[i]

		if ch == '\\' && i+1 < len(alt) {
			next := alt[i+1]
			i += 2
			if (next >= 'a' && next <= 'z') || (next >= 'A' && next <= 'Z') {
				// \d \w \s \D \W \S \b \B and any other letter escape:
				// these are class shorthands or zero-width assertions → break run.
				endRun()
				i = consumeQuantifier(i)
			} else if depth == 0 {
				// \. \* \( \) \\ \{ \} \+ \? \^ \$ etc. → literal symbol.
				cur = append(cur, next)
				if i < len(alt) {
					switch alt[i] {
					case '*', '?':
						dropLastAndEndRun()
						i++
					case '+':
						endRun()
						i++
					case '{':
						dropLastAndEndRun()
						i = consumeQuantifier(i)
					}
				}
			}
			continue
		}

		switch ch {
		case '.':
			endRun()
			i++
			i = consumeQuantifier(i)

		case '[':
			endRun()
			i++ // skip '['
			// Handle negation and leading ']' that is literal inside the class.
			if i < len(alt) && alt[i] == '^' {
				i++
			}
			if i < len(alt) && alt[i] == ']' {
				i++ // ']' at the start of a class is a literal member
			}
			for i < len(alt) && alt[i] != ']' {
				if alt[i] == '\\' {
					i++ // skip escaped char inside class
				}
				i++
			}
			if i < len(alt) {
				i++ // skip closing ']'
			}
			i = consumeQuantifier(i)

		case '(':
			depth++
			endRun()
			i++

		case ')':
			if depth > 0 {
				depth--
			}
			endRun()
			i++

		case '^', '$':
			endRun()
			i++

		case '*', '?', '+':
			// Stray quantifier (no preceding literal in current run); just consume.
			endRun()
			i++

		case '{':
			// Stray interval quantifier.
			endRun()
			i = consumeQuantifier(i)

		default:
			// Regular literal character — collected only at the top level
			// (depth 0); characters inside a group (...) are never required.
			i++
			if depth == 0 {
				cur = append(cur, ch)
				if i < len(alt) {
					switch alt[i] {
					case '*', '?':
						dropLastAndEndRun()
						i++
					case '+':
						endRun()
						i++
					case '{':
						dropLastAndEndRun()
						i = consumeQuantifier(i)
					}
				}
			}
		}
	}
	endRun()
	return best
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
