package sh.kavi.fasttravel.data

import android.app.Application
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import sh.kavi.fasttravel.core.ConfigParser
import sh.kavi.fasttravel.core.ConfigWriter

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class)
class ConfigRepositoryTest {

    private val context: Context = ApplicationProvider.getApplicationContext()

    /** Save a copy of the bundled config with group[0] renamed to [marker] as the local edit. */
    private fun saveMarkerLocalConfig(marker: String) {
        val json = context.assets.open("default-config.json").bufferedReader().use { it.readText() }
        val base = ConfigParser.parseConfig(json)
        val marked = base.copy(
            groups = listOf(base.groups[0].copy(name = marker)) + base.groups.drop(1),
        )
        EditableConfigStore(context).saveLocalConfig(marked)
    }

    @Test
    fun `editable config wins when the user has local edits (dirty)`() = runBlocking {
        saveMarkerLocalConfig("LOCAL_MARKER")
        ThemePreferences(context).configSourceDirty = true

        val result = ConfigRepository(context).getConfig()

        assertEquals("LOCAL_MARKER", result.groups[0].name)
    }

    @Test
    fun `adoptRemoteConfig caches the config and clears any local snapshot`() = runBlocking {
        saveMarkerLocalConfig("OLD_LOCAL") // a stale snapshot exists
        val prefs = ThemePreferences(context)
        prefs.configSourceDirty = false
        prefs.configUrl = "no-protocol-url" // ensure getConfig never reaches the network
        val repo = ConfigRepository(context)

        val json = context.assets.open("default-config.json").bufferedReader().use { it.readText() }
        val base = ConfigParser.parseConfig(json)
        val fresh = base.copy(
            groups = listOf(base.groups[0].copy(name = "FRESH_REMOTE")) + base.groups.drop(1),
        )
        repo.adoptRemoteConfig(fresh)

        assertEquals(false, EditableConfigStore(context).hasLocalConfig())
        assertEquals("FRESH_REMOTE", repo.getConfig().groups[0].name)
    }

    @Test
    fun `a non-dirty editable snapshot does not shadow the remote (frozen-config bug)`() = runBlocking {
        // A snapshot left by "Fetch & Import" / "Reset to remote" has dirty=false.
        saveMarkerLocalConfig("LOCAL_MARKER")
        val prefs = ThemePreferences(context)
        prefs.configSourceDirty = false
        prefs.configUrl = "no-protocol-url" // remote fetch fails fast -> bundled fallback

        val result = ConfigRepository(context).getConfig()

        assertNotEquals("LOCAL_MARKER", result.groups[0].name)
    }

    /** Cache a copy of the bundled config with group[0] renamed to [marker], stamped [ageMs] old. */
    private fun cacheMarkerRemoteConfig(marker: String, ageMs: Long) {
        val json = context.assets.open("default-config.json").bufferedReader().use { it.readText() }
        val base = ConfigParser.parseConfig(json)
        val marked = base.copy(
            groups = listOf(base.groups[0].copy(name = marker)) + base.groups.drop(1),
        )
        context.getSharedPreferences("fast_travel_config", Context.MODE_PRIVATE)
            .edit()
            .putString("cached_config_json", ConfigWriter.writeConfig(marked))
            .putLong("cache_timestamp", System.currentTimeMillis() - ageMs)
            .apply()
    }

    private val twoDaysMs = 2L * 24 * 60 * 60 * 1000

    @Test
    fun `an expired cache is served when the remote refresh fails`() = runBlocking {
        val prefs = ThemePreferences(context)
        prefs.configSourceDirty = false
        prefs.configRefreshInterval = ConfigRefreshInterval.DAILY
        prefs.configUrl = "no-protocol-url" // remote fetch fails fast
        cacheMarkerRemoteConfig("STALE_REMOTE", ageMs = twoDaysMs)
        val repo = ConfigRepository(context)

        // The last known-good remote beats the bundled default when offline …
        assertEquals("STALE_REMOTE", repo.getConfig().groups[0].name)
        // … and allowStale serves it without even attempting the network.
        assertEquals("STALE_REMOTE", repo.getConfig(allowStale = true).groups[0].name)
        // A failed refresh leaves the cache untouched.
        assertEquals(null, repo.refreshRemote())
        assertEquals("STALE_REMOTE", repo.getConfig(allowStale = true).groups[0].name)
    }

    @Test
    fun `needsRemoteRefresh is true only for an expired cache on the remote source`() {
        val prefs = ThemePreferences(context)
        prefs.configSourceDirty = false
        prefs.configRefreshInterval = ConfigRefreshInterval.DAILY
        prefs.configUrl = "no-protocol-url"
        val repo = ConfigRepository(context)

        assertFalse("no cache: getConfig already fetched", repo.needsRemoteRefresh())

        cacheMarkerRemoteConfig("FRESH", ageMs = 0L)
        assertFalse("fresh cache", repo.needsRemoteRefresh())

        cacheMarkerRemoteConfig("STALE", ageMs = twoDaysMs)
        assertTrue("expired cache", repo.needsRemoteRefresh())

        prefs.configRefreshInterval = ConfigRefreshInterval.MANUAL
        assertFalse("manual mode never expires", repo.needsRemoteRefresh())

        prefs.configRefreshInterval = ConfigRefreshInterval.DAILY
        prefs.configSourceDirty = true
        assertFalse("local edits win, nothing to refresh", repo.needsRemoteRefresh())
    }
}
