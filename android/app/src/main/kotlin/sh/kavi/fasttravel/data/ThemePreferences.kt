package sh.kavi.fasttravel.data

import android.content.Context
import android.content.SharedPreferences
import sh.kavi.fasttravel.ui.appearance.AppearanceMode
import sh.kavi.fasttravel.ui.appearance.AppearanceShape
import sh.kavi.fasttravel.ui.appearance.AppearanceVariant

enum class ConfigRefreshInterval(val displayName: String, val hours: Long?) {
    DAILY("Daily", 24L),
    WEEKLY("Weekly", 24L * 7L),
    MANUAL("Manual only", null);

    companion object {
        fun fromName(name: String?): ConfigRefreshInterval =
            entries.firstOrNull { it.name == name } ?: DAILY
    }
}

class ThemePreferences(private val prefs: SharedPreferences) {

    constructor(context: Context) : this(
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    )

    companion object {
        private const val PREFS_NAME = "fast_travel_theme"
        private const val KEY_APPEARANCE_MODE = "appearance_mode"
        private const val KEY_APPEARANCE_VARIANT = "appearance_variant"
        private const val KEY_APPEARANCE_SHAPE = "appearance_shape"
        private const val KEY_WIDGET_OPACITY = "widget_opacity"
        private const val KEY_CONFIG_URL = "config_url"
        private const val KEY_CONFIG_REFRESH_INTERVAL = "config_refresh_interval"
        private const val KEY_SHORTCUT_ROWS = "shortcut_rows"
        private const val KEY_AUTO_IGNORE_THRESHOLD = "auto_ignore_threshold"
        private const val KEY_CONFIG_SOURCE_DIRTY = "config_source_dirty"
        const val KEY_INSTALLED_APPS_ENABLED = "installed_apps_enabled"
        const val KEY_LOCAL_SEARCH_ENABLED = "local_search_enabled"
        private const val KEY_LOCAL_SEARCH_QUERY_MODE = "local_search_query_mode"
        private const val KEY_LOCAL_SEARCH_SORT_FIELD = "local_search_sort_field"
        private const val KEY_LOCAL_SEARCH_SORT_DIR = "local_search_sort_dir"
        private const val KEY_RECENTLY_OPENED = "local_search_recently_opened"
        private const val RECENTLY_OPENED_MAX = 50
        const val DEFAULT_AUTO_IGNORE_THRESHOLD = 3
        const val AUTO_IGNORE_THRESHOLD_MIN = 1
        const val AUTO_IGNORE_THRESHOLD_MAX = 20

        const val DEFAULT_CONFIG_URL =
            "https://raw.githubusercontent.com/DoubleGremlin181/fast-travel-app/main/shared/config/default-config.json"
    }

    fun registerListener(listener: SharedPreferences.OnSharedPreferenceChangeListener) {
        prefs.registerOnSharedPreferenceChangeListener(listener)
    }

    fun unregisterListener(listener: SharedPreferences.OnSharedPreferenceChangeListener) {
        prefs.unregisterOnSharedPreferenceChangeListener(listener)
    }

    var mode: AppearanceMode
        get() = AppearanceMode.fromName(prefs.getString(KEY_APPEARANCE_MODE, null))
        set(value) {
            prefs.edit().putString(KEY_APPEARANCE_MODE, value.name).apply()
        }

    var variant: AppearanceVariant
        get() = AppearanceVariant.fromName(prefs.getString(KEY_APPEARANCE_VARIANT, null))
        set(value) {
            prefs.edit().putString(KEY_APPEARANCE_VARIANT, value.name).apply()
        }

    var shape: AppearanceShape
        get() = AppearanceShape.fromName(prefs.getString(KEY_APPEARANCE_SHAPE, null))
        set(value) {
            prefs.edit().putString(KEY_APPEARANCE_SHAPE, value.name).apply()
        }

    var widgetOpacity: Int
        get() = prefs.getInt(KEY_WIDGET_OPACITY, 100)
        set(value) {
            prefs.edit().putInt(KEY_WIDGET_OPACITY, value.coerceIn(0, 100)).apply()
        }

    var configUrl: String
        get() = prefs.getString(KEY_CONFIG_URL, DEFAULT_CONFIG_URL) ?: DEFAULT_CONFIG_URL
        set(value) {
            prefs.edit().putString(KEY_CONFIG_URL, value).apply()
        }

    var configRefreshInterval: ConfigRefreshInterval
        get() = ConfigRefreshInterval.fromName(prefs.getString(KEY_CONFIG_REFRESH_INTERVAL, null))
        set(value) {
            prefs.edit().putString(KEY_CONFIG_REFRESH_INTERVAL, value.name).apply()
        }

    var configSourceDirty: Boolean
        get() = prefs.getBoolean(KEY_CONFIG_SOURCE_DIRTY, false)
        set(value) { prefs.edit().putBoolean(KEY_CONFIG_SOURCE_DIRTY, value).apply() }

    /** When on (default), installed apps are launchable from the search results row,
     *  appear in "Recent" history, and rank into the empty-input shortcut chips. */
    var installedAppsEnabled: Boolean
        get() = prefs.getBoolean(KEY_INSTALLED_APPS_ENABLED, true)
        set(value) { prefs.edit().putBoolean(KEY_INSTALLED_APPS_ENABLED, value).apply() }

    /** When on, the 's' keyword intercepts searches for on-device file search. Off by default. */
    var localSearchEnabled: Boolean
        get() = prefs.getBoolean(KEY_LOCAL_SEARCH_ENABLED, false)
        set(value) { prefs.edit().putBoolean(KEY_LOCAL_SEARCH_ENABLED, value).apply() }

    /** Default query mode for local file search. One of "simple", "wildcard", "regex". */
    var localSearchQueryMode: String
        get() = prefs.getString(KEY_LOCAL_SEARCH_QUERY_MODE, "simple") ?: "simple"
        set(value) { prefs.edit().putString(KEY_LOCAL_SEARCH_QUERY_MODE, value).apply() }

    /** Default sort field for local file search. Empty string defaults to "relevance" in the pipeline. */
    var localSearchSortField: String
        get() = prefs.getString(KEY_LOCAL_SEARCH_SORT_FIELD, "") ?: ""
        set(value) { prefs.edit().putString(KEY_LOCAL_SEARCH_SORT_FIELD, value).apply() }

    /** Default sort direction for local file search. Empty string defaults to "desc" in the pipeline. */
    var localSearchSortDir: String
        get() = prefs.getString(KEY_LOCAL_SEARCH_SORT_DIR, "") ?: ""
        set(value) { prefs.edit().putString(KEY_LOCAL_SEARCH_SORT_DIR, value).apply() }

    /**
     * Ordered list of recently-opened local-file ids (paths), most-recent first.
     * Capped at [RECENTLY_OPENED_MAX]. Used as the `history` param in [SearchRequest]
     * to boost recently-opened files in scoring.
     */
    val recentlyOpened: List<String>
        get() {
            val json = prefs.getString(KEY_RECENTLY_OPENED, null) ?: return emptyList()
            return try {
                val arr = org.json.JSONArray(json)
                (0 until arr.length()).map { arr.getString(it) }
            } catch (_: Exception) { emptyList() }
        }

    /**
     * Records [id] as the most-recently-opened file. Deduplicates (moves to front on
     * re-open) and caps the list at [RECENTLY_OPENED_MAX].
     */
    fun addRecentlyOpened(id: String) {
        val current = recentlyOpened.toMutableList()
        current.remove(id)
        current.add(0, id)
        val trimmed = current.take(RECENTLY_OPENED_MAX)
        prefs.edit().putString(KEY_RECENTLY_OPENED, org.json.JSONArray(trimmed).toString()).apply()
    }

    var shortcutRows: Int
        get() = prefs.getInt(KEY_SHORTCUT_ROWS, 2)
        set(value) {
            prefs.edit().putInt(KEY_SHORTCUT_ROWS, value.coerceIn(1, 3)).apply()
        }

    /** How many "search as typed" dismissals of a typo suggestion trigger an
     * automatic add to the ignore list. 0 disables auto-ignore entirely. */
    var autoIgnoreThreshold: Int
        get() = prefs.getInt(KEY_AUTO_IGNORE_THRESHOLD, DEFAULT_AUTO_IGNORE_THRESHOLD)
        set(value) {
            prefs.edit()
                .putInt(KEY_AUTO_IGNORE_THRESHOLD, value.coerceIn(AUTO_IGNORE_THRESHOLD_MIN, AUTO_IGNORE_THRESHOLD_MAX))
                .apply()
        }
}
