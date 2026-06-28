package index

import (
	"context"

	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/protocol"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/query"
)

// Indexer is the abstraction over OS-specific file-index backends.
// The pipeline always post-filters candidates with the matcher to guarantee
// correctness regardless of what the backend returns.
type Indexer interface {
	// ID returns a short stable identifier for this indexer (e.g. "mem", "baloo").
	ID() string
	// Name returns a human-readable display name.
	Name() string
	// Available reports whether the backend is operational on this host.
	Available() bool
	// Capabilities describes what the backend supports natively.
	Capabilities() protocol.Capabilities
	// Query returns candidate results for the given AST. Backends may perform
	// best-effort native narrowing; the pipeline ALWAYS post-filters with the
	// matcher to guarantee correctness. degraded is true when the backend could
	// not fully serve the requested mode (e.g. a regex satisfied by scanning a
	// candidate set rather than a native index).
	Query(ctx context.Context, ast query.Node, mode query.Mode, req protocol.SearchRequest) (results []protocol.FileResult, degraded bool, err error)
}

// MemIndexer is an in-memory Indexer for tests and development. It holds a
// fixed slice of FileResults and returns them all verbatim on every Query call,
// leaving all filtering, scoring, and sorting to the pipeline.
type MemIndexer struct {
	Items        []protocol.FileResult
	Caps         protocol.Capabilities
	IDVal        string
	NameVal      string
	AvailableVal bool
	DegradedVal  bool
}

// NewMemIndexer creates a MemIndexer with sensible defaults (id "mem", name
// "In-memory", available true) over the supplied items and capabilities.
func NewMemIndexer(items []protocol.FileResult, caps protocol.Capabilities) *MemIndexer {
	return &MemIndexer{
		Items:        items,
		Caps:         caps,
		IDVal:        "mem",
		NameVal:      "In-memory",
		AvailableVal: true,
	}
}

func (m *MemIndexer) ID() string                      { return m.IDVal }
func (m *MemIndexer) Name() string                    { return m.NameVal }
func (m *MemIndexer) Available() bool                 { return m.AvailableVal }
func (m *MemIndexer) Capabilities() protocol.Capabilities { return m.Caps }

// Query returns a copy of all Items. It performs no filtering so the pipeline's
// matcher and filters are fully exercised in tests.
func (m *MemIndexer) Query(_ context.Context, _ query.Node, _ query.Mode, _ protocol.SearchRequest) ([]protocol.FileResult, bool, error) {
	out := make([]protocol.FileResult, len(m.Items))
	copy(out, m.Items)
	return out, m.DegradedVal, nil
}
