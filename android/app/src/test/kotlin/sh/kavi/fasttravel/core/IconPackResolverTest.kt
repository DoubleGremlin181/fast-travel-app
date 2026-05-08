package sh.kavi.fasttravel.core

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * Unit tests for [IconPackResolver.invalidate].
 *
 * All three cached fields (cachedPackPkg, cachedPackLookupDone, componentMaps)
 * must be reset to their initial values so that the next call to
 * getActivePackPackage re-queries the PackageManager rather than returning a
 * stale result.  This matters for package install/remove/change events —
 * the bug (#18) was that the BroadcastReceiver in FastTravelApplication called
 * InstalledAppResolver.invalidate() but omitted IconPackResolver.invalidate(),
 * so icon pack changes were invisible until the process was killed.
 */
class IconPackResolverTest {

    /** Read a private field from the IconPackResolver singleton via reflection. */
    private fun getField(name: String): Any? {
        val field = IconPackResolver::class.java.getDeclaredField(name)
        field.isAccessible = true
        // Kotlin object singletons are accessed via the INSTANCE field.
        return field.get(IconPackResolver)
    }

    @Test
    fun `invalidate resets cachedPackLookupDone to false`() {
        // Force the flag to true by writing it directly via reflection.
        val field = IconPackResolver::class.java.getDeclaredField("cachedPackLookupDone")
        field.isAccessible = true
        field.set(IconPackResolver, true)

        IconPackResolver.invalidate()

        assertFalse(getField("cachedPackLookupDone") as Boolean,
            "cachedPackLookupDone must be false after invalidate()")
    }

    @Test
    fun `invalidate clears cachedPackPkg`() {
        val field = IconPackResolver::class.java.getDeclaredField("cachedPackPkg")
        field.isAccessible = true
        field.set(IconPackResolver, "com.example.iconpack")

        IconPackResolver.invalidate()

        assertNull(getField("cachedPackPkg"),
            "cachedPackPkg must be null after invalidate()")
    }

    @Test
    fun `invalidate clears componentMaps`() {
        val field = IconPackResolver::class.java.getDeclaredField("componentMaps")
        field.isAccessible = true
        field.set(IconPackResolver, mapOf("com.example.iconpack" to mapOf("ComponentInfo{a/b}" to "icon_a")))

        IconPackResolver.invalidate()

        @Suppress("UNCHECKED_CAST")
        val maps = getField("componentMaps") as Map<String, Map<String, String>>
        assertEquals(emptyMap<String, Map<String, String>>(), maps,
            "componentMaps must be empty after invalidate()")
    }

    @Test
    fun `invalidate is idempotent — calling it twice leaves state clean`() {
        IconPackResolver.invalidate()
        IconPackResolver.invalidate()

        assertFalse(getField("cachedPackLookupDone") as Boolean)
        assertNull(getField("cachedPackPkg"))
        @Suppress("UNCHECKED_CAST")
        assertEquals(emptyMap<String, Map<String, String>>(),
            getField("componentMaps") as Map<String, Map<String, String>>)
    }
}
