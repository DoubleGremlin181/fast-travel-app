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

// --- RegexSeeds ---

func TestRegexSeeds_PlainLiteral(t *testing.T) {
	seeds, broad := index.RegexSeeds("report")
	if broad {
		t.Fatal("expected broad=false")
	}
	if len(seeds) != 1 || seeds[0] != "report" {
		t.Errorf("seeds=%v want [report]", seeds)
	}
}

func TestRegexSeeds_BudgetPattern(t *testing.T) {
	// ^budget_\d{4}\.xlsx$ — longest required run is "budget_" (breaks at \d)
	seeds, broad := index.RegexSeeds(`^budget_\d{4}\.xlsx$`)
	if broad {
		t.Fatal("expected broad=false")
	}
	if len(seeds) != 1 || seeds[0] != "budget_" {
		t.Errorf("seeds=%v want [budget_]", seeds)
	}
}

func TestRegexSeeds_Alternation(t *testing.T) {
	// foo|bar — two seeds
	seeds, broad := index.RegexSeeds("foo|bar")
	if broad {
		t.Fatal("expected broad=false")
	}
	if len(seeds) != 2 {
		t.Fatalf("len(seeds)=%d want 2; seeds=%v", len(seeds), seeds)
	}
	has := func(s string) bool {
		for _, v := range seeds {
			if v == s {
				return true
			}
		}
		return false
	}
	if !has("foo") || !has("bar") {
		t.Errorf("seeds=%v; want both foo and bar", seeds)
	}
}

func TestRegexSeeds_SingleCharAlternation_Broad(t *testing.T) {
	// a|.* — "a" is len 1 (< 2), so broad=true
	_, broad := index.RegexSeeds(`a|.*`)
	if !broad {
		t.Error("expected broad=true (one alternative has no usable literal)")
	}
}

func TestRegexSeeds_WildcardOnly_Broad(t *testing.T) {
	_, broad := index.RegexSeeds(`^.*$`)
	if !broad {
		t.Error("expected broad=true for ^.*$")
	}
}

func TestRegexSeeds_QuantifiedGroupSeedsOutsideGroup(t *testing.T) {
	// (foo)*bar — "foo" is inside an optional group, so the only required
	// literal is "bar". Seeding on "foo" would drop matches like "bar".
	seeds, broad := index.RegexSeeds(`(foo)*bar`)
	if broad {
		t.Fatalf("expected broad=false; seeds=%v", seeds)
	}
	if len(seeds) != 1 || seeds[0] != "bar" {
		t.Errorf("seeds=%v want [bar]", seeds)
	}
}

func TestRegexSeeds_GroupLiteralsIgnored(t *testing.T) {
	// (budget)_2024 — literals inside the group are never used as a required
	// seed; the required top-level run is "_2024".
	seeds, broad := index.RegexSeeds(`(budget)_2024`)
	if broad {
		t.Fatalf("expected broad=false; seeds=%v", seeds)
	}
	if len(seeds) != 1 || seeds[0] != "_2024" {
		t.Errorf("seeds=%v want [_2024]", seeds)
	}
}

func TestRegexSeeds_OnlyShortTopLevelLiterals_Broad(t *testing.T) {
	// a(bc)*d — the only top-level literals are "a" and "d" (each len 1), so
	// no usable seed exists and we must scan broadly (recall-safe fallback).
	_, broad := index.RegexSeeds(`a(bc)*d`)
	if !broad {
		t.Error("expected broad=true for a(bc)*d")
	}
}

func TestRegexSeeds_EscapedDotPattern(t *testing.T) {
	// inv\.pdf — \. is a literal dot; longest run is "inv.pdf"
	seeds, broad := index.RegexSeeds(`inv\.pdf`)
	if broad {
		t.Fatalf("expected broad=false; seeds=%v", seeds)
	}
	if len(seeds) != 1 {
		t.Fatalf("len(seeds)=%d want 1; seeds=%v", len(seeds), seeds)
	}
	if seeds[0] != "inv.pdf" {
		t.Errorf("seed=%q want inv.pdf", seeds[0])
	}
}

func TestRegexSeeds_CharClassPrefix(t *testing.T) {
	// [ab]cdef — char class breaks run, "cdef" is the longest required run
	seeds, broad := index.RegexSeeds("[ab]cdef")
	if broad {
		t.Fatal("expected broad=false")
	}
	if len(seeds) != 1 || seeds[0] != "cdef" {
		t.Errorf("seeds=%v want [cdef]", seeds)
	}
}

func TestRegexSeeds_Deduplication(t *testing.T) {
	// same seed from two branches → deduplicated
	seeds, broad := index.RegexSeeds("foo|foo")
	if broad {
		t.Fatal("expected broad=false")
	}
	if len(seeds) != 1 || seeds[0] != "foo" {
		t.Errorf("seeds=%v want [foo] (deduplicated)", seeds)
	}
}

func TestRegexSeeds_FlatOR_ThreeBranches(t *testing.T) {
	// a | b | c — each branch is len 1 → broad=true
	_, broad := index.RegexSeeds("a|b|c")
	if !broad {
		t.Error("expected broad=true for single-char alternation branches")
	}
}
