package sh.kavi.fasttravel.ui

import android.app.Application
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import sh.kavi.fasttravel.data.ConfigRefreshInterval
import sh.kavi.fasttravel.data.EditableConfigStore
import sh.kavi.fasttravel.data.SearchHistory
import sh.kavi.fasttravel.data.ThemePreferences

/**
 * Regression test for the "previous query flashes on relaunch" bug.
 *
 * The query/suggestions live in a retained (activity-scoped) [SearchViewModel] and
 * survive backgrounding (launcher `singleTask`). [SearchViewModel.resetForFreshStart]
 * is what the Activity calls on `onStop()` so the next resume starts clean instead of
 * flashing the previous query + its stale Google suggestions.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class)
class SearchViewModelResetTest {

    private val app: Application = ApplicationProvider.getApplicationContext()
    private val scheduler = TestCoroutineScheduler()

    @Before
    fun setUp() {
        Dispatchers.setMain(StandardTestDispatcher(scheduler))

        val themePrefs = ThemePreferences(app)
        themePrefs.configSourceDirty = false
        themePrefs.configRefreshInterval = ConfigRefreshInterval.MANUAL // cache never expires
        themePrefs.configUrl = "no-protocol-url" // never hit the network
        EditableConfigStore(app).clearLocalConfig()

        val configJson = app.assets.open("default-config.json")
            .bufferedReader().use { it.readText() }
        app.getSharedPreferences("fast_travel_config", Context.MODE_PRIVATE)
            .edit()
            .putString("cached_config_json", configJson)
            .putLong("cache_timestamp", 1_000_000L)
            .apply()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `resetForFreshStart clears the query and restores the Recent list`() {
        // A prior search sits in history so "Recent" has content to restore to.
        SearchHistory(app).addEntry("weather", null)

        val vm = SearchViewModel(app)
        scheduler.advanceUntilIdle() // let init load the cached config

        // User was mid-search before backgrounding.
        vm.onQueryChanged("doordash")
        scheduler.advanceUntilIdle()
        assertEquals("precondition: the query is dirty", "doordash", vm.query.value)

        // Act: the Activity's onStop() calls this.
        vm.resetForFreshStart()

        assertEquals("query must be cleared", "", vm.query.value)
        assertTrue("installed-app results must be cleared", vm.installedApps.value.isEmpty())
        // Suggestions are restored to the Recent list synchronously (no debounce).
        assertTrue(
            "suggestions must be the Recent history list",
            vm.suggestions.value.any { it.text == "weather" && it.isHistory },
        )
    }
}
