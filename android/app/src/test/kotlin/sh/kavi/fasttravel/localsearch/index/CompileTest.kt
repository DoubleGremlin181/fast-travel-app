package sh.kavi.fasttravel.localsearch.index

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import sh.kavi.fasttravel.localsearch.query.QueryMode
import sh.kavi.fasttravel.localsearch.query.parse

/**
 * Mirrors companion/internal/index/compile_test.go for the Kotlin ports of
 * ORBranches / PositiveSeed / RegexSeeds.
 */
class CompileTest {

    // ── orBranches ───────────────────────────────────────────────────────────────

    @Test
    fun `orBranches SingleTerm`() {
        val n = parse("hello", QueryMode.SIMPLE)
        val branches = orBranches(n)
        assertEquals(1, branches.size)
        assertEquals("term", branches[0].op)
    }

    @Test
    fun `orBranches ORTwoBranches`() {
        val n = parse("hello | world", QueryMode.SIMPLE)
        val branches = orBranches(n)
        assertEquals(2, branches.size)
    }

    @Test
    fun `orBranches ORThreeBranches`() {
        val n = parse("a | b | c", QueryMode.SIMPLE)
        val branches = orBranches(n)
        assertEquals(3, branches.size)
    }

    @Test
    fun `orBranches ANDIsNotOR`() {
        // "hello world" parses to an AND node — not split into branches.
        val n = parse("hello world", QueryMode.SIMPLE)
        val branches = orBranches(n)
        assertEquals(1, branches.size)
        assertEquals("and", branches[0].op)
    }

    // ── positiveSeed ─────────────────────────────────────────────────────────────

    @Test
    fun `positiveSeed PlainTerm`() {
        val n = parse("invoice", QueryMode.SIMPLE)
        val (seed, ok) = positiveSeed(n)
        assertTrue(ok)
        assertEquals("invoice", seed)
    }

    @Test
    fun `positiveSeed MultiTermPicksLongest`() {
        // "ab cdef" → AND{term:ab, term:cdef}; longest fragment is "cdef" (4 > 2).
        val n = parse("ab cdef", QueryMode.SIMPLE)
        val (seed, ok) = positiveSeed(n)
        assertTrue(ok)
        assertEquals("cdef", seed)
    }

    @Test
    fun `positiveSeed WildcardTermSplitsOnStar`() {
        // "inv*.pdf" splits on '*' → ["inv", ".pdf"]; longest is ".pdf" (4 > 3).
        val n = parse("inv*.pdf", QueryMode.WILDCARD)
        val (seed, ok) = positiveSeed(n)
        assertTrue(ok)
        assertEquals(".pdf", seed)
    }

    @Test
    fun `positiveSeed WildcardTermSplitsOnQuestion`() {
        // "inv?oice" splits on '?' → ["inv", "oice"]; longest is "oice" (4 > 3).
        val n = parse("inv?oice", QueryMode.WILDCARD)
        val (seed, ok) = positiveSeed(n)
        assertTrue(ok)
        assertEquals("oice", seed)
    }

    @Test
    fun `positiveSeed Phrase`() {
        // Phrases have no wildcards; the whole value is the fragment.
        val n = parse("\"hello world\"", QueryMode.SIMPLE)
        val (seed, ok) = positiveSeed(n)
        assertTrue(ok)
        assertEquals("hello world", seed)
    }

    @Test
    fun `positiveSeed NegatedTermIgnored`() {
        // "-foo bar" → AND{not{term:foo}, term:bar}; "foo" is negated, "bar" is positive.
        val n = parse("-foo bar", QueryMode.SIMPLE)
        val (seed, ok) = positiveSeed(n)
        assertTrue(ok)
        assertEquals("bar", seed)
    }

    @Test
    fun `positiveSeed PureNegation NoSeed`() {
        // "-foo" → not{term:foo}; no positive terms → no seed.
        val n = parse("-foo", QueryMode.SIMPLE)
        val (_, ok) = positiveSeed(n)
        assertFalse(ok, "expected ok=false for pure negation")
    }

    @Test
    fun `positiveSeed RegexNodeSkipped`() {
        // Regex-mode input → regex node; positiveSeed must not use the regex as a literal seed.
        val n = parse("foo", QueryMode.REGEX)
        val (_, ok) = positiveSeed(n)
        assertFalse(ok, "expected ok=false for regex node")
    }

    // ── regexSeeds ───────────────────────────────────────────────────────────────

    @Test
    fun `regexSeeds PlainLiteral`() {
        val (seeds, broad) = regexSeeds("report")
        assertFalse(broad)
        assertEquals(listOf("report"), seeds)
    }

    @Test
    fun `regexSeeds BudgetPattern`() {
        // ^budget_\d{4}\.xlsx$ — longest required run is "budget_" (breaks at \d)
        val (seeds, broad) = regexSeeds("""^budget_\d{4}\.xlsx$""")
        assertFalse(broad)
        assertEquals(listOf("budget_"), seeds)
    }

    @Test
    fun `regexSeeds Alternation`() {
        // foo|bar — two seeds
        val (seeds, broad) = regexSeeds("foo|bar")
        assertFalse(broad)
        assertEquals(2, seeds.size)
        assertTrue(seeds.contains("foo"), "seeds must contain foo; got $seeds")
        assertTrue(seeds.contains("bar"), "seeds must contain bar; got $seeds")
    }

    @Test
    fun `regexSeeds SingleCharAlternation Broad`() {
        // a|.* — "a" is len 1 (< 2), so broad=true
        val (_, broad) = regexSeeds("""a|.*""")
        assertTrue(broad, "expected broad=true (one alternative has no usable literal)")
    }

    @Test
    fun `regexSeeds WildcardOnly Broad`() {
        val (_, broad) = regexSeeds("""^.*$""")
        assertTrue(broad, "expected broad=true for ^.*\$")
    }

    @Test
    fun `regexSeeds QuantifiedGroupSeedsOutsideGroup`() {
        // (foo)*bar — "foo" is inside an optional group, so the only required
        // literal is "bar". Seeding on "foo" would drop matches like "bar".
        val (seeds, broad) = regexSeeds("(foo)*bar")
        assertFalse(broad, "expected broad=false; seeds=$seeds")
        assertEquals(listOf("bar"), seeds)
    }

    @Test
    fun `regexSeeds GroupLiteralsIgnored`() {
        // (budget)_2024 — literals inside the group are not used as a required
        // seed; the required top-level run is "_2024".
        val (seeds, broad) = regexSeeds("(budget)_2024")
        assertFalse(broad, "expected broad=false; seeds=$seeds")
        assertEquals(listOf("_2024"), seeds)
    }

    @Test
    fun `regexSeeds OnlyShortTopLevelLiterals Broad`() {
        // a(bc)*d — the only top-level literals are "a" and "d" (each len 1).
        val (_, broad) = regexSeeds("a(bc)*d")
        assertTrue(broad, "expected broad=true for a(bc)*d")
    }

    @Test
    fun `regexSeeds EscapedDotPattern`() {
        // inv\.pdf — \. is a literal dot; longest run is "inv.pdf"
        val (seeds, broad) = regexSeeds("""inv\.pdf""")
        assertFalse(broad, "expected broad=false; seeds=$seeds")
        assertEquals(1, seeds.size)
        assertEquals("inv.pdf", seeds[0])
    }

    @Test
    fun `regexSeeds CharClassPrefix`() {
        // [ab]cdef — char class breaks run, "cdef" is the longest required run
        val (seeds, broad) = regexSeeds("[ab]cdef")
        assertFalse(broad)
        assertEquals(listOf("cdef"), seeds)
    }

    @Test
    fun `regexSeeds Deduplication`() {
        // same seed from two branches → deduplicated
        val (seeds, broad) = regexSeeds("foo|foo")
        assertFalse(broad)
        assertEquals(listOf("foo"), seeds)
    }

    @Test
    fun `regexSeeds FlatOR ThreeBranches Broad`() {
        // a | b | c — each branch is len 1 → broad=true
        val (_, broad) = regexSeeds("a|b|c")
        assertTrue(broad, "expected broad=true for single-char alternation branches")
    }
}
