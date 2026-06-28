// Package query implements the Fast Travel query mini-syntax parser.
// It turns a raw query string + a Mode into a canonical AST that is
// identical across the Go companion and future Kotlin Android implementation.
package query

// Mode controls how the query string is parsed.
type Mode string

const (
	ModeSimple   Mode = "simple"
	ModeWildcard Mode = "wildcard"
	ModeRegex    Mode = "regex"
)

// Node is a single AST node. Its JSON serialisation matches the shared
// companion-protocol fixture schema exactly.
//
//   - op "and"/"or":  Nodes holds the children; Node/Field/Value/Wildcard are zero.
//   - op "not":       Node holds the single child; Nodes/Field/Value/Wildcard are zero.
//   - op "term":      Field, Value, Wildcard set; Nodes/Node are zero.
//   - op "phrase":    Field, Value set; Wildcard nil; Nodes/Node are zero.
//   - op "regex":     Field, Value set; Wildcard nil; Nodes/Node are zero.
type Node struct {
	Op       string  `json:"op"`
	Nodes    []Node  `json:"nodes,omitempty"`    // and / or
	Node     *Node   `json:"node,omitempty"`     // not
	Field    string  `json:"field,omitempty"`    // term / phrase / regex
	Value    string  `json:"value,omitempty"`    // term / phrase / regex
	Wildcard *bool   `json:"wildcard,omitempty"` // term only (pointer so false serialises)
}

// boolPtr is a small helper to take the address of a bool literal.
func boolPtr(b bool) *bool { return &b }
