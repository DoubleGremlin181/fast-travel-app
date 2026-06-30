package sh.kavi.fasttravel.localsearch

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import sh.kavi.fasttravel.localsearch.index.DateRange
import sh.kavi.fasttravel.localsearch.index.FileType

/**
 * JUnit5 unit tests for the pure toolbar logic: datePresetToRange, toggleType,
 * hasMore/nextPage, and extended buildLocalSearchRequest.
 * All tests run on the JVM — no android.* dependencies.
 */
class LocalSearchToolbarTest {

    private val BASE_NOW = 1_750_000_000_000L // arbitrary fixed epoch ms

    // ── datePresetToRange ──────────────────────────────────────────────────────

    @Test
    fun `datePresetToRange any returns null`() {
        assertNull(datePresetToRange("any", BASE_NOW))
    }

    @Test
    fun `datePresetToRange week returns from = now minus 7 days in ms`() {
        val range = datePresetToRange("week", BASE_NOW)
        assertNotNull(range)
        assertEquals(BASE_NOW - 7L * 86_400_000L, range!!.from)
    }

    @Test
    fun `datePresetToRange month returns from = now minus 30 days in ms`() {
        val range = datePresetToRange("month", BASE_NOW)
        assertNotNull(range)
        assertEquals(BASE_NOW - 30L * 86_400_000L, range!!.from)
    }

    @Test
    fun `datePresetToRange year returns from = now minus 365 days in ms`() {
        val range = datePresetToRange("year", BASE_NOW)
        assertNotNull(range)
        assertEquals(BASE_NOW - 365L * 86_400_000L, range!!.from)
    }

    @Test
    fun `datePresetToRange unknown preset returns null`() {
        assertNull(datePresetToRange("decade", BASE_NOW))
    }

    @Test
    fun `datePresetToRange to is 0 meaning open upper bound`() {
        val range = datePresetToRange("week", BASE_NOW)
        assertNotNull(range)
        assertEquals(0L, range!!.to)
    }

    @Test
    fun `datePresetToRange week matches extension constant 7 DAY_MS`() {
        val DAY_MS = 86_400_000L
        val now = 2_000_000_000_000L
        assertEquals(now - 7L * DAY_MS, datePresetToRange("week", now)!!.from)
    }

    @Test
    fun `datePresetToRange month matches extension constant 30 DAY_MS`() {
        val DAY_MS = 86_400_000L
        val now = 2_000_000_000_000L
        assertEquals(now - 30L * DAY_MS, datePresetToRange("month", now)!!.from)
    }

    @Test
    fun `datePresetToRange year matches extension constant 365 DAY_MS`() {
        val DAY_MS = 86_400_000L
        val now = 2_000_000_000_000L
        assertEquals(now - 365L * DAY_MS, datePresetToRange("year", now)!!.from)
    }

    // ── toggleType ─────────────────────────────────────────────────────────────

    @Test
    fun `toggleType adds type when absent from empty list`() {
        assertEquals(listOf("image"), toggleType(emptyList(), "image"))
    }

    @Test
    fun `toggleType adds type when absent from non-empty list`() {
        assertEquals(listOf("image", "video"), toggleType(listOf("image"), "video"))
    }

    @Test
    fun `toggleType removes type when present`() {
        assertEquals(listOf("video"), toggleType(listOf("image", "video"), "image"))
    }

    @Test
    fun `toggleType removes last type yielding empty list`() {
        assertTrue(toggleType(listOf("audio"), "audio").isEmpty())
    }

    @Test
    fun `toggleType does not mutate the input list`() {
        val original = listOf("image")
        val result = toggleType(original, "video")
        assertEquals(listOf("image"), original) // original unchanged
        assertEquals(listOf("image", "video"), result)
    }

    @Test
    fun `toggleType removing middle element preserves order`() {
        val result = toggleType(listOf("doc", "image", "video"), "image")
        assertEquals(listOf("doc", "video"), result)
    }

    // ── hasMore ────────────────────────────────────────────────────────────────

    @Test
    fun `hasMore returns true when loaded is less than total`() {
        assertTrue(hasMore(10, 20))
    }

    @Test
    fun `hasMore returns false when loaded equals total`() {
        assertFalse(hasMore(20, 20))
    }

    @Test
    fun `hasMore returns false when loaded exceeds total`() {
        assertFalse(hasMore(25, 20))
    }

    @Test
    fun `hasMore returns false for zero total`() {
        assertFalse(hasMore(0, 0))
    }

    @Test
    fun `hasMore returns false when loaded is 1 and total is 1`() {
        assertFalse(hasMore(1, 1))
    }

    // ── nextPage ───────────────────────────────────────────────────────────────

    @Test
    fun `nextPage returns 1 for page 0`() {
        assertEquals(1, nextPage(0))
    }

    @Test
    fun `nextPage increments by one`() {
        assertEquals(5, nextPage(4))
        assertEquals(3, nextPage(2))
    }

    // ── extended buildLocalSearchRequest ───────────────────────────────────────

    @Test
    fun `buildLocalSearchRequest with types filter`() {
        val req = buildLocalSearchRequest(
            "cats", "simple", "", "", emptyList(),
            types = listOf(FileType.IMAGE, FileType.VIDEO),
        )
        assertEquals(listOf(FileType.IMAGE, FileType.VIDEO), req.filters.types)
    }

    @Test
    fun `buildLocalSearchRequest with modifiedRange filter`() {
        val range = DateRange(from = 1_000_000L, to = 0L)
        val req = buildLocalSearchRequest(
            "cats", "simple", "", "", emptyList(),
            modifiedRange = range,
        )
        assertEquals(range, req.filters.modifiedRange)
    }

    @Test
    fun `buildLocalSearchRequest with null modifiedRange leaves it null`() {
        val req = buildLocalSearchRequest(
            "cats", "simple", "", "", emptyList(),
            modifiedRange = null,
        )
        assertNull(req.filters.modifiedRange)
    }

    @Test
    fun `buildLocalSearchRequest with pathPrefix filter`() {
        val req = buildLocalSearchRequest(
            "cats", "simple", "", "", emptyList(),
            pathPrefix = "/storage/emulated/0",
        )
        assertEquals("/storage/emulated/0", req.filters.pathPrefix)
    }

    @Test
    fun `buildLocalSearchRequest with titleOnly filter`() {
        val req = buildLocalSearchRequest(
            "cats", "simple", "", "", emptyList(),
            titleOnly = true,
        )
        assertTrue(req.filters.titleOnly)
    }

    @Test
    fun `buildLocalSearchRequest with page parameter`() {
        val req = buildLocalSearchRequest(
            "cats", "simple", "", "", emptyList(),
            page = 2,
        )
        assertEquals(2, req.page)
    }

    @Test
    fun `buildLocalSearchRequest defaults have empty filters and page 0`() {
        val req = buildLocalSearchRequest("cats", "simple", "", "", emptyList())
        assertTrue(req.filters.types.isEmpty())
        assertNull(req.filters.modifiedRange)
        assertEquals("", req.filters.pathPrefix)
        assertFalse(req.filters.titleOnly)
        assertEquals(0, req.page)
    }

    @Test
    fun `buildLocalSearchRequest backward compat positional call without filter args`() {
        // Existing call-sites: buildLocalSearchRequest(q, mode, field, dir, history)
        val req = buildLocalSearchRequest("cats", "wildcard", "name", "asc", listOf("/path/a"))
        assertEquals("cats", req.query)
        assertEquals(sh.kavi.fasttravel.localsearch.query.QueryMode.WILDCARD, req.queryMode)
        assertEquals("name", req.sort.field)
        assertEquals("asc", req.sort.dir)
        assertEquals(listOf("/path/a"), req.history)
        // Defaults
        assertTrue(req.filters.types.isEmpty())
        assertEquals(0, req.page)
        assertEquals(50, req.pageSize)
    }

    @Test
    fun `buildLocalSearchRequest with custom pageSize still works`() {
        val req = buildLocalSearchRequest(
            "cats", "simple", "", "", emptyList(),
            pageSize = 25,
        )
        assertEquals(25, req.pageSize)
    }

    // ── caseSensitive / exactPhrase ────────────────────────────────────────────

    @Test
    fun `buildLocalSearchRequest carries caseSensitive flag`() {
        val req = buildLocalSearchRequest(
            "cats", "simple", "", "", emptyList(),
            caseSensitive = true,
        )
        assertTrue(req.caseSensitive)
    }

    @Test
    fun `buildLocalSearchRequest carries exactPhrase flag`() {
        val req = buildLocalSearchRequest(
            "cats", "simple", "", "", emptyList(),
            exactPhrase = true,
        )
        assertTrue(req.exactPhrase)
    }

    @Test
    fun `buildLocalSearchRequest defaults caseSensitive and exactPhrase to false`() {
        val req = buildLocalSearchRequest("cats", "simple", "", "", emptyList())
        assertFalse(req.caseSensitive)
        assertFalse(req.exactPhrase)
    }

    // ── Bug B: created sort remapped to relevance ──────────────────────────────

    @Test
    fun `buildLocalSearchRequest remaps created sort field to relevance (empty string)`() {
        val req = buildLocalSearchRequest("cats", "simple", "created", "", emptyList())
        assertEquals("", req.sort.field, "stored 'created' sort must be remapped to '' (relevance)")
    }

    @Test
    fun `buildLocalSearchRequest leaves modified sort field unchanged`() {
        val req = buildLocalSearchRequest("cats", "simple", "modified", "asc", emptyList())
        assertEquals("modified", req.sort.field)
    }

    @Test
    fun `buildLocalSearchRequest leaves relevance sort field unchanged`() {
        val req = buildLocalSearchRequest("cats", "simple", "", "desc", emptyList())
        assertEquals("", req.sort.field)
    }
}
