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
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import sh.kavi.fasttravel.data.ConfigRefreshInterval
import sh.kavi.fasttravel.data.EditableConfigStore
import sh.kavi.fasttravel.data.LocalIgnoreStore
import sh.kavi.fasttravel.data.ThemePreferences

/**
 * Regression tests for the Android typo-ignore behaviour.
 *
 * The user's permanent ignores live in a device-local store ([LocalIgnoreStore]),
 * NOT in the config document — so ignoring a typo must (1) stick, (2) NOT dirty
 * the config / pause remote auto-refresh, and (3) stop the typo from prompting.
 * Auto-ignore tracking is a separate device-local mechanism and is covered too.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class)
class SearchViewModelTypoIgnoreTest {

    private val app: Application = ApplicationProvider.getApplicationContext()
    private val scheduler = TestCoroutineScheduler()

    @Before
    fun setUp() {
        Dispatchers.setMain(StandardTestDispatcher(scheduler))

        // The user is on the REMOTE config (not dirty) with a fresh cache that
        // contains the "scholar" command, so "scholr" is a detectable typo.
        val themePrefs = ThemePreferences(app)
        themePrefs.configSourceDirty = false
        themePrefs.configRefreshInterval = ConfigRefreshInterval.MANUAL // cache never expires
        themePrefs.configUrl = "no-protocol-url" // belt-and-suspenders: never hit the network
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
    fun `ignoring a typo persists it device-locally without dirtying the config`() {
        val vm = SearchViewModel(app)
        scheduler.advanceUntilIdle() // let init load the cached config

        // Precondition: the typo card appears (detection works).
        vm.onSearch("scholr")
        assertTrue(
            "expected a typo suggestion for 'scholr'",
            vm.searchState.value is SearchState.TypoSuggestion,
        )

        // Act: user taps "Add to ignore list".
        vm.ignoreTypo()
        scheduler.advanceUntilIdle()

        // Persisted to the DEVICE-LOCAL store…
        assertTrue(
            "ignored typo 'scholr' must be in the device-local ignore store",
            LocalIgnoreStore(app).contains("scholr"),
        )
        // …and the config was NOT dirtied, so remote auto-refresh is not paused.
        assertFalse(
            "ignoring a typo must NOT dirty the config",
            ThemePreferences(app).configSourceDirty,
        )
        // …and it no longer prompts on a fresh search.
        vm.onSearch("scholr")
        assertTrue(
            "after ignoring, 'scholr' must no longer prompt",
            vm.searchState.value is SearchState.Navigate,
        )
    }

    @Test
    fun `declining a typo to the threshold auto-ignores it`() {
        val vm = SearchViewModel(app)
        scheduler.advanceUntilIdle() // let init load the cached config

        val threshold = ThemePreferences(app).autoIgnoreThreshold // default 3

        // Decline ("Use as search") the same typo `threshold` times. Each decline
        // bumps the auto-ignore candidate counter (device-local, separate from the
        // permanent ignore list).
        repeat(threshold) { i ->
            vm.onSearch("scholr")
            assertTrue(
                "still expected a typo prompt on dismissal ${i + 1} (below threshold)",
                vm.searchState.value is SearchState.TypoSuggestion,
            )
            vm.fallbackSearchAfterTypo()
        }

        // The candidate count has reached the threshold, so effectiveIgnoreList now
        // treats 'scholr' as ignored: the next search must not prompt.
        vm.onSearch("scholr")
        assertTrue(
            "after $threshold dismissals 'scholr' must be auto-ignored (no typo prompt)",
            vm.searchState.value is SearchState.Navigate,
        )
    }
}
