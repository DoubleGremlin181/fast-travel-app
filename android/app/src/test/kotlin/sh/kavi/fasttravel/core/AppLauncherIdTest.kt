package sh.kavi.fasttravel.core

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Installed apps are stored in history under a namespaced pseudo-command id so they
 * can be ranked alongside real commands by [Frecency]. These helpers must round-trip
 * a (package, activity) pair through that id format unambiguously.
 */
class AppLauncherIdTest {

    @Test
    fun `installedAppId builds the app prefixed id`() {
        assertEquals(
            "app:com.google.android.apps.maps/com.google.android.maps.MapsActivity",
            installedAppId(
                "com.google.android.apps.maps",
                "com.google.android.maps.MapsActivity",
            ),
        )
    }

    @Test
    fun `isInstalledAppId distinguishes app ids from command ids and null`() {
        assertTrue(isInstalledAppId("app:com.foo/com.foo.Main"))
        assertFalse(isInstalledAppId("google"))
        assertFalse(isInstalledAppId(null))
    }

    @Test
    fun `parseInstalledAppId round-trips a package and activity`() {
        val pkg = "com.foo.bar"
        val activity = "com.foo.bar.MainActivity"
        val parsed = parseInstalledAppId(installedAppId(pkg, activity))
        assertEquals(pkg to activity, parsed)
    }

    @Test
    fun `parseInstalledAppId keeps inner-class activity names intact`() {
        // Activity names can contain '$' for inner classes; only the first '/'
        // separates package from activity.
        val parsed = parseInstalledAppId("app:com.foo/com.foo.Outer\$Inner")
        assertEquals("com.foo" to "com.foo.Outer\$Inner", parsed)
    }

    @Test
    fun `parseInstalledAppId returns null for a non-app id`() {
        assertNull(parseInstalledAppId("google"))
    }
}
