package index_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/index"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/protocol"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/query"
)

// --- shared test helpers ---

type runCall struct {
	name string
	args []string
}

// fakeRunner records calls and returns pre-canned stdout strings in order.
// Once the stdouts slice is exhausted, the last element is repeated.
// An empty stdouts slice always returns nil output.
type fakeRunner struct {
	calls   []runCall
	stdouts []string
}

func (f *fakeRunner) Run(_ context.Context, name string, args ...string) ([]byte, error) {
	f.calls = append(f.calls, runCall{name: name, args: args})
	if len(f.stdouts) == 0 {
		return nil, nil
	}
	idx := len(f.calls) - 1
	if idx >= len(f.stdouts) {
		idx = len(f.stdouts) - 1
	}
	return []byte(f.stdouts[idx]), nil
}

// writeTestFile creates a file at path with dummy content.
func writeTestFile(t *testing.T, path string) {
	t.Helper()
	if err := os.WriteFile(path, []byte("testcontent"), 0o644); err != nil {
		t.Fatalf("create test file %s: %v", path, err)
	}
}

// argsContain reports whether val appears anywhere in args.
func argsContain(args []string, val string) bool {
	for _, a := range args {
		if a == val {
			return true
		}
	}
	return false
}

// argIndex returns the first position of val in args, or -1 if not found.
func argIndex(args []string, val string) int {
	for i, a := range args {
		if a == val {
			return i
		}
	}
	return -1
}

// --- PlocateIndexer tests ---

func TestPlocate_Capabilities(t *testing.T) {
	idx := index.NewPlocateIndexer(&fakeRunner{})
	caps := idx.Capabilities()
	if caps.BooleanOps {
		t.Error("BooleanOps should be false")
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

func TestPlocate_IDAndName(t *testing.T) {
	idx := index.NewPlocateIndexer(&fakeRunner{})
	if idx.ID() != "plocate" {
		t.Errorf("ID=%q want plocate", idx.ID())
	}
	if idx.Name() != "plocate" {
		t.Errorf("Name=%q want plocate", idx.Name())
	}
}

func TestPlocate_RegexMode_Command(t *testing.T) {
	dir := t.TempDir()
	f := filepath.Join(dir, "invoice.pdf")
	writeTestFile(t, f)

	fr := &fakeRunner{stdouts: []string{f + "\n"}}
	idx := index.NewPlocateIndexer(fr)

	ast, _ := query.Parse(`inv.*\.pdf`, query.ModeRegex)
	results, degraded, err := idx.Query(context.Background(), ast, query.ModeRegex, protocol.SearchRequest{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if degraded {
		t.Error("expected degraded=false for regex mode")
	}
	if len(results) != 1 {
		t.Fatalf("got %d results, want 1", len(results))
	}

	if len(fr.calls) != 1 {
		t.Fatalf("expected 1 runner call, got %d", len(fr.calls))
	}
	call := fr.calls[0]

	if call.name != idx.Bin {
		t.Errorf("binary: got %q, want %q", call.name, idx.Bin)
	}
	if !argsContain(call.args, "--regexp") {
		t.Error("expected --regexp flag in regex mode")
	}
	if !argsContain(call.args, "-i") {
		t.Error("expected -i (case-insensitive) flag")
	}
	if !argsContain(call.args, "500") {
		t.Error("expected limit 500")
	}
	ddIdx := argIndex(call.args, "--")
	patIdx := argIndex(call.args, `inv.*\.pdf`)
	if ddIdx < 0 {
		t.Fatal("expected -- in args")
	}
	if patIdx < 0 {
		t.Fatal("expected regex pattern in args")
	}
	if ddIdx >= patIdx {
		t.Error("-- must appear before the pattern")
	}
}

func TestPlocate_SubstringMode_Command(t *testing.T) {
	dir := t.TempDir()
	f := filepath.Join(dir, "report.pdf")
	writeTestFile(t, f)

	fr := &fakeRunner{stdouts: []string{f + "\n"}}
	idx := index.NewPlocateIndexer(fr)

	ast, _ := query.Parse("report", query.ModeSimple)
	results, degraded, err := idx.Query(context.Background(), ast, query.ModeSimple, protocol.SearchRequest{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if degraded {
		t.Error("expected degraded=false")
	}
	if len(results) != 1 {
		t.Fatalf("got %d results, want 1", len(results))
	}

	if len(fr.calls) != 1 {
		t.Fatalf("expected 1 runner call, got %d", len(fr.calls))
	}
	call := fr.calls[0]

	if argsContain(call.args, "--regexp") {
		t.Error("--regexp must NOT appear in substring mode")
	}
	if !argsContain(call.args, "-i") {
		t.Error("expected -i flag")
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

func TestPlocate_ORQuery_TwoInvocations(t *testing.T) {
	dir := t.TempDir()
	f1 := filepath.Join(dir, "alpha.txt")
	f2 := filepath.Join(dir, "beta.txt")
	writeTestFile(t, f1)
	writeTestFile(t, f2)

	fr := &fakeRunner{stdouts: []string{f1 + "\n", f2 + "\n"}}
	idx := index.NewPlocateIndexer(fr)

	ast, _ := query.Parse("alpha | beta", query.ModeSimple)
	results, _, err := idx.Query(context.Background(), ast, query.ModeSimple, protocol.SearchRequest{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}

	if len(fr.calls) != 2 {
		t.Fatalf("expected 2 runner calls (one per OR branch), got %d", len(fr.calls))
	}
	// Seeds should be "alpha" and "beta" in some order.
	seed0 := fr.calls[0].args[len(fr.calls[0].args)-1]
	seed1 := fr.calls[1].args[len(fr.calls[1].args)-1]
	if (seed0 != "alpha" || seed1 != "beta") && (seed0 != "beta" || seed1 != "alpha") {
		t.Errorf("unexpected seeds %q, %q; want alpha and beta", seed0, seed1)
	}
	if len(results) != 2 {
		t.Fatalf("expected 2 results (union of branches), got %d", len(results))
	}
}

func TestPlocate_MissingPathsSkipped(t *testing.T) {
	dir := t.TempDir()
	real := filepath.Join(dir, "real.txt")
	writeTestFile(t, real)

	stale := "/nonexistent/path/stale_entry_12345.txt"
	fr := &fakeRunner{stdouts: []string{real + "\n" + stale + "\n"}}
	idx := index.NewPlocateIndexer(fr)

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

func TestPlocate_DeduplicatePaths(t *testing.T) {
	dir := t.TempDir()
	f := filepath.Join(dir, "shared.txt")
	writeTestFile(t, f)

	// Both OR branches return the same path.
	fr := &fakeRunner{stdouts: []string{f + "\n", f + "\n"}}
	idx := index.NewPlocateIndexer(fr)

	ast, _ := query.Parse("shared | shared", query.ModeSimple)
	results, _, err := idx.Query(context.Background(), ast, query.ModeSimple, protocol.SearchRequest{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 deduplicated result, got %d", len(results))
	}
}

func TestPlocate_PureNegation_NoRunnerCall(t *testing.T) {
	fr := &fakeRunner{}
	idx := index.NewPlocateIndexer(fr)

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

func TestPlocate_BlankLinesIgnored(t *testing.T) {
	dir := t.TempDir()
	f := filepath.Join(dir, "note.txt")
	writeTestFile(t, f)

	// stdout with leading/trailing blank lines and whitespace-only line.
	stdout := "\n  \n" + f + "\n\n"
	fr := &fakeRunner{stdouts: []string{stdout}}
	idx := index.NewPlocateIndexer(fr)

	ast, _ := query.Parse("note", query.ModeSimple)
	results, _, err := idx.Query(context.Background(), ast, query.ModeSimple, protocol.SearchRequest{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
}

func TestPlocate_ResultsNeverNil(t *testing.T) {
	fr := &fakeRunner{stdouts: []string{""}}
	idx := index.NewPlocateIndexer(fr)

	ast, _ := query.Parse("anything", query.ModeSimple)
	results, _, err := idx.Query(context.Background(), ast, query.ModeSimple, protocol.SearchRequest{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if results == nil {
		t.Error("results must never be nil")
	}
}
