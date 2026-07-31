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
import org.json.JSONObject
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
import sh.kavi.fasttravel.data.ThemePreferences

/**
 * Regression tests for [SearchViewModel.onLuckySearch] (Ctrl+Enter "I'm feeling lucky"
 * on a hardware keyboard). Mirrors handleLuckySearch in the extension's newtab.ts:
 * substitutes {query} into the top-level defaultLuckyUrl and navigates directly,
 * falling back to a normal search when the config has no defaultLuckyUrl.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class)
class SearchViewModelLuckyTest {

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
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    /** Caches [configJson] as the config the ViewModel loads on init. */
    private fun cacheConfig(configJson: String) {
        app.getSharedPreferences("fast_travel_config", Context.MODE_PRIVATE)
            .edit()
            .putString("cached_config_json", configJson)
            .putLong("cache_timestamp", 1_000_000L)
            .apply()
    }

    private fun defaultConfigJson(): JSONObject =
        JSONObject(
            app.assets.open("default-config.json").bufferedReader().use { it.readText() },
        )

    @Test
    fun `navigates to the substituted lucky URL when defaultLuckyUrl is present`() {
        // default-config.json ships defaultLuckyUrl = "https://www.google.com/search?q={query}&btnI".
        cacheConfig(defaultConfigJson().toString())

        val vm = SearchViewModel(app)
        scheduler.advanceUntilIdle() // let init load the cached config

        vm.onLuckySearch("cat pics")

        val state = vm.searchState.value
        assertTrue("expected a Navigate state, got $state", state is SearchState.Navigate)
        assertEquals(
            "https://www.google.com/search?q=cat%20pics&btnI",
            (state as SearchState.Navigate).url,
        )
    }

    @Test
    fun `falls back to a normal search when defaultLuckyUrl is absent`() {
        val configJson = defaultConfigJson().apply { remove("defaultLuckyUrl") }
        cacheConfig(configJson.toString())

        val vm = SearchViewModel(app)
        scheduler.advanceUntilIdle() // let init load the cached config

        // "scholr" is a detectable typo of the "scholar" trigger (per
        // SearchViewModelTypoIgnoreTest). buildLuckyUrl never produces a typo
        // suggestion — only onSearch's parseCommand does — so landing in
        // TypoSuggestion proves onLuckySearch fell through to a normal search
        // rather than coincidentally producing the same Navigate state.
        vm.onLuckySearch("scholr")

        assertTrue(
            "expected a fallback typo suggestion, got ${vm.searchState.value}",
            vm.searchState.value is SearchState.TypoSuggestion,
        )
    }
}
