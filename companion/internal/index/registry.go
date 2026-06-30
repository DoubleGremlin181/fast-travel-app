package index

import (
	"context"
	"errors"

	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/protocol"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/query"
)

// ErrNoIndexer is returned by Registry.Search when no file indexer is available
// on the host. The HTTP server maps this to the indexer_unavailable error code.
var ErrNoIndexer = errors.New("no file indexer available")

// priorityOrder is the canonical backend preference list, most preferred first.
// Only IDs in this list are eligible for automatic default selection and appear
// in Infos(); backends with IDs outside this list are stored but never ordered.
var priorityOrder = []string{"baloo", "tracker", "plocate", "everything", "wsearch", "mediastore"}

// Registry holds the set of known indexer backends, selects the default, and
// routes Search requests — including regex-mode routing to a regex-capable backend.
type Registry struct {
	byID       map[string]Indexer
	ordered    []Indexer // known backends present in byID, in priority order
	defaultIdx Indexer   // nil when no available indexer
}

// NewRegistry is a pure, testable constructor. It stores the given indexers,
// builds a priority-ordered view, and chooses the default:
//
//  1. If preferred is non-empty and names an available indexer, use it.
//  2. Otherwise, use the first available indexer in priorityOrder.
//  3. If none is available, default is nil.
//
// Fake indexers (e.g. MemIndexer) can be passed in tests so that no real
// binaries are consulted.
func NewRegistry(indexers []Indexer, preferred string) *Registry {
	byID := make(map[string]Indexer, len(indexers))
	for _, idx := range indexers {
		byID[idx.ID()] = idx
	}

	// Build ordered slice: backends present in byID, in priority order.
	ordered := make([]Indexer, 0, len(priorityOrder))
	for _, id := range priorityOrder {
		if idx, ok := byID[id]; ok {
			ordered = append(ordered, idx)
		}
	}

	// Choose default.
	var defaultIdx Indexer
	if preferred != "" {
		if idx, ok := byID[preferred]; ok && idx.Available() {
			defaultIdx = idx
		}
	}
	if defaultIdx == nil {
		for _, idx := range ordered {
			if idx.Available() {
				defaultIdx = idx
				break
			}
		}
	}

	return &Registry{byID: byID, ordered: ordered, defaultIdx: defaultIdx}
}

// Detect is the thin system-wiring constructor. It creates the real backends
// using the supplied runner and delegates all selection logic to NewRegistry.
// preferred will later come from companion config; pass "" to use priority order.
func Detect(runner Runner, preferred string) *Registry {
	return NewRegistry([]Indexer{
		NewBalooIndexer(runner),
		NewTrackerIndexer(runner),
		NewPlocateIndexer(runner),
		NewEverythingIndexer(runner),
		NewWindowsSearchIndexer(runner),
	}, preferred)
}

// Infos returns one IndexerInfo per known backend present in this registry,
// ordered by the priority list. Both available and unavailable backends are
// included so clients can show capability-gating information.
func (r *Registry) Infos() []protocol.IndexerInfo {
	infos := make([]protocol.IndexerInfo, 0, len(r.ordered))
	for _, idx := range r.ordered {
		infos = append(infos, protocol.IndexerInfo{
			ID:           idx.ID(),
			Name:         idx.Name(),
			Available:    idx.Available(),
			Capabilities: idx.Capabilities(),
		})
	}
	return infos
}

// Default returns the selected default indexer, or nil if no indexer is available.
func (r *Registry) Default() Indexer {
	return r.defaultIdx
}

// Search executes the request with automatic backend selection.
//
// If no indexer is available, it returns ErrNoIndexer (mapped to
// indexer_unavailable by the HTTP server).
//
// Regex routing: for a regex-mode request, the first available regex-capable
// backend in priority order is used (typically plocate). If no regex-capable
// backend is available, the request falls back to the default backend and
// resp.Degraded is forced true to signal that results are a candidate superset,
// not a true regex index match.
func (r *Registry) Search(ctx context.Context, req protocol.SearchRequest) (protocol.SearchResponse, error) {
	if r.defaultIdx == nil {
		return protocol.SearchResponse{}, ErrNoIndexer
	}

	var noNativeRegex bool
	serving := r.defaultIdx

	if req.QueryMode == query.ModeRegex {
		// Find the first available regex-capable backend in priority order.
		for _, idx := range r.ordered {
			if idx.Available() && idx.Capabilities().Regex {
				serving = idx
				break
			}
		}
		// If the serving backend can't handle regex natively, mark for degraded override.
		if !serving.Capabilities().Regex {
			noNativeRegex = true
		}
	}

	resp, err := Search(ctx, serving, req)
	if err != nil {
		return resp, err
	}
	if noNativeRegex {
		resp.Degraded = true
	}
	return resp, nil
}
