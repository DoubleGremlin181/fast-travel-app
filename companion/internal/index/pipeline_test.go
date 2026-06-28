package index_test

import (
	"context"
	"testing"

	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/index"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/protocol"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/query"
)

// Fixed timestamps in ascending order (milliseconds since epoch).
const (
	ts0 = int64(1000000000000) // ~Sep 2001
	ts1 = int64(1100000000000) // ~Sep 2004
	ts2 = int64(1200000000000) // ~Jan 2008
	ts3 = int64(1300000000000) // ~Mar 2011
)

// testCorpus is a small fixed FileResult set used across pipeline tests.
//
//	a  – "report" prefix in Name, document type, under /docs/, created ts0
//	b  – "report" substring in Name, document type, under /docs/, created ts1
//	c  – "report" only in Path (not Name), document type, unknown createdAt (0)
//	d  – no "report" anywhere, video type
//	e  – "report" prefix in Name, code type, under /code/
//	f1 – "report" substring in Name, other type, ModifiedAt=ts1 (tiebreak pair with f2)
//	f2 – "report" substring in Name, other type, ModifiedAt=ts1 (tiebreak pair with f1)
var testCorpus = []protocol.FileResult{
	{ID: "a", Name: "report_q1.pdf", Path: "/docs/report_q1.pdf", Dir: "/docs", Ext: "pdf", Type: protocol.FileTypeDocument, ModifiedAt: ts1, CreatedAt: ts0},
	{ID: "b", Name: "annual_report.pdf", Path: "/docs/annual_report.pdf", Dir: "/docs", Ext: "pdf", Type: protocol.FileTypeDocument, ModifiedAt: ts2, CreatedAt: ts1},
	{ID: "c", Name: "summary.txt", Path: "/reports/summary.txt", Dir: "/reports", Ext: "txt", Type: protocol.FileTypeDocument, ModifiedAt: ts3, CreatedAt: 0},
	{ID: "d", Name: "vacation.mp4", Path: "/videos/vacation.mp4", Dir: "/videos", Ext: "mp4", Type: protocol.FileTypeVideo, ModifiedAt: ts0, CreatedAt: ts0},
	{ID: "e", Name: "report_gen.py", Path: "/code/report_gen.py", Dir: "/code", Ext: "py", Type: protocol.FileTypeCode, ModifiedAt: ts2, CreatedAt: ts2},
	{ID: "f1", Name: "b_report.log", Path: "/logs/b_report.log", Dir: "/logs", Ext: "log", Type: protocol.FileTypeOther, ModifiedAt: ts1, CreatedAt: ts1},
	{ID: "f2", Name: "a_report.log", Path: "/logs/a_report.log", Dir: "/logs", Ext: "log", Type: protocol.FileTypeOther, ModifiedAt: ts1, CreatedAt: ts1},
}

// newSearch builds a minimal SearchRequest with sensible defaults.
func newSearch(q string) protocol.SearchRequest {
	return protocol.SearchRequest{
		Query:     q,
		QueryMode: query.ModeSimple,
		Sort:      protocol.Sort{Field: "relevance", Dir: "desc"},
		PageSize:  100,
	}
}

// resultIDs returns the IDs of the results in order, for diagnostic messages.
func resultIDs(results []protocol.FileResult) []string {
	out := make([]string, len(results))
	for i, r := range results {
		out[i] = r.ID
	}
	return out
}

func TestSearch_BasicMatch(t *testing.T) {
	idx := index.NewMemIndexer(testCorpus, protocol.Capabilities{})
	resp, err := index.Search(context.Background(), idx, newSearch("report"))
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	// a, b, c, e, f1, f2 match "report"; d does not.
	if resp.Total != 6 {
		t.Errorf("Total = %d, want 6; results: %v", resp.Total, resultIDs(resp.Results))
	}
	for _, r := range resp.Results {
		if r.ID == "d" {
			t.Error("result 'd' (vacation.mp4) should not match 'report'")
		}
	}
}

func TestSearch_TypeFilter(t *testing.T) {
	idx := index.NewMemIndexer(testCorpus, protocol.Capabilities{})
	req := newSearch("report")
	req.Filters.Types = []protocol.FileType{protocol.FileTypeDocument}
	resp, err := index.Search(context.Background(), idx, req)
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	// a, b, c are documents that match "report"; e (code) and f1/f2 (other) are excluded.
	wantIDs := map[string]bool{"a": true, "b": true, "c": true}
	if resp.Total != 3 {
		t.Errorf("Total = %d, want 3; results: %v", resp.Total, resultIDs(resp.Results))
	}
	for _, r := range resp.Results {
		if !wantIDs[r.ID] {
			t.Errorf("unexpected result %q (type=%s) with Types filter=[document]", r.ID, r.Type)
		}
	}
}

func TestSearch_ModifiedRangeFilter(t *testing.T) {
	idx := index.NewMemIndexer(testCorpus, protocol.Capabilities{})
	req := newSearch("report")
	req.Filters.ModifiedRange = &protocol.DateRange{From: ts2} // ts2 and ts3 pass; ts1 excluded
	resp, err := index.Search(context.Background(), idx, req)
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	// b(ts2), c(ts3), e(ts2) pass; a(ts1), f1(ts1), f2(ts1) excluded.
	wantIDs := map[string]bool{"b": true, "c": true, "e": true}
	if resp.Total != 3 {
		t.Errorf("Total = %d, want 3; results: %v", resp.Total, resultIDs(resp.Results))
	}
	for _, r := range resp.Results {
		if !wantIDs[r.ID] {
			t.Errorf("unexpected result %q (modifiedAt=%d) with modifiedRange.From=%d", r.ID, r.ModifiedAt, ts2)
		}
	}
}

func TestSearch_CreatedRangeFilter_ExcludesUnknown(t *testing.T) {
	idx := index.NewMemIndexer(testCorpus, protocol.Capabilities{})
	req := newSearch("report")
	// From is set, so any result with createdAt==0 (unknown) must be excluded.
	req.Filters.CreatedRange = &protocol.DateRange{From: ts0}
	resp, err := index.Search(context.Background(), idx, req)
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	// c has createdAt=0 → excluded; a(ts0), b(ts1), e(ts2), f1(ts1), f2(ts1) pass.
	if resp.Total != 5 {
		t.Errorf("Total = %d, want 5 (c excluded due to unknown createdAt); results: %v", resp.Total, resultIDs(resp.Results))
	}
	for _, r := range resp.Results {
		if r.ID == "c" {
			t.Error("result 'c' (createdAt=0) should be excluded when a createdRange bound is set")
		}
	}
}

func TestSearch_PathPrefixFilter(t *testing.T) {
	idx := index.NewMemIndexer(testCorpus, protocol.Capabilities{})
	req := newSearch("report")
	req.Filters.PathPrefix = "/docs/"
	resp, err := index.Search(context.Background(), idx, req)
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	// Only a and b are under /docs/.
	wantIDs := map[string]bool{"a": true, "b": true}
	if resp.Total != 2 {
		t.Errorf("Total = %d, want 2; results: %v", resp.Total, resultIDs(resp.Results))
	}
	for _, r := range resp.Results {
		if !wantIDs[r.ID] {
			t.Errorf("unexpected result %q (path=%s) with pathPrefix=/docs/", r.ID, r.Path)
		}
	}
}

func TestSearch_TitleOnly(t *testing.T) {
	idx := index.NewMemIndexer(testCorpus, protocol.Capabilities{})

	// Without TitleOnly: c matches via its path (/reports/summary.txt).
	req := newSearch("report")
	req.Filters.TitleOnly = false
	resp, err := index.Search(context.Background(), idx, req)
	if err != nil {
		t.Fatalf("Search (TitleOnly=false): %v", err)
	}
	foundC := false
	for _, r := range resp.Results {
		if r.ID == "c" {
			foundC = true
		}
	}
	if !foundC {
		t.Error("TitleOnly=false: expected 'c' (path-only match) to be included")
	}

	// With TitleOnly: c must be excluded because its Name does not contain "report".
	req.Filters.TitleOnly = true
	resp, err = index.Search(context.Background(), idx, req)
	if err != nil {
		t.Fatalf("Search (TitleOnly=true): %v", err)
	}
	for _, r := range resp.Results {
		if r.ID == "c" {
			t.Error("TitleOnly=true: 'c' (path-only match) should be excluded")
		}
	}
}

func TestSearch_SortModifiedAscDesc(t *testing.T) {
	idx := index.NewMemIndexer(testCorpus, protocol.Capabilities{})

	// Ascending: each successive result must have ModifiedAt >= previous.
	req := newSearch("report")
	req.Sort = protocol.Sort{Field: "modified", Dir: "asc"}
	resp, err := index.Search(context.Background(), idx, req)
	if err != nil {
		t.Fatalf("Search (modified asc): %v", err)
	}
	prev := int64(0)
	for _, r := range resp.Results {
		if r.ModifiedAt < prev {
			t.Errorf("modified asc: out of order – %q has ModifiedAt=%d after prev=%d", r.ID, r.ModifiedAt, prev)
		}
		prev = r.ModifiedAt
	}

	// Descending: each successive result must have ModifiedAt <= previous.
	req.Sort = protocol.Sort{Field: "modified", Dir: "desc"}
	resp, err = index.Search(context.Background(), idx, req)
	if err != nil {
		t.Fatalf("Search (modified desc): %v", err)
	}
	prev = int64(1 << 62)
	for _, r := range resp.Results {
		if r.ModifiedAt > prev {
			t.Errorf("modified desc: out of order – %q has ModifiedAt=%d after prev=%d", r.ID, r.ModifiedAt, prev)
		}
		prev = r.ModifiedAt
	}
}

func TestSearch_RelevanceOrder(t *testing.T) {
	// Scoring bucket hierarchy: name-prefix (3) > name-substring (2) > path-only (1).
	// Expected order (desc): e(prefix,ts2) > a(prefix,ts1) > b(substr,ts2) > f2/f1(substr,ts1) > c(path,ts3).
	idx := index.NewMemIndexer(testCorpus, protocol.Capabilities{})
	resp, err := index.Search(context.Background(), idx, newSearch("report"))
	if err != nil {
		t.Fatalf("Search: %v", err)
	}

	posOf := func(id string) int {
		for i, r := range resp.Results {
			if r.ID == id {
				return i
			}
		}
		return -1
	}
	iA, iB, iC, iE := posOf("a"), posOf("b"), posOf("c"), posOf("e")
	if iA < 0 || iB < 0 || iC < 0 || iE < 0 {
		t.Fatalf("missing results: a=%d b=%d c=%d e=%d; all results: %v", iA, iB, iC, iE, resultIDs(resp.Results))
	}

	// Both prefix matches must rank above the substring match.
	if iA > iB {
		t.Errorf("prefix match 'a' (pos %d) should rank before substring 'b' (pos %d)", iA, iB)
	}
	if iE > iB {
		t.Errorf("prefix match 'e' (pos %d) should rank before substring 'b' (pos %d)", iE, iB)
	}
	// The substring match must rank above the path-only match.
	if iB > iC {
		t.Errorf("substring 'b' (pos %d) should rank before path-only 'c' (pos %d)", iB, iC)
	}
}

func TestSearch_NamePathTiebreak(t *testing.T) {
	// f1 "b_report.log" and f2 "a_report.log" have identical scores:
	// same nameBucket (2), same ModifiedAt (ts1), no history.
	// Deterministic tiebreak by Name ascending: "a_report.log" < "b_report.log" → f2 before f1.
	idx := index.NewMemIndexer(testCorpus, protocol.Capabilities{})
	resp, err := index.Search(context.Background(), idx, newSearch("report"))
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	iF1, iF2 := -1, -1
	for i, r := range resp.Results {
		switch r.ID {
		case "f1":
			iF1 = i
		case "f2":
			iF2 = i
		}
	}
	if iF1 < 0 || iF2 < 0 {
		t.Fatalf("f1=%d f2=%d: both should be present; results: %v", iF1, iF2, resultIDs(resp.Results))
	}
	if iF2 > iF1 {
		t.Errorf("tiebreak: f2 (Name 'a_report.log', pos %d) should appear before f1 (Name 'b_report.log', pos %d)", iF2, iF1)
	}
}

func TestSearch_HistoryBoost(t *testing.T) {
	// Two results with equal nameBucket (2); h is in History (boost +5), i is not.
	// Score(h) = 20 + 5 + recency(ts1) ≈ 25.055 >> Score(i) = 20 + 0 + recency(ts2) ≈ 20.06.
	// h must rank first.
	items := []protocol.FileResult{
		{ID: "h", Name: "annual_report_h.txt", Path: "/h/annual_report_h.txt", Type: protocol.FileTypeDocument, ModifiedAt: ts1, CreatedAt: ts1},
		{ID: "i", Name: "annual_report_i.txt", Path: "/i/annual_report_i.txt", Type: protocol.FileTypeDocument, ModifiedAt: ts2, CreatedAt: ts2},
	}
	idx := index.NewMemIndexer(items, protocol.Capabilities{})
	req := newSearch("report")
	req.History = []string{"h"}
	resp, err := index.Search(context.Background(), idx, req)
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if len(resp.Results) != 2 {
		t.Fatalf("want 2 results, got %d", len(resp.Results))
	}
	if resp.Results[0].ID != "h" {
		t.Errorf("history boost: 'h' should rank first; got %q first (results: %v)", resp.Results[0].ID, resultIDs(resp.Results))
	}
}

func TestSearch_Pagination(t *testing.T) {
	// 6 items match "report". PageSize=2 → 3 pages.
	idx := index.NewMemIndexer(testCorpus, protocol.Capabilities{})
	req := newSearch("report")
	req.PageSize = 2

	// Page 0: 2 results, Total=6.
	req.Page = 0
	resp, err := index.Search(context.Background(), idx, req)
	if err != nil {
		t.Fatalf("Search page 0: %v", err)
	}
	if resp.Total != 6 {
		t.Errorf("page 0: Total = %d, want 6", resp.Total)
	}
	if len(resp.Results) != 2 {
		t.Errorf("page 0: len(Results) = %d, want 2", len(resp.Results))
	}
	if resp.Page != 0 {
		t.Errorf("page 0: Page = %d, want 0", resp.Page)
	}

	// Page 1: next 2 results, Total still 6.
	req.Page = 1
	resp, err = index.Search(context.Background(), idx, req)
	if err != nil {
		t.Fatalf("Search page 1: %v", err)
	}
	if resp.Total != 6 {
		t.Errorf("page 1: Total = %d, want 6", resp.Total)
	}
	if len(resp.Results) != 2 {
		t.Errorf("page 1: len(Results) = %d, want 2", len(resp.Results))
	}
	if resp.Page != 1 {
		t.Errorf("page 1: Page = %d, want 1", resp.Page)
	}

	// Page 0 and page 1 must return different results.
	page0IDs := resultIDs(resp.Results)
	req.Page = 0
	resp0, _ := index.Search(context.Background(), idx, req)
	req.Page = 1
	resp1, _ := index.Search(context.Background(), idx, req)
	for _, id0 := range resultIDs(resp0.Results) {
		for _, id1 := range resultIDs(resp1.Results) {
			if id0 == id1 {
				t.Errorf("page 0 and page 1 share result %q (page0=%v page1=%v)", id0, resultIDs(resp0.Results), page0IDs)
			}
		}
	}

	// Out-of-range page → empty results, Total still 6.
	req.Page = 100
	resp, err = index.Search(context.Background(), idx, req)
	if err != nil {
		t.Fatalf("Search page 100: %v", err)
	}
	if resp.Total != 6 {
		t.Errorf("page 100: Total = %d, want 6", resp.Total)
	}
	if len(resp.Results) != 0 {
		t.Errorf("page 100: len(Results) = %d, want 0", len(resp.Results))
	}
}

func TestSearch_DegradedFlag(t *testing.T) {
	idx := index.NewMemIndexer(testCorpus, protocol.Capabilities{})
	idx.DegradedVal = true
	resp, err := index.Search(context.Background(), idx, newSearch("report"))
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if !resp.Degraded {
		t.Error("Degraded should be true when MemIndexer.DegradedVal is true")
	}
}

func TestSearch_NonNilEmptyResults(t *testing.T) {
	idx := index.NewMemIndexer(testCorpus, protocol.Capabilities{})
	// This query matches nothing in the corpus.
	resp, err := index.Search(context.Background(), idx, newSearch("zzz_no_match_ever_zzz"))
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if resp.Results == nil {
		t.Error("Results must be a non-nil empty slice (not nil) when nothing matches")
	}
	if len(resp.Results) != 0 {
		t.Errorf("Results should be empty, got %d results", len(resp.Results))
	}
	if resp.Total != 0 {
		t.Errorf("Total = %d, want 0", resp.Total)
	}
}

func TestSearch_EmptyQueryError(t *testing.T) {
	idx := index.NewMemIndexer(testCorpus, protocol.Capabilities{})
	req := protocol.SearchRequest{
		Query:    "",
		PageSize: 10,
	}
	_, err := index.Search(context.Background(), idx, req)
	if err == nil {
		t.Error("Search with an empty query should return an error")
	}
}
