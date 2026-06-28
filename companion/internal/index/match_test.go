package index_test

import (
	"testing"

	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/index"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/protocol"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/query"
)

// makeResult builds a minimal FileResult for matcher tests.
func makeResult(name, path string) protocol.FileResult {
	return protocol.FileResult{
		ID:   path,
		Name: name,
		Path: path,
		Dir:  "/home/alice/docs",
		Ext:  "pdf",
		Type: protocol.FileTypeDocument,
	}
}

func TestMatches(t *testing.T) {
	type tc struct {
		name    string
		queryS  string
		mode    query.Mode
		result  protocol.FileResult
		want    bool
	}

	cases := []tc{
		// Substring term – hit
		{
			name:   "substring term hit",
			queryS: "report",
			mode:   query.ModeSimple,
			result: makeResult("annual-report-2024.pdf", "/home/alice/docs/annual-report-2024.pdf"),
			want:   true,
		},
		// Substring term – miss
		{
			name:   "substring term miss",
			queryS: "budget",
			mode:   query.ModeSimple,
			result: makeResult("annual-report-2024.pdf", "/home/alice/docs/annual-report-2024.pdf"),
			want:   false,
		},
		// Prefix substring hit (the term "ann" is a substring of "annual-...")
		{
			name:   "prefix substring hit",
			queryS: "ann",
			mode:   query.ModeSimple,
			result: makeResult("annual-report-2024.pdf", "/home/alice/docs/annual-report-2024.pdf"),
			want:   true,
		},
		// Wildcard glob anchored hit – inv*.pdf matches invoice_2024.pdf
		{
			name:   "wildcard glob hit",
			queryS: "inv*.pdf",
			mode:   query.ModeWildcard,
			result: makeResult("invoice_2024.pdf", "/home/bob/Invoices/invoice_2024.pdf"),
			want:   true,
		},
		// Wildcard glob anchored near-miss – inv*.pdf should NOT match "invoice_2024.txt"
		{
			name:   "wildcard glob near-miss",
			queryS: "inv*.pdf",
			mode:   query.ModeWildcard,
			result: makeResult("invoice_2024.txt", "/home/bob/Invoices/invoice_2024.txt"),
			want:   false,
		},
		// Phrase with internal space
		{
			name:   "phrase with space hit",
			queryS: `"annual report"`,
			mode:   query.ModeSimple,
			result: makeResult("annual report 2024.pdf", "/home/alice/docs/annual report 2024.pdf"),
			want:   true,
		},
		{
			name:   "phrase with space miss",
			queryS: `"annual report"`,
			mode:   query.ModeSimple,
			result: makeResult("annual-report-2024.pdf", "/home/alice/docs/annual-report-2024.pdf"),
			want:   false,
		},
		// Regex on name
		{
			name:   "regex on name hit",
			queryS: `^budget_\d{4}\.xlsx$`,
			mode:   query.ModeRegex,
			result: makeResult("budget_2024.xlsx", "/home/bob/Finance/budget_2024.xlsx"),
			want:   true,
		},
		{
			name:   "regex on name miss",
			queryS: `^budget_\d{4}\.xlsx$`,
			mode:   query.ModeRegex,
			result: makeResult("budget_summary.xlsx", "/home/bob/Finance/budget_summary.xlsx"),
			want:   false,
		},
		// path: term matches on path but not name
		{
			name:   "path term matches path not name",
			queryS: "path:Finance",
			mode:   query.ModeSimple,
			result: makeResult("report.pdf", "/home/bob/Finance/report.pdf"),
			want:   true,
		},
		{
			name:   "path term does not match when not in path",
			queryS: "path:Finance",
			mode:   query.ModeSimple,
			result: makeResult("report.pdf", "/home/alice/Documents/report.pdf"),
			want:   false,
		},
		// AND – both terms required
		{
			name:   "AND both match",
			queryS: "annual report",
			mode:   query.ModeSimple,
			result: makeResult("annual-report-2024.pdf", "/home/alice/docs/annual-report-2024.pdf"),
			want:   true,
		},
		{
			name:   "AND one missing",
			queryS: "annual budget",
			mode:   query.ModeSimple,
			result: makeResult("annual-report-2024.pdf", "/home/alice/docs/annual-report-2024.pdf"),
			want:   false,
		},
		// OR – either term sufficient
		{
			name:   "OR first matches",
			queryS: "annual | budget",
			mode:   query.ModeSimple,
			result: makeResult("annual-report-2024.pdf", "/home/alice/docs/annual-report-2024.pdf"),
			want:   true,
		},
		{
			name:   "OR second matches",
			queryS: "invoice | report",
			mode:   query.ModeSimple,
			result: makeResult("annual-report-2024.pdf", "/home/alice/docs/annual-report-2024.pdf"),
			want:   true,
		},
		{
			name:   "OR neither matches",
			queryS: "invoice | budget",
			mode:   query.ModeSimple,
			result: makeResult("annual-report-2024.pdf", "/home/alice/docs/annual-report-2024.pdf"),
			want:   false,
		},
		// NOT – excludes matching term
		{
			name:   "NOT excludes",
			queryS: "-budget",
			mode:   query.ModeSimple,
			result: makeResult("budget_2024.xlsx", "/home/bob/Finance/budget_2024.xlsx"),
			want:   false,
		},
		{
			name:   "NOT passes when term absent",
			queryS: "-budget",
			mode:   query.ModeSimple,
			result: makeResult("annual-report-2024.pdf", "/home/alice/docs/annual-report-2024.pdf"),
			want:   true,
		},
		// Wildcard infix glob – *report* matches annual_report
		{
			name:   "wildcard infix glob hit",
			queryS: "*report*",
			mode:   query.ModeWildcard,
			result: makeResult("annual_report.pdf", "/home/alice/docs/annual_report.pdf"),
			want:   true,
		},
	}

	for _, c := range cases {
		c := c
		t.Run(c.name, func(t *testing.T) {
			n, err := query.Parse(c.queryS, c.mode)
			if err != nil {
				t.Fatalf("query.Parse(%q, %q): %v", c.queryS, c.mode, err)
			}
			got := index.Matches(c.result, n, c.mode)
			if got != c.want {
				t.Errorf("Matches(%q, %q) = %v, want %v", c.queryS, c.result.Name, got, c.want)
			}
		})
	}
}
