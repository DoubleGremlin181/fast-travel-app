package sh.kavi.fasttravel.data

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import sh.kavi.fasttravel.core.ConfigParser
import sh.kavi.fasttravel.core.ConfigWriter
import sh.kavi.fasttravel.core.FastTravelConfig
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

class ConfigRepository(private val context: Context) {

    companion object {
        private const val TAG = "ConfigRepository"
        private const val PREFS_NAME = "fast_travel_config"
        private const val KEY_CACHED_CONFIG = "cached_config_json"
        private const val KEY_CACHE_TIMESTAMP = "cache_timestamp"
        private const val CONNECT_TIMEOUT_MS = 5000
        private const val READ_TIMEOUT_MS = 5000
    }

    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private val themePreferences = ThemePreferences(context)
    private val editableStore = EditableConfigStore(context)
    private val fetchMutex = Mutex()

    suspend fun getConfig(): FastTravelConfig {
        // Local edits (direct-edit model) win over any remote/bundled base — but
        // ONLY when the user actually has local edits (dirty). A non-dirty
        // editable snapshot (e.g. one left behind by "Fetch & Import" or
        // "Reset to remote") must NOT shadow the live remote, otherwise
        // auto-refresh silently freezes on that stale snapshot.
        if (themePreferences.configSourceDirty) {
            editableStore.getLocalConfig()
                ?.let { if (validate(it, "local")) return it }
        }

        // Cached remote (if fresh enough) — re-validate every load so a corrupt
        // entry doesn't survive forever.
        getCachedConfig()
            ?.let { if (validate(it, "cache")) return it }

        // Serialize remote fetches so concurrent callers don't double-fetch and
        // so the second writer can't overwrite a fresh response with a stale one.
        return fetchMutex.withLock {
            getCachedConfig()?.let { if (validate(it, "cache")) return@withLock it }
            fetchFromGitHub()
                ?.let { if (validate(it, "remote")) return@withLock it }
            loadBundledConfig()
        }
    }

    /** Run the validator and log; returns true if config is usable. */
    private fun validate(cfg: FastTravelConfig, source: String): Boolean {
        val errors = ConfigValidator.validate(cfg)
        if (errors.isEmpty()) return true
        Log.w(TAG, "Discarding $source config: ${errors.size} validation error(s); first: ${errors.first()}")
        return false
    }

    suspend fun fetchFromUrl(url: String): FastTravelConfig? = withContext(Dispatchers.IO) {
        try {
            val connection = URL(url).openConnection() as HttpURLConnection
            connection.connectTimeout = CONNECT_TIMEOUT_MS
            connection.readTimeout = READ_TIMEOUT_MS
            connection.requestMethod = "GET"
            val json = try {
                if (connection.responseCode == HttpURLConnection.HTTP_OK) {
                    connection.inputStream.bufferedReader().use { it.readText() }
                } else { null }
            } finally {
                connection.disconnect()
            }
            if (json != null) ConfigParser.safeParseConfig(json) else null
        } catch (_: Exception) { null }
    }

    suspend fun fetchFromGitHub(): FastTravelConfig? = withContext(Dispatchers.IO) {
        try {
            val url = URL(themePreferences.configUrl)
            val connection = url.openConnection() as HttpURLConnection
            connection.connectTimeout = CONNECT_TIMEOUT_MS
            connection.readTimeout = READ_TIMEOUT_MS
            connection.requestMethod = "GET"

            val json = try {
                if (connection.responseCode == HttpURLConnection.HTTP_OK) {
                    BufferedReader(InputStreamReader(connection.inputStream)).use { it.readText() }
                } else { null }
            } finally {
                connection.disconnect()
            }

            if (json != null) {
                val parsed = ConfigParser.safeParseConfig(json) ?: return@withContext null
                cacheConfig(json)
                parsed
            } else { null }
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Clears the locally-edited config, reverting getConfig() to cache/URL/bundled.
     */
    suspend fun resetToRemote(): FastTravelConfig {
        editableStore.clearLocalConfig()
        return getConfig()
    }

    /** Convenience for callers that want to know if the user has any local edits. */
    fun hasLocalEdits(): Boolean = editableStore.hasLocalConfig()

    /**
     * Adopt a freshly-fetched remote config as the new baseline: cache it so
     * [getConfig] serves it immediately and the periodic refresh keeps it
     * current, and drop any editable snapshot so it can't shadow the remote.
     * Used by URL import and reset-to-remote (which must NOT leave a non-dirty
     * editable snapshot — that is the "frozen config" bug).
     */
    fun adoptRemoteConfig(config: FastTravelConfig) {
        editableStore.clearLocalConfig()
        cacheConfig(ConfigWriter.writeConfig(config))
    }

    private fun getCachedConfig(): FastTravelConfig? {
        val json = prefs.getString(KEY_CACHED_CONFIG, null) ?: return null
        val timestamp = prefs.getLong(KEY_CACHE_TIMESTAMP, 0L)
        val interval = themePreferences.configRefreshInterval
        val maxAgeMs = interval.hours?.let { it * 60 * 60 * 1000L }

        // Manual refresh mode keeps cached config indefinitely.
        if (maxAgeMs != null) {
            val age = System.currentTimeMillis() - timestamp
            if (age > maxAgeMs) return null
        }

        return ConfigParser.safeParseConfig(json)
    }

    fun lastSyncedAt(): Long? {
        val ts = prefs.getLong(KEY_CACHE_TIMESTAMP, 0L)
        return if (ts == 0L) null else ts
    }

    private fun cacheConfig(json: String) {
        prefs.edit()
            .putString(KEY_CACHED_CONFIG, json)
            .putLong(KEY_CACHE_TIMESTAMP, System.currentTimeMillis())
            .apply()
    }

    private fun loadBundledConfig(): FastTravelConfig {
        val json = context.assets.open("default-config.json")
            .bufferedReader()
            .use { it.readText() }
        // The bundled config is generated from shared/config/ at build time so
        // we trust it to parse, but log validator errors to surface drift early.
        return ConfigParser.parseConfig(json).also { cfg ->
            val errors = ConfigValidator.validate(cfg)
            if (errors.isNotEmpty()) {
                Log.e(TAG, "Bundled config failed validation (${errors.size} errors); first: ${errors.first()}")
            }
        }
    }
}
