package query

import (
	"errors"
	"strings"
)

// Parse turns a raw query string and a Mode into the canonical AST Node.
// It returns an error for empty or whitespace-only input.
func Parse(query string, mode Mode) (Node, error) {
	if strings.TrimSpace(query) == "" {
		return Node{}, errors.New("query: empty input")
	}

	if mode == ModeRegex {
		return parseRegex(query), nil
	}

	tokens := tokenize(query, mode)
	return buildAST(tokens), nil
}

// --- regex mode -----------------------------------------------------------

func parseRegex(query string) Node {
	field := "name"
	value := query
	if strings.HasPrefix(query, "path:") {
		field = "path"
		value = query[len("path:"):]
	}
	return Node{Op: "regex", Field: field, Value: value}
}

// --- tokenizer ------------------------------------------------------------

// tok is an internal token produced by tokenize.
type tok struct {
	isOR   bool // OR separator (|, or standalone OR keyword)
	negate bool // true when the token was preceded by - or !
	leaf   Node // the leaf node (term or phrase); zero when isOR == true
}

// tokenize scans the query string and produces a flat list of toks.
func tokenize(query string, mode Mode) []tok {
	var toks []tok
	i := 0
	n := len(query)

	for i < n {
		// skip whitespace
		if query[i] == ' ' || query[i] == '\t' {
			i++
			continue
		}

		// bare pipe → OR separator
		if query[i] == '|' {
			toks = append(toks, tok{isOR: true})
			i++
			continue
		}

		// negation prefix
		negate := false
		if i < n && (query[i] == '-' || query[i] == '!') {
			// only treat as negation if followed by a non-space character
			if i+1 < n && query[i+1] != ' ' && query[i+1] != '\t' {
				negate = true
				i++
			}
		}

		// path: prefix
		field := "name"
		if strings.HasPrefix(query[i:], "path:") {
			field = "path"
			i += len("path:")
		}

		if i >= n {
			continue
		}

		// quoted phrase
		if query[i] == '"' {
			i++ // skip opening quote
			start := i
			for i < n && query[i] != '"' {
				i++
			}
			value := query[start:i]
			if i < n {
				i++ // skip closing quote
			}
			leaf := Node{Op: "phrase", Field: field, Value: value}
			toks = append(toks, tok{negate: negate, leaf: leaf})
			continue
		}

		// regular term: read until whitespace or pipe
		start := i
		for i < n && query[i] != ' ' && query[i] != '\t' && query[i] != '|' {
			i++
		}
		value := query[start:i]
		if value == "" {
			continue
		}

		// standalone OR keyword (only when no negate and no field scope)
		if !negate && field == "name" && strings.EqualFold(value, "or") {
			toks = append(toks, tok{isOR: true})
			continue
		}

		wc := boolPtr(false)
		if mode == ModeWildcard && containsWildcard(value) {
			wc = boolPtr(true)
		}

		leaf := Node{Op: "term", Field: field, Value: value, Wildcard: wc}
		toks = append(toks, tok{negate: negate, leaf: leaf})
	}

	return toks
}

func containsWildcard(s string) bool {
	return strings.ContainsAny(s, "*?")
}

// --- AST builder ----------------------------------------------------------

// buildAST turns a flat token list into the canonical AST Node.
// Top-level precedence: OR binds looser than AND.
func buildAST(toks []tok) Node {
	// split at OR separators → one slice per AND-segment
	segments := splitByOR(toks)

	segNodes := make([]Node, 0, len(segments))
	for _, seg := range segments {
		if len(seg) == 0 {
			continue
		}
		segNodes = append(segNodes, buildSegment(seg))
	}

	switch len(segNodes) {
	case 0:
		return Node{} // shouldn't reach here after empty-input guard
	case 1:
		return segNodes[0]
	default:
		return Node{Op: "or", Nodes: segNodes}
	}
}

// splitByOR partitions toks into slices separated by OR tokens.
func splitByOR(toks []tok) [][]tok {
	var segments [][]tok
	current := []tok{}
	for _, t := range toks {
		if t.isOR {
			segments = append(segments, current)
			current = []tok{}
		} else {
			current = append(current, t)
		}
	}
	segments = append(segments, current)
	return segments
}

// buildSegment turns one AND-group of tokens into a Node.
func buildSegment(toks []tok) Node {
	nodes := make([]Node, 0, len(toks))
	for _, t := range toks {
		leaf := t.leaf
		if t.negate {
			inner := leaf
			leaf = Node{Op: "not", Node: &inner}
		}
		nodes = append(nodes, leaf)
	}

	if len(nodes) == 1 {
		return nodes[0]
	}
	return Node{Op: "and", Nodes: nodes}
}
