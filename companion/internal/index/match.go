package index

import (
	"regexp"
	"strings"

	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/protocol"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/query"
)

// Matches reports whether r satisfies the AST node n.
// caseSensitive controls whether term and phrase comparisons are case-sensitive.
// Regex nodes are unaffected by caseSensitive — the pattern's own flags control case.
// mode is passed for completeness; the node shapes already encode
// wildcard/regex semantics, so branching on mode is rarely needed.
func Matches(r protocol.FileResult, n query.Node, mode query.Mode, caseSensitive bool) bool {
	switch n.Op {
	case "and":
		for _, child := range n.Nodes {
			if !Matches(r, child, mode, caseSensitive) {
				return false
			}
		}
		return true

	case "or":
		for _, child := range n.Nodes {
			if Matches(r, child, mode, caseSensitive) {
				return true
			}
		}
		return false

	case "not":
		if n.Node == nil {
			return true
		}
		return !Matches(r, *n.Node, mode, caseSensitive)

	case "term":
		field := resolveField(r, n.Field)
		if n.Wildcard != nil && *n.Wildcard {
			return globMatch(n.Value, field, caseSensitive)
		}
		if caseSensitive {
			return strings.Contains(field, n.Value)
		}
		return strings.Contains(strings.ToLower(field), strings.ToLower(n.Value))

	case "phrase":
		field := resolveField(r, n.Field)
		if caseSensitive {
			return strings.Contains(field, n.Value)
		}
		return strings.Contains(strings.ToLower(field), strings.ToLower(n.Value))

	case "regex":
		// Regex is unaffected by caseSensitive; the pattern controls its own flags.
		field := resolveField(r, n.Field)
		re, err := regexp.Compile(n.Value)
		if err != nil {
			return false
		}
		return re.MatchString(field)

	default:
		return false
	}
}

// resolveField returns the FileResult field value for a given field name.
// "path" maps to r.Path; all other values default to r.Name.
func resolveField(r protocol.FileResult, field string) string {
	if field == "path" {
		return r.Path
	}
	return r.Name
}

// globMatch performs an anchored glob match of pattern against s.
// Only * (match any sequence) and ? (match any single character) are wildcards;
// all other regex metacharacters in pattern are escaped.
// When caseSensitive is false (default) the match is case-insensitive via (?i).
func globMatch(pattern, s string, caseSensitive bool) bool {
	// Build an anchored regex from the glob pattern.
	var sb strings.Builder
	if caseSensitive {
		sb.WriteString("^")
	} else {
		sb.WriteString("(?i)^")
	}
	for _, ch := range pattern {
		switch ch {
		case '*':
			sb.WriteString(".*")
		case '?':
			sb.WriteByte('.')
		default:
			sb.WriteString(regexp.QuoteMeta(string(ch)))
		}
	}
	sb.WriteString("$")
	re, err := regexp.Compile(sb.String())
	if err != nil {
		return false
	}
	return re.MatchString(s)
}
