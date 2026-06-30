package index_test

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/index"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/protocol"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/query"
)

// --- EverythingIndexer tests ---
//
// EverythingIndexer queries Voidtools Everything via the es CLI.
// On Linux (CI), es is absent so Available()=false. All tests use a fakeRunner
// so no real es binary is invoked.
//
// Regex invocation:  es -r -full-path-and-name -n 500 -- <pattern>   (native regex; degraded=false)
// Substring invocation: es -full-path-and-name -n 500 -- <seed>       (per OR branch; degraded=false)

func TestEverything_Capabilities(t *testing.T) {
	idx := index.NewEverythingIndexer(&fakeRunner{})
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
	if !caps.Regex {
		t.Error("Regex should be true")
	}
	if !caps.PathScope {
		t.Error("PathScope should be true")
	}
	if caps.Content {
		t.Error("Content should be false")
	}
}

func TestEverything_IDAndName(t *testing.T) {
	idx := index.NewEverythingIndexer(&fakeRunner{})
	if idx.ID() != "everything" {
		t.Errorf("ID=%q want everything", idx.ID())
	}
	if idx.Name() != "Everything" {
		t.Errorf("Name=%q want 'Everything'", idx.Name())
	}
}

func TestEverything_RegexMode_UsesMinusR(t *testing.T) {
	// Regex mode must invoke es with -r and pass the raw pattern after --.
	// degraded must be false (Everything natively supports regex).
	dir := t.TempDir()
	f := filepath.Join(dir, "invoice.pdf")
	writeTestFile(t, f)

	fr := &fakeRunner{stdouts: []string{f + "\n"}}
	idx := index.NewEverythingIndexer(fr)
	idx.Bin = "es"

	ast, _ := query.Parse(`inv.*\.pdf`, query.ModeRegex)
	results, degraded, err := idx.Query(context.Background(), ast, query.ModeRegex, protocol.SearchRequest{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if degraded {
		t.Error("expected degraded=false for regex mode (Everything has native regex)")
	}
	if len(results) != 1 {
		t.Fatalf("got %d results, want 1", len(results))
	}
	if results[0].Path != f {
		t.Errorf("path=%q want %q", results[0].Path, f)
	}

	if len(fr.calls) != 1 {
		t.Fatalf("expected 1 runner call, got %d", len(fr.calls))
	}
	call := fr.calls[0]
	if call.name != "es" {
		t.Errorf("binary=%q want es", call.name)
	}
	if !argsContain(call.args, "-r") {
		t.Error("regex mode must pass -r to es")
	}
	if !argsContain(call.args, "-full-path-and-name") {
		t.Error("regex mode must pass -full-path-and-name to es")
	}
	if !argsContain(call.args, "-n") {
		t.Error("expected -n flag for limit")
	}
	if !argsContain(call.args, "500") {
		t.Error("expected limit 500")
	}
	ddIdx := argIndex(call.args, "--")
	if ddIdx < 0 {
		t.Fatal("expected -- in args")
	}
	patIdx := argIndex(call.args, `inv.*\.pdf`)
	if patIdx < 0 {
		t.Error("expected raw regex pattern in args")
	}
	if patIdx <= ddIdx {
		t.Error("pattern must appear after --")
	}
}

func TestEverything_SubstringMode_Command(t *testing.T) {
	// Substring mode: es -n 500 -- <seed>, no -r flag.
	dir := t.TempDir()
	f := filepath.Join(dir, "report.pdf")
	writeTestFile(t, f)

	fr := &fakeRunner{stdouts: []string{f + "\n"}}
	idx := index.NewEverythingIndexer(fr)
	idx.Bin = "es"

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
	if results[0].Path != f {
		t.Errorf("path=%q want %q", results[0].Path, f)
	}

	if len(fr.calls) != 1 {
		t.Fatalf("expected 1 runner call, got %d", len(fr.calls))
	}
	call := fr.calls[0]
	if call.name != "es" {
		t.Errorf("binary=%q want es", call.name)
	}
	if argsContain(call.args, "-r") {
		t.Error("substring mode must NOT pass -r to es")
	}
	if !argsContain(call.args, "-full-path-and-name") {
		t.Error("substring mode must pass -full-path-and-name to es")
	}
	if !argsContain(call.args, "-n") {
		t.Error("expected -n flag for limit")
	}
	if !argsContain(call.args, "500") {
		t.Error("expected limit 500")
	}
	if !argsContain(call.args, "report") {
		t.Error("expected seed 'report' in args")
	}
	ddIdx := argIndex(call.args, "--")
	if ddIdx < 0 {
		t.Fatal("expected -- in args")
	}
	seedIdx := argIndex(call.args, "report")
	if seedIdx <= ddIdx {
		t.Error("seed must appear after --")
	}
}

func TestEverything_RegexMode_NotDegraded(t *testing.T) {
	// Any regex query to Everything must return degraded=false.
	fr := &fakeRunner{stdouts: []string{""}}
	idx := index.NewEverythingIndexer(fr)
	idx.Bin = "es"

	ast, _ := query.Parse(`report`, query.ModeRegex)
	_, degraded, err := idx.Query(context.Background(), ast, query.ModeRegex, protocol.SearchRequest{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if degraded {
		t.Error("expected degraded=false: Everything has native regex support")
	}
}

func TestEverything_ORQuery_TwoInvocations(t *testing.T) {
	dir := t.TempDir()
	f1 := filepath.Join(dir, "alpha.txt")
	f2 := filepath.Join(dir, "beta.txt")
	writeTestFile(t, f1)
	writeTestFile(t, f2)

	fr := &fakeRunner{stdouts: []string{f1 + "\n", f2 + "\n"}}
	idx := index.NewEverythingIndexer(fr)
	idx.Bin = "es"

	ast, _ := query.Parse("alpha | beta", query.ModeSimple)
	results, _, err := idx.Query(context.Background(), ast, query.ModeSimple, protocol.SearchRequest{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if len(fr.calls) != 2 {
		t.Fatalf("expected 2 runner calls (one per OR branch), got %d", len(fr.calls))
	}
	seed0 := fr.calls[0].args[len(fr.calls[0].args)-1]
	seed1 := fr.calls[1].args[len(fr.calls[1].args)-1]
	if (seed0 != "alpha" || seed1 != "beta") && (seed0 != "beta" || seed1 != "alpha") {
		t.Errorf("unexpected seeds %q, %q; want alpha and beta", seed0, seed1)
	}
	if len(results) != 2 {
		t.Fatalf("expected 2 results (union), got %d", len(results))
	}
}

func TestEverything_MissingPathsSkipped(t *testing.T) {
	dir := t.TempDir()
	real := filepath.Join(dir, "real.txt")
	writeTestFile(t, real)

	stdout := real + "\nC:\\stale_everything_entry_99.txt\n"
	fr := &fakeRunner{stdouts: []string{stdout}}
	idx := index.NewEverythingIndexer(fr)
	idx.Bin = "es"

	ast, _ := query.Parse("real", query.ModeSimple)
	results, _, err := idx.Query(context.Background(), ast, query.ModeSimple, protocol.SearchRequest{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result (stale skipped), got %d", len(results))
	}
	if results[0].Path != real {
		t.Errorf("path=%q want %q", results[0].Path, real)
	}
}

func TestEverything_DeduplicatePaths(t *testing.T) {
	dir := t.TempDir()
	f := filepath.Join(dir, "dup.txt")
	writeTestFile(t, f)

	fr := &fakeRunner{stdouts: []string{f + "\n", f + "\n"}}
	idx := index.NewEverythingIndexer(fr)
	idx.Bin = "es"

	ast, _ := query.Parse("dup | dup", query.ModeSimple)
	results, _, err := idx.Query(context.Background(), ast, query.ModeSimple, protocol.SearchRequest{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 deduplicated result, got %d", len(results))
	}
}

func TestEverything_PureNegation_NoCall(t *testing.T) {
	fr := &fakeRunner{}
	idx := index.NewEverythingIndexer(fr)

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

func TestEverything_ResultsNeverNil(t *testing.T) {
	fr := &fakeRunner{stdouts: []string{""}}
	idx := index.NewEverythingIndexer(fr)
	idx.Bin = "es"

	ast, _ := query.Parse("anything", query.ModeSimple)
	results, _, err := idx.Query(context.Background(), ast, query.ModeSimple, protocol.SearchRequest{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if results == nil {
		t.Error("results must never be nil")
	}
}

func TestEverything_BlankLinesIgnored(t *testing.T) {
	dir := t.TempDir()
	f := filepath.Join(dir, "note.txt")
	writeTestFile(t, f)

	stdout := "\n  \n" + f + "\n\n"
	fr := &fakeRunner{stdouts: []string{stdout}}
	idx := index.NewEverythingIndexer(fr)
	idx.Bin = "es"

	ast, _ := query.Parse("note", query.ModeSimple)
	results, _, err := idx.Query(context.Background(), ast, query.ModeSimple, protocol.SearchRequest{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
}

// --- Registry wiring tests for Windows backends ---

var (
	capsWSearch = protocol.Capabilities{
		BooleanOps: true, PrefixWildcard: true, InfixWildcard: true,
		Regex: false, PathScope: true, Content: true,
	}
	capsEverything = protocol.Capabilities{
		BooleanOps: true, PrefixWildcard: true, InfixWildcard: true,
		Regex: true, PathScope: true, Content: false,
	}
)

func TestRegistry_WindowsBackends_InInfos(t *testing.T) {
	// Both backends must appear in Infos() in priority order:
	// everything (index 3) before wsearch (index 4) in priorityOrder.
	everything := makeIdx("everything", "Everything", false, capsEverything)
	wsearch := makeIdx("wsearch", "Windows Search", false, capsWSearch)

	reg := index.NewRegistry([]index.Indexer{wsearch, everything}, "")
	infos := reg.Infos()

	if len(infos) != 2 {
		t.Fatalf("Infos() len=%d want 2", len(infos))
	}
	if infos[0].ID != "everything" {
		t.Errorf("infos[0].ID=%q want everything (higher priority)", infos[0].ID)
	}
	if infos[1].ID != "wsearch" {
		t.Errorf("infos[1].ID=%q want wsearch", infos[1].ID)
	}
	if !infos[0].Capabilities.Regex {
		t.Error("everything.Capabilities.Regex should be true")
	}
	if infos[1].Capabilities.Regex {
		t.Error("wsearch.Capabilities.Regex should be false")
	}
	if !infos[1].Capabilities.Content {
		t.Error("wsearch.Capabilities.Content should be true")
	}
	if infos[0].Capabilities.Content {
		t.Error("everything.Capabilities.Content should be false")
	}
}

func TestRegistry_RegexRouting_ToEverything(t *testing.T) {
	// On Windows with Everything available, regex queries route to Everything
	// (regex-capable) and degraded=false.
	everything := makeIdx("everything", "Everything", true, capsEverything)
	wsearch := makeIdx("wsearch", "Windows Search", true, capsWSearch)

	reg := index.NewRegistry([]index.Indexer{wsearch, everything}, "")
	if reg.Default() == nil {
		t.Fatal("Default() must not be nil")
	}
	if reg.Default().ID() != "everything" {
		t.Errorf("Default()=%q want everything (higher priority, available)", reg.Default().ID())
	}

	resp, err := reg.Search(context.Background(), protocol.SearchRequest{
		Query: "report", QueryMode: query.ModeRegex, PageSize: 10,
	})
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if resp.Indexer != "everything" {
		t.Errorf("resp.Indexer=%q want everything (native regex routing)", resp.Indexer)
	}
	if resp.Degraded {
		t.Error("resp.Degraded must be false when Everything is available for regex")
	}
}

func TestRegistry_WindowsSearch_NoRegexCapable_FallsBackDegraded(t *testing.T) {
	// If only WSearch is available (no regex-capable backend), a regex request
	// falls back to the default and Degraded=true.
	wsearch := makeIdx("wsearch", "Windows Search", true, capsWSearch)

	reg := index.NewRegistry([]index.Indexer{wsearch}, "")
	resp, err := reg.Search(context.Background(), protocol.SearchRequest{
		Query: "report", QueryMode: query.ModeRegex, PageSize: 10,
	})
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if resp.Indexer != "wsearch" {
		t.Errorf("resp.Indexer=%q want wsearch (only available backend)", resp.Indexer)
	}
	if !resp.Degraded {
		t.Error("resp.Degraded must be true when no regex-capable backend is available")
	}
}
