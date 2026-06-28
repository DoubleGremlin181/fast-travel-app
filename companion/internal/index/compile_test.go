package index_test

import (
	"testing"

	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/index"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/query"
)

// --- ORBranches ---

func TestORBranches_SingleTerm(t *testing.T) {
	n, err := query.Parse("hello", query.ModeSimple)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	branches := index.ORBranches(n)
	if len(branches) != 1 {
		t.Fatalf("len=%d want 1", len(branches))
	}
	if branches[0].Op != "term" {
		t.Errorf("op=%q want term", branches[0].Op)
	}
}

func TestORBranches_ORTwoBranches(t *testing.T) {
	n, err := query.Parse("hello | world", query.ModeSimple)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	branches := index.ORBranches(n)
	if len(branches) != 2 {
		t.Fatalf("len=%d want 2", len(branches))
	}
}

func TestORBranches_ORThreeBranches(t *testing.T) {
	n, err := query.Parse("a | b | c", query.ModeSimple)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	branches := index.ORBranches(n)
	if len(branches) != 3 {
		t.Fatalf("len=%d want 3", len(branches))
	}
}

func TestORBranches_ANDIsNotOR(t *testing.T) {
	// "hello world" parses to an AND node — not split into branches.
	n, err := query.Parse("hello world", query.ModeSimple)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	branches := index.ORBranches(n)
	if len(branches) != 1 {
		t.Fatalf("len=%d want 1", len(branches))
	}
	if branches[0].Op != "and" {
		t.Errorf("op=%q want and", branches[0].Op)
	}
}

// --- PositiveSeed ---

func TestPositiveSeed_PlainTerm(t *testing.T) {
	n, _ := query.Parse("invoice", query.ModeSimple)
	seed, ok := index.PositiveSeed(n)
	if !ok {
		t.Fatal("expected ok=true")
	}
	if seed != "invoice" {
		t.Errorf("seed=%q want invoice", seed)
	}
}

func TestPositiveSeed_MultiTermPicksLongest(t *testing.T) {
	// "ab cdef" → AND{term:ab, term:cdef}; longest fragment is "cdef" (4 > 2).
	n, _ := query.Parse("ab cdef", query.ModeSimple)
	seed, ok := index.PositiveSeed(n)
	if !ok {
		t.Fatal("expected ok=true")
	}
	if seed != "cdef" {
		t.Errorf("seed=%q want cdef", seed)
	}
}

func TestPositiveSeed_WildcardTermSplitsOnStar(t *testing.T) {
	// "inv*.pdf" splits on '*' → ["inv", ".pdf"]; longest is ".pdf" (4 > 3).
	n, _ := query.Parse("inv*.pdf", query.ModeWildcard)
	seed, ok := index.PositiveSeed(n)
	if !ok {
		t.Fatal("expected ok=true")
	}
	if seed != ".pdf" {
		t.Errorf("seed=%q want .pdf", seed)
	}
}

func TestPositiveSeed_WildcardTermSplitsOnQuestion(t *testing.T) {
	// "inv?oice" splits on '?' → ["inv", "oice"]; longest is "oice" (4 > 3).
	n, _ := query.Parse("inv?oice", query.ModeWildcard)
	seed, ok := index.PositiveSeed(n)
	if !ok {
		t.Fatal("expected ok=true")
	}
	if seed != "oice" {
		t.Errorf("seed=%q want oice", seed)
	}
}

func TestPositiveSeed_Phrase(t *testing.T) {
	// Phrases have no wildcards; the whole value is the fragment.
	n, _ := query.Parse(`"hello world"`, query.ModeSimple)
	seed, ok := index.PositiveSeed(n)
	if !ok {
		t.Fatal("expected ok=true")
	}
	if seed != "hello world" {
		t.Errorf("seed=%q want 'hello world'", seed)
	}
}

func TestPositiveSeed_NegatedTermIgnored(t *testing.T) {
	// "-foo bar" → AND{not{term:foo}, term:bar}; "foo" is negated, "bar" is positive.
	n, _ := query.Parse("-foo bar", query.ModeSimple)
	seed, ok := index.PositiveSeed(n)
	if !ok {
		t.Fatal("expected ok=true")
	}
	if seed != "bar" {
		t.Errorf("seed=%q want bar", seed)
	}
}

func TestPositiveSeed_PureNegation_NoSeed(t *testing.T) {
	// "-foo" → not{term:foo}; no positive terms → no seed.
	n, _ := query.Parse("-foo", query.ModeSimple)
	_, ok := index.PositiveSeed(n)
	if ok {
		t.Error("expected ok=false for pure negation")
	}
}

func TestPositiveSeed_RegexNodeSkipped(t *testing.T) {
	// Regex-mode input → regex node; PositiveSeed must not use the regex as a literal seed.
	n, _ := query.Parse("foo", query.ModeRegex)
	_, ok := index.PositiveSeed(n)
	if ok {
		t.Error("expected ok=false for regex node")
	}
}

// --- RegexPattern ---

func TestRegexPattern_RegexNode(t *testing.T) {
	n, _ := query.Parse(`inv.*\.pdf`, query.ModeRegex)
	pat, ok := index.RegexPattern(n)
	if !ok {
		t.Fatal("expected ok=true")
	}
	if pat != `inv.*\.pdf` {
		t.Errorf("pat=%q want inv.*\\.pdf", pat)
	}
}

func TestRegexPattern_TermNode_False(t *testing.T) {
	n, _ := query.Parse("invoice", query.ModeSimple)
	_, ok := index.RegexPattern(n)
	if ok {
		t.Error("expected ok=false for term node")
	}
}

func TestRegexPattern_ANDNode_False(t *testing.T) {
	n, _ := query.Parse("hello world", query.ModeSimple)
	_, ok := index.RegexPattern(n)
	if ok {
		t.Error("expected ok=false for and node")
	}
}
