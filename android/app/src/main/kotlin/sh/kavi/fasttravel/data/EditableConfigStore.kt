package sh.kavi.fasttravel.data

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import sh.kavi.fasttravel.core.ConfigParser
import sh.kavi.fasttravel.core.ConfigWriter
import sh.kavi.fasttravel.core.FastTravelConfig

/**
 * Persists a single fully-edited config JSON document. Replaces the V2
 * override/merge model with direct edits.
 */
class EditableConfigStore(context: Context) {

    companion object {
        private const val PREFS_NAME = "fast_travel_local_config"
        private const val KEY_CONFIG_JSON = "config_json"
    }

    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun getLocalConfig(): FastTravelConfig? {
        val json = prefs.getString(KEY_CONFIG_JSON, null) ?: return null
        return ConfigParser.safeParseConfig(json)
    }

    /**
     * Fire-and-forget save; safe to call from Compose `onClick` lambdas. Uses
     * `apply()` so it returns immediately.
     */
    fun saveLocalConfig(config: FastTravelConfig) {
        val json = ConfigWriter.writeConfig(config)
        prefs.edit().putString(KEY_CONFIG_JSON, json).apply()
    }

    /**
     * Suspending save that returns once the write hits disk. Use this when the
     * caller will immediately re-read the config (e.g. SearchViewModel's
     * auto-ignore path) — `apply()` returns before the disk commit, which used
     * to produce a stale read race.
     */
    suspend fun saveLocalConfigAndAwait(config: FastTravelConfig) = withContext(Dispatchers.IO) {
        val json = ConfigWriter.writeConfig(config)
        prefs.edit().putString(KEY_CONFIG_JSON, json).commit()
        Unit
    }

    fun clearLocalConfig() {
        prefs.edit().remove(KEY_CONFIG_JSON).apply()
    }

    fun hasLocalConfig(): Boolean = prefs.contains(KEY_CONFIG_JSON)
}
