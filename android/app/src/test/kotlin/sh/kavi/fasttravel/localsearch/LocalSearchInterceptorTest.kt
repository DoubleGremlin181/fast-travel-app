package sh.kavi.fasttravel.localsearch

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import sh.kavi.fasttravel.localsearch.index.FileType

/**
 * JUnit5 unit tests for the pure local-search intercept helpers.
 * All tests run on the JVM — no android.* dependencies.
 */
class LocalSearchInterceptorTest {

    // ── shouldInterceptLocalSearch ────────────────────────────────────────────

    @Test
    fun `no intercept when local search is disabled`() {
        val r = shouldInterceptLocalSearch("s cats", enabled = false, configHasS = false)
        assertFalse(r.intercept)
        assertEquals("", r.query)
    }

    @Test
    fun `no intercept when config has s trigger`() {
        val r = shouldInterceptLocalSearch("s cats", enabled = true, configHasS = true)
        assertFalse(r.intercept)
        assertEquals("", r.query)
    }

    @Test
    fun `no intercept when both disabled and config has s`() {
        val r = shouldInterceptLocalSearch("s cats", enabled = false, configHasS = true)
        assertFalse(r.intercept)
    }

    @Test
    fun `no intercept for non-s input`() {
        assertFalse(shouldInterceptLocalSearch("g cats", enabled = true, configHasS = false).intercept)
        assertFalse(shouldInterceptLocalSearch("search cats", enabled = true, configHasS = false).intercept)
        assertFalse(shouldInterceptLocalSearch("sm cats", enabled = true, configHasS = false).intercept)
        assertFalse(shouldInterceptLocalSearch("so cats", enabled = true, configHasS = false).intercept)
        assertFalse(shouldInterceptLocalSearch("stack cats", enabled = true, configHasS = false).intercept)
        assertFalse(shouldInterceptLocalSearch("ss", enabled = true, configHasS = false).intercept)
    }

    @Test
    fun `intercepts bare s with empty query`() {
        val r = shouldInterceptLocalSearch("s", enabled = true, configHasS = false)
        assertTrue(r.intercept)
        assertEquals("", r.query)
    }

    @Test
    fun `intercepts s with single-word query`() {
        val r = shouldInterceptLocalSearch("s cats", enabled = true, configHasS = false)
        assertTrue(r.intercept)
        assertEquals("cats", r.query)
    }

    @Test
    fun `intercepts s with multi-word query`() {
        val r = shouldInterceptLocalSearch("s hello world", enabled = true, configHasS = false)
        assertTrue(r.intercept)
        assertEquals("hello world", r.query)
    }

    @Test
    fun `intercepts s with leading and trailing whitespace in input`() {
        val r = shouldInterceptLocalSearch("  s cats  ", enabled = true, configHasS = false)
        assertTrue(r.intercept)
        assertEquals("cats", r.query)
    }

    @Test
    fun `no intercept for empty input even when enabled`() {
        val r = shouldInterceptLocalSearch("", enabled = true, configHasS = false)
        assertFalse(r.intercept)
    }

    @Test
    fun `intercept is strict no-op for all non-matching inputs`() {
        listOf("", "g", "search", "sm", "ss", "sa").forEach { input ->
            val r = shouldInterceptLocalSearch(input, enabled = true, configHasS = false)
            assertFalse(r.intercept, "expected no intercept for: '$input'")
        }
    }

    // ── buildLocalSearchRequest ───────────────────────────────────────────────

    @Test
    fun `builds request with correct query`() {
        val req = buildLocalSearchRequest("cats", "simple", "", "", emptyList())
        assertEquals("cats", req.query)
    }

    @Test
    fun `builds request with simple query mode`() {
        val req = buildLocalSearchRequest("cats", "simple", "", "", emptyList())
        assertEquals(sh.kavi.fasttravel.localsearch.query.QueryMode.SIMPLE, req.queryMode)
    }

    @Test
    fun `builds request with wildcard query mode`() {
        val req = buildLocalSearchRequest("cats", "wildcard", "", "", emptyList())
        assertEquals(sh.kavi.fasttravel.localsearch.query.QueryMode.WILDCARD, req.queryMode)
    }

    @Test
    fun `builds request with regex query mode`() {
        val req = buildLocalSearchRequest("cats", "regex", "", "", emptyList())
        assertEquals(sh.kavi.fasttravel.localsearch.query.QueryMode.REGEX, req.queryMode)
    }

    @Test
    fun `builds request with unknown query mode defaults to simple`() {
        val req = buildLocalSearchRequest("cats", "unknown", "", "", emptyList())
        assertEquals(sh.kavi.fasttravel.localsearch.query.QueryMode.SIMPLE, req.queryMode)
    }

    @Test
    fun `builds request with correct sort field`() {
        val req = buildLocalSearchRequest("cats", "simple", "name", "asc", emptyList())
        assertEquals("name", req.sort.field)
    }

    @Test
    fun `builds request with correct sort direction`() {
        val req = buildLocalSearchRequest("cats", "simple", "modified", "desc", emptyList())
        assertEquals("desc", req.sort.dir)
    }

    @Test
    fun `builds request with empty sort falls back to pipeline defaults`() {
        val req = buildLocalSearchRequest("cats", "simple", "", "", emptyList())
        assertEquals("", req.sort.field)
        assertEquals("", req.sort.dir)
    }

    @Test
    fun `builds request with correct history list`() {
        val history = listOf("/storage/emulated/0/report.pdf", "/storage/emulated/0/notes.txt")
        val req = buildLocalSearchRequest("cats", "simple", "", "", history)
        assertEquals(history, req.history)
    }

    @Test
    fun `builds request with page 0`() {
        val req = buildLocalSearchRequest("cats", "simple", "", "", emptyList())
        assertEquals(0, req.page)
    }

    @Test
    fun `builds request with default pageSize of 50`() {
        val req = buildLocalSearchRequest("cats", "simple", "", "", emptyList())
        assertEquals(50, req.pageSize)
    }

    @Test
    fun `builds request with custom pageSize`() {
        val req = buildLocalSearchRequest("cats", "simple", "", "", emptyList(), pageSize = 25)
        assertEquals(25, req.pageSize)
    }

    @Test
    fun `builds request with empty filters`() {
        val req = buildLocalSearchRequest("cats", "simple", "", "", emptyList())
        assertTrue(req.filters.types.isEmpty())
        assertEquals("", req.filters.pathPrefix)
        assertFalse(req.filters.titleOnly)
    }

    // ── fileTypeIcon ─────────────────────────────────────────────────────────

    @Test
    fun `fileTypeIcon maps FOLDER to FOLDER`() {
        assertEquals(LocalFileIcon.FOLDER, fileTypeIcon(FileType.FOLDER))
    }

    @Test
    fun `fileTypeIcon maps IMAGE to IMAGE`() {
        assertEquals(LocalFileIcon.IMAGE, fileTypeIcon(FileType.IMAGE))
    }

    @Test
    fun `fileTypeIcon maps VIDEO to VIDEO`() {
        assertEquals(LocalFileIcon.VIDEO, fileTypeIcon(FileType.VIDEO))
    }

    @Test
    fun `fileTypeIcon maps AUDIO to AUDIO`() {
        assertEquals(LocalFileIcon.AUDIO, fileTypeIcon(FileType.AUDIO))
    }

    @Test
    fun `fileTypeIcon maps ARCHIVE to ARCHIVE`() {
        assertEquals(LocalFileIcon.ARCHIVE, fileTypeIcon(FileType.ARCHIVE))
    }

    @Test
    fun `fileTypeIcon maps CODE to CODE`() {
        assertEquals(LocalFileIcon.CODE, fileTypeIcon(FileType.CODE))
    }

    @Test
    fun `fileTypeIcon maps DOCUMENT to DOCUMENT`() {
        assertEquals(LocalFileIcon.DOCUMENT, fileTypeIcon(FileType.DOCUMENT))
    }

    @Test
    fun `fileTypeIcon maps OTHER to OTHER`() {
        assertEquals(LocalFileIcon.OTHER, fileTypeIcon(FileType.OTHER))
    }

    @Test
    fun `fileTypeIcon covers every FileType variant`() {
        // Regression guard: if a new FileType is added without updating fileTypeIcon, this
        // exhaustiveness check detects it.
        for (type in FileType.entries) {
            val icon = fileTypeIcon(type)
            // Just verifying it returns a non-null value without throwing.
            @Suppress("SENSELESS_COMPARISON")
            assertTrue(icon != null, "fileTypeIcon returned null for $type")
        }
    }
}
