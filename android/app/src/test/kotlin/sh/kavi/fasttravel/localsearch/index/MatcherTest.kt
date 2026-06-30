package sh.kavi.fasttravel.localsearch.index

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import sh.kavi.fasttravel.localsearch.query.QueryMode
import sh.kavi.fasttravel.localsearch.query.parse
import java.util.stream.Stream

/**
 * Mirrors companion/internal/index/match_test.go – covers substring, wildcard-glob,
 * phrase, regex, path:, AND, OR, NOT with the real parser.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class MatcherTest {

    data class TC(
        val name: String,
        val queryString: String,
        val mode: QueryMode,
        val result: FileResult,
        val want: Boolean,
    ) {
        override fun toString(): String = name
    }

    private fun makeResult(name: String, path: String) = FileResult(
        id = path,
        name = name,
        path = path,
        dir = "/home/alice/docs",
        ext = "pdf",
        type = FileType.DOCUMENT,
    )

    private fun cases(): Stream<TC> = listOf(
        TC("substring term hit", "report", QueryMode.SIMPLE,
            makeResult("annual-report-2024.pdf", "/home/alice/docs/annual-report-2024.pdf"), true),
        TC("substring term miss", "budget", QueryMode.SIMPLE,
            makeResult("annual-report-2024.pdf", "/home/alice/docs/annual-report-2024.pdf"), false),
        TC("prefix substring hit", "ann", QueryMode.SIMPLE,
            makeResult("annual-report-2024.pdf", "/home/alice/docs/annual-report-2024.pdf"), true),
        TC("wildcard glob hit", "inv*.pdf", QueryMode.WILDCARD,
            makeResult("invoice_2024.pdf", "/home/bob/Invoices/invoice_2024.pdf"), true),
        TC("wildcard glob near-miss", "inv*.pdf", QueryMode.WILDCARD,
            makeResult("invoice_2024.txt", "/home/bob/Invoices/invoice_2024.txt"), false),
        TC("phrase with space hit", "\"annual report\"", QueryMode.SIMPLE,
            makeResult("annual report 2024.pdf", "/home/alice/docs/annual report 2024.pdf"), true),
        TC("phrase with space miss", "\"annual report\"", QueryMode.SIMPLE,
            makeResult("annual-report-2024.pdf", "/home/alice/docs/annual-report-2024.pdf"), false),
        TC("regex on name hit", """^budget_\d{4}\.xlsx$""", QueryMode.REGEX,
            makeResult("budget_2024.xlsx", "/home/bob/Finance/budget_2024.xlsx"), true),
        TC("regex on name miss", """^budget_\d{4}\.xlsx$""", QueryMode.REGEX,
            makeResult("budget_summary.xlsx", "/home/bob/Finance/budget_summary.xlsx"), false),
        TC("path term matches path not name", "path:Finance", QueryMode.SIMPLE,
            makeResult("report.pdf", "/home/bob/Finance/report.pdf"), true),
        TC("path term does not match when not in path", "path:Finance", QueryMode.SIMPLE,
            makeResult("report.pdf", "/home/alice/Documents/report.pdf"), false),
        TC("AND both match", "annual report", QueryMode.SIMPLE,
            makeResult("annual-report-2024.pdf", "/home/alice/docs/annual-report-2024.pdf"), true),
        TC("AND one missing", "annual budget", QueryMode.SIMPLE,
            makeResult("annual-report-2024.pdf", "/home/alice/docs/annual-report-2024.pdf"), false),
        TC("OR first matches", "annual | budget", QueryMode.SIMPLE,
            makeResult("annual-report-2024.pdf", "/home/alice/docs/annual-report-2024.pdf"), true),
        TC("OR second matches", "invoice | report", QueryMode.SIMPLE,
            makeResult("annual-report-2024.pdf", "/home/alice/docs/annual-report-2024.pdf"), true),
        TC("OR neither matches", "invoice | budget", QueryMode.SIMPLE,
            makeResult("annual-report-2024.pdf", "/home/alice/docs/annual-report-2024.pdf"), false),
        TC("NOT excludes", "-budget", QueryMode.SIMPLE,
            makeResult("budget_2024.xlsx", "/home/bob/Finance/budget_2024.xlsx"), false),
        TC("NOT passes when term absent", "-budget", QueryMode.SIMPLE,
            makeResult("annual-report-2024.pdf", "/home/alice/docs/annual-report-2024.pdf"), true),
        TC("wildcard infix glob hit", "*report*", QueryMode.WILDCARD,
            makeResult("annual_report.pdf", "/home/alice/docs/annual_report.pdf"), true),
    ).stream()

    @ParameterizedTest(name = "{0}")
    @MethodSource("cases")
    @DisplayName("matcher cases")
    fun `matcher cases`(tc: TC) {
        val node = parse(tc.queryString, tc.mode)
        val got = matches(tc.result, node, tc.mode)
        assertEquals(tc.want, got, "matches(\"${tc.queryString}\", name=\"${tc.result.name}\")")
    }

    // ── caseSensitive tests ────────────────────────────────────────────────────

    @Test
    fun `caseSensitive false (default) matches term case-insensitively`() {
        val node = parse("REPORT", QueryMode.SIMPLE)
        val result = makeResult("annual-report-2024.pdf", "/home/alice/docs/annual-report-2024.pdf")
        assertTrue(matches(result, node, QueryMode.SIMPLE, caseSensitive = false))
    }

    @Test
    fun `caseSensitive true misses term when case differs`() {
        val node = parse("REPORT", QueryMode.SIMPLE)
        val result = makeResult("annual-report-2024.pdf", "/home/alice/docs/annual-report-2024.pdf")
        assertFalse(matches(result, node, QueryMode.SIMPLE, caseSensitive = true))
    }

    @Test
    fun `caseSensitive true hits term when case matches`() {
        val node = parse("report", QueryMode.SIMPLE)
        val result = makeResult("annual-report-2024.pdf", "/home/alice/docs/annual-report-2024.pdf")
        assertTrue(matches(result, node, QueryMode.SIMPLE, caseSensitive = true))
    }

    @Test
    fun `caseSensitive true misses phrase when case differs`() {
        // Quoted phrase node
        val node = parse("\"Annual Report\"", QueryMode.SIMPLE)
        val result = makeResult("annual report 2024.pdf", "/home/alice/docs/annual report 2024.pdf")
        // caseSensitive=true: field.contains("Annual Report") → false (file has lowercase)
        assertFalse(matches(result, node, QueryMode.SIMPLE, caseSensitive = true))
    }

    @Test
    fun `caseSensitive false hits phrase when case differs`() {
        val node = parse("\"Annual Report\"", QueryMode.SIMPLE)
        val result = makeResult("annual report 2024.pdf", "/home/alice/docs/annual report 2024.pdf")
        assertTrue(matches(result, node, QueryMode.SIMPLE, caseSensitive = false))
    }

    @Test
    fun `caseSensitive true with wildcard glob – case mismatch fails`() {
        val node = parse("Rep*.pdf", QueryMode.WILDCARD)
        val result = makeResult("report_2024.pdf", "/home/bob/report_2024.pdf")
        // caseSensitive=false uses (?i) prefix → matches; caseSensitive=true does not
        assertTrue(matches(result, node, QueryMode.WILDCARD, caseSensitive = false))
        assertFalse(matches(result, node, QueryMode.WILDCARD, caseSensitive = true))
    }

    @Test
    fun `caseSensitive does not affect regex nodes`() {
        // regex "report" should not match "REPORT.pdf" regardless of caseSensitive
        // (the pattern's own flags control case, caseSensitive is irrelevant)
        val node = parse("report", QueryMode.REGEX)
        val result = makeResult("REPORT.pdf", "/home/alice/REPORT.pdf")
        assertFalse(matches(result, node, QueryMode.REGEX, caseSensitive = false))
        assertFalse(matches(result, node, QueryMode.REGEX, caseSensitive = true))
    }
}
