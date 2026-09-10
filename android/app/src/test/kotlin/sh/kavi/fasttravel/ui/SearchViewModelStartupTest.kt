package sh.kavi.fasttravel.ui

import android.app.Application
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
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
 * Startup-path regression tests for the intermittent launch stutter.
 *
 * The ViewModel's init used to run the config parse, history parse and installed-app
 * resolution synchronously on Main — and, when the daily config cache had expired,
 * only after a blocking network fetch. It now serves whatever cache exists
 * immediately (even an expired one), derives UI state off Main, and refreshes in
 * the background. These tests pin the observable half of that: an expired cache and
 * an unreachable remote must still yield a fully populated, searchable ViewModel.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class)
class SearchViewModelStartupTest {

    private val app: Application = ApplicationProvider.getApplicationContext()
    private val scheduler = TestCoroutineScheduler()
    private val dispatcher = StandardTestDispatcher(scheduler)

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        val themePrefs = ThemePreferences(app)
        themePrefs.configSourceDirty = false
        themePrefs.configRefreshInterval = ConfigRefreshInterval.DAILY
        themePrefs.configUrl = "no-protocol-url" // the background refresh fails fast
        EditableConfigStore(app).clearLocalConfig()

        // Cache the bundled config stamped two days ago: expired under DAILY.
        val configJson = app.assets.open("default-config.json")
            .bufferedReader().use { it.readText() }
        app.getSharedPreferences("fast_travel_config", Context.MODE_PRIVATE)
            .edit()
            .putString("cached_config_json", configJson)
            .putLong("cache_timestamp", System.currentTimeMillis() - 2L * 24 * 60 * 60 * 1000)
            .apply()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `an expired cache still populates chips, Recent and search on launch`() {
        SearchHistory(app).addEntry("weather", null)

        val vm = SearchViewModel(app, io = dispatcher, work = dispatcher)
        assertTrue("nothing is derived synchronously in the constructor", vm.chipItems.value.isEmpty())

        scheduler.advanceUntilIdle() // init: assets -> stale config -> derived state -> failed refresh

        assertTrue("shortcut chips come from the (expired) cached config", vm.chipItems.value.isNotEmpty())
        assertTrue(
            "the Recent list is populated without a keystroke",
            vm.suggestions.value.any { it.text == "weather" && it.isHistory },
        )

        // The config is live: a plain query routes through the default command.
        vm.onSearch("cat pics")
        val state = vm.searchState.value
        assertTrue("expected Navigate, got $state", state is SearchState.Navigate)
        assertTrue((state as SearchState.Navigate).url.contains("cat"))
        vm.onNavigationHandled()
        assertEquals(SearchState.Idle, vm.searchState.value)
    }
}
