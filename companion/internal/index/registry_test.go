package index_test

import (
	"context"
	"errors"
	"testing"

	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/index"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/protocol"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/query"
)

// --- Registry tests ---
//
// All tests use NewRegistry with fake MemIndexers so they never touch real PATH
// binaries. Only the indexer ID, availability, and capabilities matter for routing.

// makeIdx builds a MemIndexer with the given identity and availability.
func makeIdx(id, name string, available bool, caps protocol.Capabilities) *index.MemIndexer {
	return &index.MemIndexer{
		IDVal:        id,
		NameVal:      name,
		AvailableVal: available,
		Caps:         caps,
	}
}

// Canonical capability sets matching each backend's real implementation.
var (
	capsBaloo = protocol.Capabilities{
		BooleanOps: true, PrefixWildcard: true, InfixWildcard: true,
		Regex: false, PathScope: true, Content: true,
	}
	capsTracker = protocol.Capabilities{
		BooleanOps: false, PrefixWildcard: true, InfixWildcard: false,
		Regex: false, PathScope: false, Content: true,
	}
	capsPlocate = protocol.Capabilities{
		BooleanOps: false, PrefixWildcard: true, InfixWildcard: true,
		Regex: true, PathScope: true, Content: false,
	}
)

func TestRegistry_DefaultSelection_PriorityOrder(t *testing.T) {
	// Baloo and tracker both available; baloo is first in priority → default.
	baloo := makeIdx("baloo", "KDE Baloo", true, capsBaloo)
	tracker := makeIdx("tracker", "GNOME Tracker", true, capsTracker)
	plocate := makeIdx("plocate", "plocate", false, capsPlocate)

	reg := index.NewRegistry([]index.Indexer{baloo, tracker, plocate}, "")
	if reg.Default() == nil {
		t.Fatal("Default() must not be nil when baloo is available")
	}
	if reg.Default().ID() != "baloo" {
		t.Errorf("Default()=%q want baloo (highest priority)", reg.Default().ID())
	}
}

func TestRegistry_DefaultSelection_TrackerBeforePlocate(t *testing.T) {
	// Only tracker and plocate available; tracker precedes plocate in priority order.
	tracker := makeIdx("tracker", "GNOME Tracker", true, capsTracker)
	plocate := makeIdx("plocate", "plocate", true, capsPlocate)

	reg := index.NewRegistry([]index.Indexer{tracker, plocate}, "")
	if reg.Default() == nil {
		t.Fatal("Default() must not be nil")
	}
	if reg.Default().ID() != "tracker" {
		t.Errorf("Default()=%q want tracker", reg.Default().ID())
	}
}

func TestRegistry_DefaultSelection_Preferred(t *testing.T) {
	// preferred="plocate" overrides priority; plocate is available → chosen.
	baloo := makeIdx("baloo", "KDE Baloo", true, capsBaloo)
	plocate := makeIdx("plocate", "plocate", true, capsPlocate)

	reg := index.NewRegistry([]index.Indexer{baloo, plocate}, "plocate")
	if reg.Default() == nil {
		t.Fatal("Default() must not be nil")
	}
	if reg.Default().ID() != "plocate" {
		t.Errorf("Default()=%q want plocate (preferred)", reg.Default().ID())
	}
}

func TestRegistry_DefaultSelection_PreferredUnavailable_FallsBackToPriority(t *testing.T) {
	// preferred="plocate" but plocate is unavailable; falls back to baloo.
	baloo := makeIdx("baloo", "KDE Baloo", true, capsBaloo)
	plocate := makeIdx("plocate", "plocate", false, capsPlocate)

	reg := index.NewRegistry([]index.Indexer{baloo, plocate}, "plocate")
	if reg.Default() == nil {
		t.Fatal("Default() must not be nil when baloo is available")
	}
	if reg.Default().ID() != "baloo" {
		t.Errorf("Default()=%q want baloo (preferred plocate unavailable)", reg.Default().ID())
	}
}

func TestRegistry_DefaultSelection_NilWhenNoneAvailable(t *testing.T) {
	baloo := makeIdx("baloo", "KDE Baloo", false, capsBaloo)
	plocate := makeIdx("plocate", "plocate", false, capsPlocate)

	reg := index.NewRegistry([]index.Indexer{baloo, plocate}, "")
	if reg.Default() != nil {
		t.Errorf("Default() should be nil when no indexer is available, got %q", reg.Default().ID())
	}
}

func TestRegistry_Infos_OrderAndContent(t *testing.T) {
	// Pass in reverse order; Infos must return priority order (baloo, tracker, plocate).
	baloo := makeIdx("baloo", "KDE Baloo", true, capsBaloo)
	tracker := makeIdx("tracker", "GNOME Tracker", false, capsTracker)
	plocate := makeIdx("plocate", "plocate", true, capsPlocate)

	reg := index.NewRegistry([]index.Indexer{plocate, tracker, baloo}, "")
	infos := reg.Infos()

	if len(infos) != 3 {
		t.Fatalf("Infos() len=%d want 3", len(infos))
	}

	// Priority: baloo[0] < tracker[1] < plocate[2].
	if infos[0].ID != "baloo" {
		t.Errorf("infos[0].ID=%q want baloo", infos[0].ID)
	}
	if !infos[0].Available {
		t.Error("baloo must be available")
	}
	if infos[1].ID != "tracker" {
		t.Errorf("infos[1].ID=%q want tracker", infos[1].ID)
	}
	if infos[1].Available {
		t.Error("tracker must not be available in this fixture")
	}
	if infos[2].ID != "plocate" {
		t.Errorf("infos[2].ID=%q want plocate", infos[2].ID)
	}
	if !infos[2].Available {
		t.Error("plocate must be available")
	}

	// Capabilities are forwarded from the indexer unchanged.
	if !infos[0].Capabilities.BooleanOps {
		t.Error("baloo.Capabilities.BooleanOps should be true")
	}
	if infos[0].Capabilities.Regex {
		t.Error("baloo.Capabilities.Regex should be false")
	}
	if !infos[2].Capabilities.Regex {
		t.Error("plocate.Capabilities.Regex should be true")
	}
}

func TestRegistry_Search_ErrNoIndexer(t *testing.T) {
	// No available indexers → ErrNoIndexer.
	baloo := makeIdx("baloo", "KDE Baloo", false, capsBaloo)
	reg := index.NewRegistry([]index.Indexer{baloo}, "")

	_, err := reg.Search(context.Background(), protocol.SearchRequest{
		Query: "hello", QueryMode: query.ModeSimple, PageSize: 10,
	})
	if !errors.Is(err, index.ErrNoIndexer) {
		t.Errorf("expected ErrNoIndexer, got %v", err)
	}
}

func TestRegistry_Search_SubstringMode_UsesDefault(t *testing.T) {
	// Substring query routes to the default indexer (baloo).
	baloo := makeIdx("baloo", "KDE Baloo", true, capsBaloo)
	plocate := makeIdx("plocate", "plocate", true, capsPlocate)

	reg := index.NewRegistry([]index.Indexer{baloo, plocate}, "")
	resp, err := reg.Search(context.Background(), protocol.SearchRequest{
		Query: "hello", QueryMode: query.ModeSimple, PageSize: 10,
	})
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if resp.Indexer != "baloo" {
		t.Errorf("resp.Indexer=%q want baloo (default for non-regex)", resp.Indexer)
	}
}

func TestRegistry_Search_RegexRouting_ToPlocate(t *testing.T) {
	// Default is baloo (no regex), plocate is available + regex-capable.
	// A regex-mode query must be routed to plocate.
	baloo := makeIdx("baloo", "KDE Baloo", true, capsBaloo)
	plocate := makeIdx("plocate", "plocate", true, capsPlocate)

	reg := index.NewRegistry([]index.Indexer{baloo, plocate}, "")
	if reg.Default().ID() != "baloo" {
		t.Fatalf("precondition: Default should be baloo, got %q", reg.Default().ID())
	}

	resp, err := reg.Search(context.Background(), protocol.SearchRequest{
		Query: "report", QueryMode: query.ModeRegex, PageSize: 10,
	})
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if resp.Indexer != "plocate" {
		t.Errorf("resp.Indexer=%q want plocate (regex routing)", resp.Indexer)
	}
	// noNativeRegex is false (plocate IS regex-capable), so the registry must
	// NOT force Degraded. (MemIndexer.DegradedVal is false by default.)
	if resp.Degraded {
		t.Error("resp.Degraded must be false when a regex-capable backend is available")
	}
}

func TestRegistry_Search_RegexRouting_NoRegexCapable_FallsBackDegraded(t *testing.T) {
	// No regex-capable backend; regex request falls back to default (baloo) + Degraded=true.
	baloo := makeIdx("baloo", "KDE Baloo", true, capsBaloo)
	tracker := makeIdx("tracker", "GNOME Tracker", true, capsTracker)

	reg := index.NewRegistry([]index.Indexer{baloo, tracker}, "")
	resp, err := reg.Search(context.Background(), protocol.SearchRequest{
		Query: "report", QueryMode: query.ModeRegex, PageSize: 10,
	})
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if resp.Indexer != "baloo" {
		t.Errorf("resp.Indexer=%q want baloo (fallback when no regex-capable backend)", resp.Indexer)
	}
	if !resp.Degraded {
		t.Error("resp.Degraded must be true when no regex-capable backend is available")
	}
}
