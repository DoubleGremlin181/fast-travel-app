package index

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"strings"

	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/protocol"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/query"
)

// wsearchLimit caps the number of index candidates requested per invocation.
const wsearchLimit = 500

// WindowsSearchIndexer queries the Windows Search index via PowerShell ADO
// (ADODB.Connection against Provider=Search.CollatorDSO). It is inert on
// non-Windows hosts where PowerShell is not on PATH.
type WindowsSearchIndexer struct {
	runner Runner
	// Bin is the resolved powershell binary path, selected at construction time.
	// Exported so tests can set it explicitly without PATH lookups.
	Bin   string
	avail bool
}

// NewWindowsSearchIndexer creates a WindowsSearchIndexer using r for command
// execution. It resolves powershell / powershell.exe at construction time;
// Available() returns false if neither is on PATH (e.g. on Linux/macOS).
func NewWindowsSearchIndexer(r Runner) *WindowsSearchIndexer {
	bin, ok := LookPath("powershell")
	if !ok {
		bin, ok = LookPath("powershell.exe")
	}
	return &WindowsSearchIndexer{runner: r, Bin: bin, avail: ok}
}

func (w *WindowsSearchIndexer) ID() string      { return "wsearch" }
func (w *WindowsSearchIndexer) Name() string    { return "Windows Search" }
func (w *WindowsSearchIndexer) Available() bool { return w.avail }

// Capabilities for Windows Search:
//   - BooleanOps: true          — WSearch SQL supports AND/OR/NOT operators
//   - PrefixWildcard: true      — LIKE 'foo%' supported
//   - InfixWildcard: true       — LIKE '%foo%' supported
//   - Regex: false              — no native regex in WSearch SQL
//   - PathScope: true           — queries target file path properties
//   - Content: true             — WSearch indexes file content via IFilter
func (w *WindowsSearchIndexer) Capabilities() protocol.Capabilities {
	return protocol.Capabilities{
		BooleanOps:     true,
		PrefixWildcard: true,
		InfixWildcard:  true,
		Regex:          false,
		PathScope:      true,
		Content:        true,
	}
}

// buildWSearchCommand returns the powershell args for querying the Windows
// Search index for files whose name contains seed (LIKE '%seed%').
//
// This is a pure string builder with no side effects; tests call it
// indirectly via Query and inspect fr.calls to assert the generated
// command without executing real PowerShell.
//
// Escaping — two layers applied to seed:
//  1. SQL: ' → '' so the LIKE predicate sees a literal single-quote.
//  2. PowerShell single-quoted string: ' → '' for the $q = '...' assignment.
//
// When PowerShell parses the single-quoted $q assignment, layer 2 is undone,
// yielding the SQL-escaped value. The ADODB Execute call then sees correct SQL
// where '' is a literal '. Together the layers prevent SQL injection even when
// the seed contains single-quotes or SQL metacharacters.
//
// Generated one-liner (seed="report", limit=500):
//
//	$q = 'report';
//	$conn = New-Object -ComObject ADODB.Connection;
//	$conn.Open('Provider=Search.CollatorDSO;Extended Properties=''Application=Windows''');
//	$sql = 'SELECT TOP 500 System.ItemPathDisplay FROM SystemIndex WHERE System.FileName LIKE ''%' + $q + '%''';
//	$rs = $conn.Execute($sql);
//	while (-not $rs.EOF) { Write-Output $rs.Fields.Item('System.ItemPathDisplay').Value; $rs.MoveNext() };
//	$conn.Close()
func buildWSearchCommand(seed string, limit int) []string {
	// Layer 1: SQL escaping — prevent injection in the LIKE predicate.
	sqlSafe := strings.ReplaceAll(seed, "'", "''")
	// Layer 2: PowerShell single-quoted string escaping for the $q assignment.
	// After PowerShell evaluates $q = '...', it undoes this layer, leaving the
	// SQL-escaped value in $q for safe concatenation into the SQL string.
	psSafe := strings.ReplaceAll(sqlSafe, "'", "''")
	script := fmt.Sprintf(
		"$q = '%s'; "+
			"$conn = New-Object -ComObject ADODB.Connection; "+
			"$conn.Open('Provider=Search.CollatorDSO;Extended Properties=''Application=Windows'''); "+
			"$sql = 'SELECT TOP %d System.ItemPathDisplay FROM SystemIndex WHERE System.FileName LIKE ''%%' + $q + '%%'''; "+
			"$rs = $conn.Execute($sql); "+
			"while (-not $rs.EOF) { Write-Output $rs.Fields.Item('System.ItemPathDisplay').Value; $rs.MoveNext() }; "+
			"$conn.Close()",
		psSafe, limit)
	return []string{"-NoProfile", "-NonInteractive", "-Command", script}
}

// Query returns candidate FileResults from the Windows Search index.
//
// Regex mode is not supported by Windows Search SQL. If the AST is a regex
// node, Query returns (nil, true, nil) — degraded, no error — so the registry
// can route the query to a regex-capable backend.
//
// Otherwise, for each OR branch with a positive literal seed, issues one
// PowerShell invocation (via buildWSearchCommand) and unions the results.
// Stdout is expected to contain one absolute Windows path per line.
func (w *WindowsSearchIndexer) Query(ctx context.Context, ast query.Node, _ query.Mode, _ protocol.SearchRequest) ([]protocol.FileResult, bool, error) {
	if _, ok := RegexPattern(ast); ok {
		// Windows Search has no native regex; signal degraded so the registry
		// routes the query to a regex-capable backend.
		return nil, true, nil
	}

	var all []string
	for _, branch := range ORBranches(ast) {
		seed, ok := PositiveSeed(branch)
		if !ok {
			// No positive literal anchor (e.g. pure negation); skip this branch.
			continue
		}
		args := buildWSearchCommand(seed, wsearchLimit)
		out, err := w.runner.Run(ctx, w.Bin, args...)
		if err != nil {
			continue
		}
		all = append(all, parseWinPaths(out)...)
	}
	return normalizeAndDedupe(all), false, nil
}

// parseWinPaths reads one-path-per-line stdout (Windows Search ADO or es).
// Blank and whitespace-only lines are silently ignored.
func parseWinPaths(out []byte) []string {
	var paths []string
	sc := bufio.NewScanner(bytes.NewReader(out))
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line != "" {
			paths = append(paths, line)
		}
	}
	return paths
}
