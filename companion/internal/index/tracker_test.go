package index_test

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/index"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/protocol"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/query"
)

// --- TrackerIndexer tests ---
//
// Canned tracker3 search --files output format (what the parser must handle):
//
//	Results:
//	  file:///abs/path/to/report.pdf
//	  file:///abs/path/to/vacation%20photo.png
//
//	  2 results found.
//
// Rules:
//   - Any line containing a "file://" token has the URL extracted (from "file://" to end of line).
//   - The URL is percent-decoded via net/url so "vacation%20photo.png" → "vacation photo.png".
//   - Lines with no "file://" token (header "Results:", blank, count "N results found.") are ignored.

func TestTracker_Capabilities(t *testing.T) {
	idx := index.NewTrackerIndexer(&fakeRunner{})
	caps := idx.Capabilities()
	if caps.BooleanOps {
		t.Error("BooleanOps should be false")
	}
	if !caps.PrefixWildcard {
		t.Error("PrefixWildcard should be true")
	}
	if caps.InfixWildcard {
		t.Error("InfixWildcard should be false")
	}
	if caps.Regex {
		t.Error("Regex should be false")
	}
	if caps.PathScope {
		t.Error("PathScope should be false")
	}
	if !caps.Content {
		t.Error("Content should be true")
	}
}

func TestTracker_IDAndName(t *testing.T) {
	idx := index.NewTrackerIndexer(&fakeRunner{})
	if idx.ID() != "tracker" {
		t.Errorf("ID=%q want tracker", idx.ID())
	}
	if idx.Name() != "GNOME Tracker" {
		t.Errorf("Name=%q want 'GNOME Tracker'", idx.Name())
	}
}

func TestTracker_RegexMode_Degraded(t *testing.T) {
	fr := &fakeRunner{}
	idx := index.NewTrackerIndexer(fr)

	ast, _ := query.Parse(`inv.*\.pdf`, query.ModeRegex)
	results, degraded, err := idx.Query(context.Background(), ast, query.ModeRegex, protocol.SearchRequest{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if !degraded {
		t.Error("expected degraded=true for regex mode (Tracker has no native regex)")
	}
	if len(results) != 0 {
		t.Errorf("expected 0 results for degraded regex, got %d", len(results))
	}
	if len(fr.calls) != 0 {
		t.Errorf("expected no runner calls for regex mode, got %d", len(fr.calls))
	}
}

func TestTracker_SubstringMode_Command(t *testing.T) {
	dir := t.TempDir()
	f := filepath.Join(dir, "report.pdf")
	writeTestFile(t, f)

	// Canned tracker3 output: header + indented file:// URL + blank + count.
	stdout := "Results:\n  file://" + f + "\n\n  1 results found.\n"
	fr := &fakeRunner{stdouts: []string{stdout}}
	idx := index.NewTrackerIndexer(fr)
	idx.Bin = "tracker3" // set explicitly; tracker3 is not installed on this host

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
	if call.name != "tracker3" {
		t.Errorf("binary=%q want tracker3", call.name)
	}
	if !argsContain(call.args, "search") {
		t.Error("expected 'search' subcommand in args")
	}
	if !argsContain(call.args, "--files") {
		t.Error("expected --files flag")
	}
	if !argsContain(call.args, "--limit") {
		t.Error("expected --limit flag")
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

func TestTracker_PercentDecoding(t *testing.T) {
	dir := t.TempDir()
	// File with a space in the name; tracker outputs it as %20 in the file:// URL.
	f := filepath.Join(dir, "vacation photo.png")
	writeTestFile(t, f)

	// Simulate tracker3 percent-encoding spaces as %20.
	encoded := "file://" + dir + "/vacation%20photo.png"
	stdout := "Results:\n  " + encoded + "\n\n  1 results found.\n"
	fr := &fakeRunner{stdouts: []string{stdout}}
	idx := index.NewTrackerIndexer(fr)
	idx.Bin = "tracker3"

	ast, _ := query.Parse("vacation", query.ModeSimple)
	results, _, err := idx.Query(context.Background(), ast, query.ModeSimple, protocol.SearchRequest{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("got %d results, want 1", len(results))
	}
	if results[0].Path != f {
		t.Errorf("path=%q want %q (percent-decoding failed)", results[0].Path, f)
	}
}

func TestTracker_HeaderAndCountLinesIgnored(t *testing.T) {
	dir := t.TempDir()
	f := filepath.Join(dir, "photo.png")
	writeTestFile(t, f)

	// Output with "Results:" header, blank line, and count trailer.
	stdout := "Results:\n  file://" + f + "\n\n  1 results found.\n"
	fr := &fakeRunner{stdouts: []string{stdout}}
	idx := index.NewTrackerIndexer(fr)
	idx.Bin = "tracker3"

	ast, _ := query.Parse("photo", query.ModeSimple)
	results, _, err := idx.Query(context.Background(), ast, query.ModeSimple, protocol.SearchRequest{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result (header and count lines ignored), got %d", len(results))
	}
	if results[0].Path != f {
		t.Errorf("path=%q want %q", results[0].Path, f)
	}
}

func TestTracker_MissingPathsSkipped(t *testing.T) {
	dir := t.TempDir()
	real := filepath.Join(dir, "exists.txt")
	writeTestFile(t, real)

	stale := "file:///nonexistent/path/stale_tracker_entry_99.txt"
	stdout := "Results:\n  file://" + real + "\n  " + stale + "\n\n  2 results found.\n"
	fr := &fakeRunner{stdouts: []string{stdout}}
	idx := index.NewTrackerIndexer(fr)
	idx.Bin = "tracker3"

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

func TestTracker_ORQuery_TwoInvocations(t *testing.T) {
	dir := t.TempDir()
	f1 := filepath.Join(dir, "doc1.txt")
	f2 := filepath.Join(dir, "doc2.txt")
	writeTestFile(t, f1)
	writeTestFile(t, f2)

	fr := &fakeRunner{stdouts: []string{
		"Results:\n  file://" + f1 + "\n\n  1 results found.\n",
		"Results:\n  file://" + f2 + "\n\n  1 results found.\n",
	}}
	idx := index.NewTrackerIndexer(fr)
	idx.Bin = "tracker3"

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

func TestTracker_DeduplicatePaths(t *testing.T) {
	dir := t.TempDir()
	f := filepath.Join(dir, "dup.txt")
	writeTestFile(t, f)

	// Both branches return the same path.
	fr := &fakeRunner{stdouts: []string{
		"Results:\n  file://" + f + "\n\n  1 results found.\n",
		"Results:\n  file://" + f + "\n\n  1 results found.\n",
	}}
	idx := index.NewTrackerIndexer(fr)
	idx.Bin = "tracker3"

	ast, _ := query.Parse("dup | dup", query.ModeSimple)
	results, _, err := idx.Query(context.Background(), ast, query.ModeSimple, protocol.SearchRequest{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 deduplicated result, got %d", len(results))
	}
}

func TestTracker_PureNegation_NoCall(t *testing.T) {
	fr := &fakeRunner{}
	idx := index.NewTrackerIndexer(fr)

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

func TestTracker_ResultsNeverNil(t *testing.T) {
	fr := &fakeRunner{stdouts: []string{"Results:\n\n  0 results found.\n"}}
	idx := index.NewTrackerIndexer(fr)
	idx.Bin = "tracker3"

	ast, _ := query.Parse("anything", query.ModeSimple)
	results, _, err := idx.Query(context.Background(), ast, query.ModeSimple, protocol.SearchRequest{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if results == nil {
		t.Error("results must never be nil")
	}
}
