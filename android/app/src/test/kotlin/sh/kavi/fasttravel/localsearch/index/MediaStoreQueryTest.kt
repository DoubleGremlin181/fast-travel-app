package sh.kavi.fasttravel.localsearch.index

import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import sh.kavi.fasttravel.localsearch.query.QueryMode
import sh.kavi.fasttravel.localsearch.query.parse

/**
 * Tests for [buildSelection] (pure, no android.* runtime calls) and
 * [requiredPermissions] (pure).
 *
 * Column names in assertions are the literal string values of MediaStore.MediaColumns
 * constants (e.g. "_display_name", "_data") — inlined at compile time.
 */
class MediaStoreQueryTest {

    // ── buildSelection ───────────────────────────────────────────────────────────

    @Test
    fun `buildSelection simpleTerm`() {
        val node = parse("invoice", QueryMode.SIMPLE)
        val sel = buildSelection(node, QueryMode.SIMPLE)
        assertEquals(
            "(_display_name LIKE ? OR _data LIKE ?)",
            sel.selection,
        )
        assertArrayEquals(
            arrayOf("%invoice%", "%invoice%"),
            sel.selectionArgs,
        )
    }

    @Test
    fun `buildSelection multiTermAND picks longest seed`() {
        // "invoice pdf" → AND{invoice(7), pdf(3)}; seed = "invoice"
        val node = parse("invoice pdf", QueryMode.SIMPLE)
        val sel = buildSelection(node, QueryMode.SIMPLE)
        assertEquals(
            "(_display_name LIKE ? OR _data LIKE ?)",
            sel.selection,
        )
        assertArrayEquals(
            arrayOf("%invoice%", "%invoice%"),
            sel.selectionArgs,
        )
    }

    @Test
    fun `buildSelection OR two branches`() {
        val node = parse("invoice | receipt", QueryMode.SIMPLE)
        val sel = buildSelection(node, QueryMode.SIMPLE)
        assertEquals(
            "(_display_name LIKE ? OR _data LIKE ?) OR (_display_name LIKE ? OR _data LIKE ?)",
            sel.selection,
        )
        assertArrayEquals(
            arrayOf("%invoice%", "%invoice%", "%receipt%", "%receipt%"),
            sel.selectionArgs,
        )
    }

    @Test
    fun `buildSelection wildcard splits on star`() {
        // "inv*.pdf" → positiveSeed splits on '*' → [inv, .pdf] → longest=".pdf"
        val node = parse("inv*.pdf", QueryMode.WILDCARD)
        val sel = buildSelection(node, QueryMode.WILDCARD)
        assertEquals(
            "(_display_name LIKE ? OR _data LIKE ?)",
            sel.selection,
        )
        assertArrayEquals(
            arrayOf("%.pdf%", "%.pdf%"),
            sel.selectionArgs,
        )
    }

    @Test
    fun `buildSelection pathScope uses same recall-safe selection`() {
        // "path:Finance" — seed "Finance" is extracted from the path-scoped term.
        // Both columns are OR'd; the pipeline's matcher enforces path-only precision.
        val node = parse("path:Finance", QueryMode.SIMPLE)
        val sel = buildSelection(node, QueryMode.SIMPLE)
        assertEquals(
            "(_display_name LIKE ? OR _data LIKE ?)",
            sel.selection,
        )
        assertArrayEquals(
            arrayOf("%Finance%", "%Finance%"),
            sel.selectionArgs,
        )
    }

    @Test
    fun `buildSelection regex seedBased`() {
        // regex mode: seeds from regexSeeds("foo|bar") = ["foo", "bar"] → DISPLAY_NAME only
        val node = parse("foo|bar", QueryMode.REGEX)
        val sel = buildSelection(node, QueryMode.REGEX)
        assertEquals(
            "_display_name LIKE ? OR _display_name LIKE ?",
            sel.selection,
        )
        assertArrayEquals(
            arrayOf("%foo%", "%bar%"),
            sel.selectionArgs,
        )
    }

    @Test
    fun `buildSelection regex broad returns null selection`() {
        // ^.*$ → regexSeeds → broad=true → no filter (null selection)
        val node = parse("^.*\$", QueryMode.REGEX)
        val sel = buildSelection(node, QueryMode.REGEX)
        assertNull(sel.selection, "broad regex should produce null selection")
        assertNull(sel.selectionArgs, "broad regex should produce null selectionArgs")
    }

    @Test
    fun `buildSelection pureNegation returns null selection`() {
        // "-foo" → NOT{term:foo} → positiveSeed=false → no branches → null
        val node = parse("-foo", QueryMode.SIMPLE)
        val sel = buildSelection(node, QueryMode.SIMPLE)
        assertNull(sel.selection, "pure negation should produce null selection")
        assertNull(sel.selectionArgs, "pure negation should produce null selectionArgs")
    }

    // ── requiredPermissions ──────────────────────────────────────────────────────

    @Test
    fun `requiredPermissions api33 returns scoped media perms`() {
        val perms = requiredPermissions(33)
        assertEquals(3, perms.size)
        assertEquals("android.permission.READ_MEDIA_IMAGES", perms[0])
        assertEquals("android.permission.READ_MEDIA_VIDEO", perms[1])
        assertEquals("android.permission.READ_MEDIA_AUDIO", perms[2])
    }

    @Test
    fun `requiredPermissions api30 returns legacy storage perm`() {
        val perms = requiredPermissions(30)
        assertEquals(1, perms.size)
        assertEquals("android.permission.READ_EXTERNAL_STORAGE", perms[0])
    }

    @Test
    fun `requiredPermissions api32 boundary returns legacy storage perm`() {
        val perms = requiredPermissions(32)
        assertEquals(1, perms.size)
        assertEquals("android.permission.READ_EXTERNAL_STORAGE", perms[0])
    }
}
