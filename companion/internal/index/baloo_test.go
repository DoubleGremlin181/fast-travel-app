package index_test

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/index"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/protocol"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/query"
)

// --- BalooIndexer tests ---

func TestBaloo_Capabilities(t *testing.T) {
	idx := index.NewBalooIndexer(&fakeRunner{})
	caps := idx.Capabilities()
	if !caps.BooleanOps {
		t.Error("BooleanOps should be true")
	}
	if !caps.PrefixWildcard {
		t.Error("PrefixWildcard should be true")
	}
	if !caps.InfixWildcard {
		t.Error("InfixWildcard should be true")
	}
	if caps.Regex {
		t.Error("Regex should be false")
	}
	if !caps.PathScope {
		t.Error("PathScope should be true")
	}
	if !caps.Content {
		t.Error("Content should be true")
	}
}

func TestBaloo_IDAndName(t *testing.T) {
	idx := index.NewBalooIndexer(&fakeRunner{})
	if idx.ID() != "baloo" {
		t.Errorf("ID=%q want baloo", idx.ID())
	}
	if idx.Name() != "KDE Baloo" {
		t.Errorf("Name=%q want 'KDE Baloo'", idx.Name())
	}
}

func TestBaloo_RegexMode_Degraded(t *testing.T) {
	fr := &fakeRunner{}
	idx := index.NewBalooIndexer(fr)

	ast, _ := query.Parse(`inv.*\.pdf`, query.ModeRegex)
	results, degraded, err := idx.Query(context.Background(), ast, query.ModeRegex, protocol.SearchRequest{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if !degraded {
		t.Error("expected degraded=true for regex mode (Baloo has no native regex)")
	}
	if len(results) != 0 {
		t.Errorf("expected 0 results for degraded regex, got %d", len(results))
	}
	if len(fr.calls) != 0 {
		t.Errorf("expected no runner calls for regex mode, got %d", len(fr.calls))
	}
}

func TestBaloo_SubstringMode_Command(t *testing.T) {
	dir := t.TempDir()
	f := filepath.Join(dir, "report.pdf")
	writeTestFile(t, f)

	fr := &fakeRunner{stdouts: []string{f + "\nElapsed: 5.42 msecs\n"}}
	idx := index.NewBalooIndexer(fr)

	ast, _ := query.Parse("report", query.ModeSimple)
	results, degraded, err := idx.Query(context.Background(), ast, query.ModeSimple, protocol.SearchRequest{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if degraded {
		t.Error("expected degraded=false for substring mode")
	}
	if len(results) != 1 {
		t.Fatalf("got %d results, want 1", len(results))
	}

	if len(fr.calls) != 1 {
		t.Fatalf("expected 1 runner call, got %d", len(fr.calls))
	}
	call := fr.calls[0]

	if call.name != "baloosearch" {
		t.Errorf("binary=%q want baloosearch", call.name)
	}
	if !argsContain(call.args, "-l") {
		t.Error("expected -l flag")
	}
	if !argsContain(call.args, "500") {
		t.Error("expected limit 500")
	}
	if !argsContain(call.args, "report") {
		t.Error("expected seed 'report' in args")
	}
	ddIdx := argIndex(call.args, "--")
	seedIdx := argIndex(call.args, "report")
	if ddIdx < 0 {
		t.Fatal("expected -- in args")
	}
	if ddIdx >= seedIdx {
		t.Error("-- must appear before the seed")
	}
}

func TestBaloo_ElapsedSummaryLineSkipped(t *testing.T) {
	dir := t.TempDir()
	f := filepath.Join(dir, "photo.png")
	writeTestFile(t, f)

	// baloosearch appends "Elapsed: N msecs" — must not appear in results.
	stdout := f + "\nElapsed: 11.4065 msecs\n"
	fr := &fakeRunner{stdouts: []string{stdout}}
	idx := index.NewBalooIndexer(fr)

	ast, _ := query.Parse("photo", query.ModeSimple)
	results, _, err := idx.Query(context.Background(), ast, query.ModeSimple, protocol.SearchRequest{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result (summary line skipped), got %d", len(results))
	}
	if results[0].Path != f {
		t.Errorf("path=%q want %q", results[0].Path, f)
	}
}

func TestBaloo_MissingPathsSkipped(t *testing.T) {
	dir := t.TempDir()
	real := filepath.Join(dir, "exists.txt")
	writeTestFile(t, real)

	stale := "/nonexistent/path/stale_baloo_entry_99.txt"
	stdout := real + "\n" + stale + "\nElapsed: 1.0 msecs\n"
	fr := &fakeRunner{stdouts: []string{stdout}}
	idx := index.NewBalooIndexer(fr)

	ast, _ := query.Parse("exists", query.ModeSimple)
	results, _, err := idx.Query(context.Background(), ast, query.ModeSimple, protocol.SearchRequest{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result (stale entry skipped), got %d", len(results))
	}
	if results[0].Path != real {
		t.Errorf("path=%q want %q", results[0].Path, real)
	}
}

func TestBaloo_ORQuery_TwoInvocations(t *testing.T) {
	dir := t.TempDir()
	f1 := filepath.Join(dir, "doc1.txt")
	f2 := filepath.Join(dir, "doc2.txt")
	writeTestFile(t, f1)
	writeTestFile(t, f2)

	fr := &fakeRunner{stdouts: []string{
		f1 + "\nElapsed: 1 msecs\n",
		f2 + "\nElapsed: 2 msecs\n",
	}}
	idx := index.NewBalooIndexer(fr)

	ast, _ := query.Parse("doc1 | doc2", query.ModeSimple)
	results, _, err := idx.Query(context.Background(), ast, query.ModeSimple, protocol.SearchRequest{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}

	if len(fr.calls) != 2 {
		t.Fatalf("expected 2 runner calls (one per OR branch), got %d", len(fr.calls))
	}
	if len(results) != 2 {
		t.Fatalf("expected 2 results (union), got %d", len(results))
	}
}

func TestBaloo_DeduplicatePaths(t *testing.T) {
	dir := t.TempDir()
	f := filepath.Join(dir, "dup.txt")
	writeTestFile(t, f)

	// Both branches return the same path.
	fr := &fakeRunner{stdouts: []string{
		f + "\nElapsed: 1 msecs\n",
		f + "\nElapsed: 1 msecs\n",
	}}
	idx := index.NewBalooIndexer(fr)

	ast, _ := query.Parse("dup | dup", query.ModeSimple)
	results, _, err := idx.Query(context.Background(), ast, query.ModeSimple, protocol.SearchRequest{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 deduplicated result, got %d", len(results))
	}
}

func TestBaloo_PureNegation_NoCall(t *testing.T) {
	fr := &fakeRunner{}
	idx := index.NewBalooIndexer(fr)

	ast, _ := query.Parse("-foo", query.ModeSimple)
	results, _, err := idx.Query(context.Background(), ast, query.ModeSimple, protocol.SearchRequest{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if len(fr.calls) != 0 {
		t.Errorf("expected no runner calls for pure-negation branch, got %d", len(fr.calls))
	}
	if len(results) != 0 {
		t.Errorf("expected 0 results, got %d", len(results))
	}
}

func TestBaloo_ResultsNeverNil(t *testing.T) {
	fr := &fakeRunner{stdouts: []string{"Elapsed: 0 msecs\n"}}
	idx := index.NewBalooIndexer(fr)

	ast, _ := query.Parse("anything", query.ModeSimple)
	results, _, err := idx.Query(context.Background(), ast, query.ModeSimple, protocol.SearchRequest{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if results == nil {
		t.Error("results must never be nil")
	}
}
