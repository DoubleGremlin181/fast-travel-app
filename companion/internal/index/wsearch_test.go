package index_test

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/index"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/protocol"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/query"
)

// --- WindowsSearchIndexer tests ---
//
// WindowsSearch queries via PowerShell ADO against the Windows Search index.
// On Linux (CI), powershell is absent so Available()=false. All tests use a
// fakeRunner so no real PowerShell is invoked.
//
// The generated PowerShell one-liner (for seed="report", limit=500):
//
//	$q = 'report';
//	$conn = New-Object -ComObject ADODB.Connection;
//	$conn.Open('Provider=Search.CollatorDSO;Extended Properties=''Application=Windows''');
//	$sql = 'SELECT TOP 500 System.ItemPathDisplay FROM SystemIndex WHERE System.FileName LIKE ''%' + $q + '%''';
//	$rs = $conn.Execute($sql);
//	while (-not $rs.EOF) { Write-Output $rs.Fields.Item('System.ItemPathDisplay').Value; $rs.MoveNext() };
//	$conn.Close()

func TestWSearch_Capabilities(t *testing.T) {
	idx := index.NewWindowsSearchIndexer(&fakeRunner{})
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

func TestWSearch_IDAndName(t *testing.T) {
	idx := index.NewWindowsSearchIndexer(&fakeRunner{})
	if idx.ID() != "wsearch" {
		t.Errorf("ID=%q want wsearch", idx.ID())
	}
	if idx.Name() != "Windows Search" {
		t.Errorf("Name=%q want 'Windows Search'", idx.Name())
	}
}

func TestWSearch_RegexMode_DegradedNoCall(t *testing.T) {
	// Windows Search has no native regex; must return (nil, true, nil) without
	// issuing any runner call.
	fr := &fakeRunner{}
	idx := index.NewWindowsSearchIndexer(fr)

	ast, _ := query.Parse(`inv.*\.pdf`, query.ModeRegex)
	results, degraded, err := idx.Query(context.Background(), ast, query.ModeRegex, protocol.SearchRequest{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if !degraded {
		t.Error("expected degraded=true for regex mode (WSearch has no native regex)")
	}
	if len(results) != 0 {
		t.Errorf("expected 0 results for degraded regex, got %d", len(results))
	}
	if len(fr.calls) != 0 {
		t.Errorf("expected no runner calls for regex mode, got %d", len(fr.calls))
	}
}

func TestWSearch_SubstringMode_Command(t *testing.T) {
	// Verify the generated powershell invocation structure.
	dir := t.TempDir()
	f := filepath.Join(dir, "report.pdf")
	writeTestFile(t, f)

	fr := &fakeRunner{stdouts: []string{f + "\n"}}
	idx := index.NewWindowsSearchIndexer(fr)
	idx.Bin = "powershell"

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
	if call.name != "powershell" {
		t.Errorf("binary=%q want powershell", call.name)
	}
	if !argsContain(call.args, "-NoProfile") {
		t.Error("expected -NoProfile flag")
	}
	if !argsContain(call.args, "-NonInteractive") {
		t.Error("expected -NonInteractive flag")
	}
	cmdIdx := argIndex(call.args, "-Command")
	if cmdIdx < 0 {
		t.Fatal("expected -Command flag")
	}
	if cmdIdx+1 >= len(call.args) {
		t.Fatal("-Command must be followed by the script argument")
	}
	script := call.args[cmdIdx+1]
	if !strings.Contains(script, "ADODB.Connection") {
		t.Error("script must reference ADODB.Connection")
	}
	if !strings.Contains(script, "SystemIndex") {
		t.Error("script must query SystemIndex")
	}
	if !strings.Contains(script, "report") {
		t.Error("script must embed the seed 'report'")
	}
	if !strings.Contains(script, "500") {
		t.Error("script must embed limit 500")
	}
	if !strings.Contains(script, "System.ItemPathDisplay") {
		t.Error("script must select System.ItemPathDisplay")
	}
	if !strings.Contains(script, "Write-Output") {
		t.Error("script must emit results via Write-Output")
	}
}

func TestWSearch_BuildCommand_SQLEscape(t *testing.T) {
	// A seed with a single-quote must not cause SQL injection in the generated script.
	fr := &fakeRunner{stdouts: []string{""}}
	idx := index.NewWindowsSearchIndexer(fr)
	idx.Bin = "powershell"

	ast, _ := query.Parse("O'Brien", query.ModeSimple)
	_, _, err := idx.Query(context.Background(), ast, query.ModeSimple, protocol.SearchRequest{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if len(fr.calls) != 1 {
		t.Fatalf("expected 1 runner call, got %d", len(fr.calls))
	}
	script := fr.calls[0].args[len(fr.calls[0].args)-1]
	// The raw seed "O'Brien" must not appear as a bare unescaped single-quote
	// in a position that could break the SQL string literal.
	// The escaped form should use doubled single-quotes ('' at each layer).
	if strings.Contains(script, "$q = 'O'Brien'") {
		t.Error("seed single-quote must be escaped; unescaped form found in $q assignment")
	}
	// There must be doubled single-quotes representing the escaped seed.
	if !strings.Contains(script, "''") {
		t.Error("expected escaped single-quotes ('') in generated script")
	}
}

func TestWSearch_MissingPathsSkipped(t *testing.T) {
	dir := t.TempDir()
	real := filepath.Join(dir, "exists.txt")
	writeTestFile(t, real)

	// Simulate a stale Windows path mixed with the real Linux temp path.
	stdout := real + "\nC:\\Windows\\stale_wsearch_entry_99.txt\n"
	fr := &fakeRunner{stdouts: []string{stdout}}
	idx := index.NewWindowsSearchIndexer(fr)
	idx.Bin = "powershell"

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

func TestWSearch_ORQuery_TwoInvocations(t *testing.T) {
	dir := t.TempDir()
	f1 := filepath.Join(dir, "doc1.txt")
	f2 := filepath.Join(dir, "doc2.txt")
	writeTestFile(t, f1)
	writeTestFile(t, f2)

	fr := &fakeRunner{stdouts: []string{f1 + "\n", f2 + "\n"}}
	idx := index.NewWindowsSearchIndexer(fr)
	idx.Bin = "powershell"

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

func TestWSearch_DeduplicatePaths(t *testing.T) {
	dir := t.TempDir()
	f := filepath.Join(dir, "dup.txt")
	writeTestFile(t, f)

	fr := &fakeRunner{stdouts: []string{f + "\n", f + "\n"}}
	idx := index.NewWindowsSearchIndexer(fr)
	idx.Bin = "powershell"

	ast, _ := query.Parse("dup | dup", query.ModeSimple)
	results, _, err := idx.Query(context.Background(), ast, query.ModeSimple, protocol.SearchRequest{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 deduplicated result, got %d", len(results))
	}
}

func TestWSearch_PureNegation_NoCall(t *testing.T) {
	fr := &fakeRunner{}
	idx := index.NewWindowsSearchIndexer(fr)

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

func TestWSearch_ResultsNeverNil(t *testing.T) {
	fr := &fakeRunner{stdouts: []string{""}}
	idx := index.NewWindowsSearchIndexer(fr)
	idx.Bin = "powershell"

	ast, _ := query.Parse("anything", query.ModeSimple)
	results, _, err := idx.Query(context.Background(), ast, query.ModeSimple, protocol.SearchRequest{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if results == nil {
		t.Error("results must never be nil")
	}
}

func TestWSearch_BlankLinesIgnored(t *testing.T) {
	dir := t.TempDir()
	f := filepath.Join(dir, "note.txt")
	writeTestFile(t, f)

	stdout := "\n  \n" + f + "\n\n"
	fr := &fakeRunner{stdouts: []string{stdout}}
	idx := index.NewWindowsSearchIndexer(fr)
	idx.Bin = "powershell"

	ast, _ := query.Parse("note", query.ModeSimple)
	results, _, err := idx.Query(context.Background(), ast, query.ModeSimple, protocol.SearchRequest{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
}
