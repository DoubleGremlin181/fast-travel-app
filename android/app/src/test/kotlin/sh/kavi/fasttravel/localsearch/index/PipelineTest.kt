package sh.kavi.fasttravel.localsearch.index

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import sh.kavi.fasttravel.localsearch.query.QueryMode
import sh.kavi.fasttravel.localsearch.query.QueryParseException

/**
 * Mirrors companion/internal/index/pipeline_test.go.
 * All tests use in-memory candidates (no device/MediaStore required).
 */
class PipelineTest {

    // Fixed timestamps in ascending order (milliseconds since epoch).
    private val ts0 = 1000000000000L // ~Sep 2001
    private val ts1 = 1100000000000L // ~Sep 2004
    private val ts2 = 1200000000000L // ~Jan 2008
    private val ts3 = 1300000000000L // ~Mar 2011

    /**
     * testCorpus:
     *   a  – "report" prefix in Name, document, /docs/, created ts0
     *   b  – "report" substring in Name, document, /docs/, created ts1
     *   c  – "report" only in Path (not Name), document, createdAt=0
     *   d  – no "report" anywhere, video
     *   e  – "report" prefix in Name, code, /code/
     *   f1 – "report" substring in Name, other, ModifiedAt=ts1 (tiebreak pair)
     *   f2 – "report" substring in Name, other, ModifiedAt=ts1 (tiebreak pair)
     */
    private val testCorpus = listOf(
        FileResult(id = "a", name = "report_q1.pdf", path = "/docs/report_q1.pdf", dir = "/docs", ext = "pdf", type = FileType.DOCUMENT, modifiedAt = ts1, createdAt = ts0),
        FileResult(id = "b", name = "annual_report.pdf", path = "/docs/annual_report.pdf", dir = "/docs", ext = "pdf", type = FileType.DOCUMENT, modifiedAt = ts2, createdAt = ts1),
        FileResult(id = "c", name = "summary.txt", path = "/reports/summary.txt", dir = "/reports", ext = "txt", type = FileType.DOCUMENT, modifiedAt = ts3, createdAt = 0),
        FileResult(id = "d", name = "vacation.mp4", path = "/videos/vacation.mp4", dir = "/videos", ext = "mp4", type = FileType.VIDEO, modifiedAt = ts0, createdAt = ts0),
        FileResult(id = "e", name = "report_gen.py", path = "/code/report_gen.py", dir = "/code", ext = "py", type = FileType.CODE, modifiedAt = ts2, createdAt = ts2),
        FileResult(id = "f1", name = "b_report.log", path = "/logs/b_report.log", dir = "/logs", ext = "log", type = FileType.OTHER, modifiedAt = ts1, createdAt = ts1),
        FileResult(id = "f2", name = "a_report.log", path = "/logs/a_report.log", dir = "/logs", ext = "log", type = FileType.OTHER, modifiedAt = ts1, createdAt = ts1),
    )

    private fun newSearch(q: String) = SearchRequest(
        query = q,
        queryMode = QueryMode.SIMPLE,
        sort = Sort(field = "relevance", dir = "desc"),
        pageSize = 100,
    )

    private fun resultIds(results: List<FileResult>) = results.map { it.id }

    @Test
    fun `basic match – report matches 6 of 7`() {
        val resp = search(testCorpus, newSearch("report"))
        assertEquals(6, resp.total, "Total; results: ${resultIds(resp.results)}")
        assertFalse(resp.results.any { it.id == "d" }, "result 'd' (vacation.mp4) should not match 'report'")
    }

    @Test
    fun `type filter – document only returns a, b, c`() {
        val req = newSearch("report").copy(filters = Filters(types = listOf(FileType.DOCUMENT)))
        val resp = search(testCorpus, req)
        val wantIds = setOf("a", "b", "c")
        assertEquals(3, resp.total, "Total; results: ${resultIds(resp.results)}")
        for (r in resp.results) {
            assertTrue(r.id in wantIds, "unexpected result '${r.id}' (type=${r.type}) with Types filter=[document]")
        }
    }

    @Test
    fun `modified range filter – from ts2 excludes ts1 results`() {
        val req = newSearch("report").copy(filters = Filters(modifiedRange = DateRange(from = ts2)))
        val resp = search(testCorpus, req)
        val wantIds = setOf("b", "c", "e")
        assertEquals(3, resp.total, "Total; results: ${resultIds(resp.results)}")
        for (r in resp.results) {
            assertTrue(r.id in wantIds, "unexpected result '${r.id}' (modifiedAt=${r.modifiedAt}) with modifiedRange.from=$ts2")
        }
    }

    @Test
    fun `created range filter – excludes unknown createdAt==0`() {
        val req = newSearch("report").copy(filters = Filters(createdRange = DateRange(from = ts0)))
        val resp = search(testCorpus, req)
        // c has createdAt=0 → excluded; a(ts0), b(ts1), e(ts2), f1(ts1), f2(ts1) pass.
        assertEquals(5, resp.total, "Total (c excluded due to unknown createdAt); results: ${resultIds(resp.results)}")
        assertFalse(resp.results.any { it.id == "c" }, "result 'c' (createdAt=0) should be excluded when a createdRange bound is set")
    }

    @Test
    fun `path prefix filter – docs only returns a and b`() {
        val req = newSearch("report").copy(filters = Filters(pathPrefix = "/docs/"))
        val resp = search(testCorpus, req)
        val wantIds = setOf("a", "b")
        assertEquals(2, resp.total, "Total; results: ${resultIds(resp.results)}")
        for (r in resp.results) {
            assertTrue(r.id in wantIds, "unexpected result '${r.id}' (path=${r.path}) with pathPrefix=/docs/")
        }
    }

    @Test
    fun `titleOnly false includes path-only match c`() {
        val req = newSearch("report").copy(filters = Filters(titleOnly = false))
        val resp = search(testCorpus, req)
        assertTrue(resp.results.any { it.id == "c" }, "TitleOnly=false: expected 'c' (path-only match) to be included")
    }

    @Test
    fun `titleOnly true excludes path-only match c`() {
        val req = newSearch("report").copy(filters = Filters(titleOnly = true))
        val resp = search(testCorpus, req)
        assertFalse(resp.results.any { it.id == "c" }, "TitleOnly=true: 'c' (path-only match) should be excluded")
    }

    @Test
    fun `sort modified asc – monotone increasing`() {
        val req = newSearch("report").copy(sort = Sort(field = "modified", dir = "asc"))
        val resp = search(testCorpus, req)
        var prev = 0L
        for (r in resp.results) {
            assertTrue(r.modifiedAt >= prev, "modified asc: out of order – '${r.id}' has modifiedAt=${r.modifiedAt} after prev=$prev")
            prev = r.modifiedAt
        }
    }

    @Test
    fun `sort modified desc – monotone decreasing`() {
        val req = newSearch("report").copy(sort = Sort(field = "modified", dir = "desc"))
        val resp = search(testCorpus, req)
        var prev = Long.MAX_VALUE
        for (r in resp.results) {
            assertTrue(r.modifiedAt <= prev, "modified desc: out of order – '${r.id}' has modifiedAt=${r.modifiedAt} after prev=$prev")
            prev = r.modifiedAt
        }
    }

    @Test
    fun `relevance order – prefix above substring above path-only`() {
        val resp = search(testCorpus, newSearch("report"))
        val posOf = { id: String -> resp.results.indexOfFirst { it.id == id } }
        val iA = posOf("a"); val iB = posOf("b"); val iC = posOf("c"); val iE = posOf("e")
        assertTrue(iA >= 0 && iB >= 0 && iC >= 0 && iE >= 0, "missing results: a=$iA b=$iB c=$iC e=$iE; all: ${resultIds(resp.results)}")
        assertTrue(iA < iB, "prefix match 'a' (pos $iA) should rank before substring 'b' (pos $iB)")
        assertTrue(iE < iB, "prefix match 'e' (pos $iE) should rank before substring 'b' (pos $iB)")
        assertTrue(iB < iC, "substring 'b' (pos $iB) should rank before path-only 'c' (pos $iC)")
    }

    @Test
    fun `tiebreak – f2 (a_report) before f1 (b_report) by name asc`() {
        val resp = search(testCorpus, newSearch("report"))
        val iF1 = resp.results.indexOfFirst { it.id == "f1" }
        val iF2 = resp.results.indexOfFirst { it.id == "f2" }
        assertTrue(iF1 >= 0 && iF2 >= 0, "f1=$iF1 f2=$iF2: both should be present; results: ${resultIds(resp.results)}")
        assertTrue(iF2 < iF1, "tiebreak: f2 (Name 'a_report.log', pos $iF2) should appear before f1 (Name 'b_report.log', pos $iF1)")
    }

    @Test
    fun `history boost – history item ranks first despite lower recency`() {
        val items = listOf(
            FileResult(id = "h", name = "annual_report_h.txt", path = "/h/annual_report_h.txt", type = FileType.DOCUMENT, modifiedAt = ts1, createdAt = ts1),
            FileResult(id = "i", name = "annual_report_i.txt", path = "/i/annual_report_i.txt", type = FileType.DOCUMENT, modifiedAt = ts2, createdAt = ts2),
        )
        val req = newSearch("report").copy(history = listOf("h"))
        val resp = search(items, req)
        assertEquals(2, resp.results.size, "want 2 results, got ${resp.results.size}")
        assertEquals("h", resp.results[0].id, "history boost: 'h' should rank first; got '${resp.results[0].id}' first")
    }

    @Test
    fun `pagination – page 0 of pageSize 2 returns 2 of 6`() {
        val req = newSearch("report").copy(pageSize = 2, page = 0)
        val resp = search(testCorpus, req)
        assertEquals(6, resp.total, "page 0: Total")
        assertEquals(2, resp.results.size, "page 0: result count")
        assertEquals(0, resp.page, "page 0: page field")
    }

    @Test
    fun `pagination – page 1 returns different results than page 0`() {
        val req = newSearch("report").copy(pageSize = 2)
        val resp0 = search(testCorpus, req.copy(page = 0))
        val resp1 = search(testCorpus, req.copy(page = 1))
        assertEquals(6, resp1.total, "page 1: Total")
        assertEquals(2, resp1.results.size, "page 1: result count")
        val ids0 = resultIds(resp0.results).toSet()
        for (id in resultIds(resp1.results)) {
            assertFalse(id in ids0, "page 0 and page 1 share result '$id'")
        }
    }

    @Test
    fun `pagination – out-of-range page returns empty results with correct total`() {
        val req = newSearch("report").copy(pageSize = 2, page = 100)
        val resp = search(testCorpus, req)
        assertEquals(6, resp.total, "page 100: Total")
        assertEquals(0, resp.results.size, "page 100: result count should be 0")
    }

    @Test
    fun `non-nil empty results when nothing matches`() {
        val resp = search(testCorpus, newSearch("zzz_no_match_ever_zzz"))
        assertNotNull(resp.results, "Results must be a non-null empty list when nothing matches")
        assertEquals(0, resp.results.size, "Results should be empty")
        assertEquals(0, resp.total, "Total = 0")
    }

    @Test
    fun `empty query throws`() {
        val req = SearchRequest(query = "", pageSize = 10)
        assertThrows(QueryParseException::class.java) { search(testCorpus, req) }
    }

    // --- financeCorpus for path-scope and regex-broadening tests ---

    /**
     * financeCorpus:
     *   g1 – "Finance" in path dir only (name is neutral)
     *   g2 – "Finance" in name only (path dir is neutral)
     *   g3 – "Finance" in both name and path
     *   g4 – "Finance" nowhere
     */
    private val financeCorpus = listOf(
        FileResult(id = "g1", name = "quarterly.pdf", path = "/Finance/quarterly.pdf", dir = "/Finance", ext = "pdf", type = FileType.DOCUMENT, modifiedAt = ts1, createdAt = ts1),
        FileResult(id = "g2", name = "Finance_plan.xlsx", path = "/accounting/budget.xlsx", dir = "/accounting", ext = "xlsx", type = FileType.DOCUMENT, modifiedAt = ts1, createdAt = ts1),
        FileResult(id = "g3", name = "Finance_summary.pdf", path = "/Finance/Finance_summary.pdf", dir = "/Finance", ext = "pdf", type = FileType.DOCUMENT, modifiedAt = ts1, createdAt = ts1),
        FileResult(id = "g4", name = "budget.csv", path = "/other/budget.csv", dir = "/other", ext = "csv", type = FileType.DOCUMENT, modifiedAt = ts1, createdAt = ts1),
    )

    @Test
    fun `explicit path scope – TitleOnly=false only matches path`() {
        val req = newSearch("path:Finance").copy(filters = Filters(titleOnly = false))
        val resp = search(financeCorpus, req)
        // g1 and g3 have Finance in their path → must match
        // g2 has Finance only in its name, not path → must NOT match (path: leaf not broadened)
        // g4 has Finance nowhere → must NOT match
        assertTrue(resp.results.any { it.id == "g1" }, "TitleOnly=false: g1 (Finance in path dir) must match path:Finance")
        assertTrue(resp.results.any { it.id == "g3" }, "TitleOnly=false: g3 (Finance in both) must match path:Finance")
        assertFalse(resp.results.any { it.id == "g2" }, "TitleOnly=false: g2 (Finance only in name) must NOT match path:Finance — path: leaf must not be broadened")
        assertFalse(resp.results.any { it.id == "g4" }, "TitleOnly=false: g4 (Finance nowhere) must NOT match")
    }

    @Test
    fun `explicit path scope – TitleOnly=true coerces to name check`() {
        val req = newSearch("path:Finance").copy(filters = Filters(titleOnly = true))
        val resp = search(financeCorpus, req)
        // coerceFieldsToName forces path: leaf to evaluate against name field
        // g2 (Finance in name) and g3 (Finance in both) now match
        // g1 (Finance only in path, not name) no longer does
        assertFalse(resp.results.any { it.id == "g1" }, "TitleOnly=true: g1 (Finance only in path) must NOT match after coerce-to-name")
        assertTrue(resp.results.any { it.id == "g2" }, "TitleOnly=true: g2 (Finance in name) must match — path: coerced to name-check")
        assertTrue(resp.results.any { it.id == "g3" }, "TitleOnly=true: g3 (Finance in both) must match")
        assertFalse(resp.results.any { it.id == "g4" }, "TitleOnly=true: g4 (Finance nowhere) must NOT match")
    }

    // ── exactPhrase tests ──────────────────────────────────────────────────────

    /**
     * exactPhrase=true: the 2-word query "annual report" becomes a single phrase node,
     * so only files containing "annual report" as a contiguous substring match.
     * Mirrors companion/internal/index/pipeline.go ExactPhrase handling.
     */
    @Test
    fun `exactPhrase true – matches only contiguous phrase, not AND of terms`() {
        val corpus = listOf(
            FileResult(id = "j1", name = "annual-report.pdf", path = "/docs/annual-report.pdf", type = FileType.DOCUMENT),
            FileResult(id = "j2", name = "annual report.pdf", path = "/docs/annual report.pdf", type = FileType.DOCUMENT),
        )
        val req = SearchRequest(query = "annual report", queryMode = QueryMode.SIMPLE, exactPhrase = true, pageSize = 100)
        val resp = search(corpus, req)
        assertTrue(resp.results.any { it.id == "j2" }, "exactPhrase: 'annual report.pdf' (with space) must match")
        assertFalse(resp.results.any { it.id == "j1" }, "exactPhrase: 'annual-report.pdf' (dash) must NOT match phrase")
    }

    @Test
    fun `exactPhrase false (default) AND-matches both results`() {
        val corpus = listOf(
            FileResult(id = "j1", name = "annual-report.pdf", path = "/docs/annual-report.pdf", type = FileType.DOCUMENT),
            FileResult(id = "j2", name = "annual report.pdf", path = "/docs/annual report.pdf", type = FileType.DOCUMENT),
        )
        val req = SearchRequest(query = "annual report", queryMode = QueryMode.SIMPLE, exactPhrase = false, pageSize = 100)
        val resp = search(corpus, req)
        assertTrue(resp.results.any { it.id == "j1" }, "exactPhrase=false: AND-match hits 'annual-report.pdf'")
        assertTrue(resp.results.any { it.id == "j2" }, "exactPhrase=false: AND-match hits 'annual report.pdf'")
    }

    @Test
    fun `exactPhrase true is ignored in regex mode`() {
        val corpus = listOf(
            FileResult(id = "k1", name = "annual-report.pdf", path = "/docs/annual-report.pdf", type = FileType.DOCUMENT),
        )
        // regex mode: exactPhrase must be ignored; pattern "annual" matches name
        val req = SearchRequest(query = "annual", queryMode = QueryMode.REGEX, exactPhrase = true, pageSize = 100)
        val resp = search(corpus, req)
        assertTrue(resp.results.any { it.id == "k1" }, "exactPhrase in regex mode is ignored; pattern 'annual' must match")
    }

    // ── Bug A: invalid regex → QueryParseException ─────────────────────────────

    @Test
    fun `invalid regex throws QueryParseException`() {
        val corpus = listOf(
            FileResult(id = "r1", name = "report.pdf", path = "/docs/report.pdf", type = FileType.DOCUMENT),
        )
        val req = SearchRequest(query = "[invalid", queryMode = QueryMode.REGEX, pageSize = 100)
        assertThrows(QueryParseException::class.java) { search(corpus, req) }
    }

    @Test
    fun `regex broadening – name-only regex leaf is broadened to name-OR-path`() {
        val req = SearchRequest(
            query = "Finance",
            queryMode = QueryMode.REGEX,
            sort = Sort(field = "relevance", dir = "desc"),
            pageSize = 100,
            filters = Filters(titleOnly = false),
        )
        val resp = search(financeCorpus, req)
        // g1 matches via path, g2 via name, g3 via both; g4 matches neither.
        assertTrue(resp.results.any { it.id == "g1" }, "regex TitleOnly=false: g1 (Finance in path only) must match — regex leaves broadened to name-OR-path")
        assertFalse(resp.results.any { it.id == "g4" }, "regex TitleOnly=false: g4 (Finance nowhere) must NOT match")
        assertEquals(3, resp.total, "regex TitleOnly=false: want 3 results (g1, g2, g3), got ${resp.total}: ${resultIds(resp.results)}")
    }
}
