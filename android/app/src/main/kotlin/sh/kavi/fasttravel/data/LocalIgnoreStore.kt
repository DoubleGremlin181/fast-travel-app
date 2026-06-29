package sh.kavi.fasttravel.data

import android.content.Context
import android.content.SharedPreferences

/**
 * Device-local list of triggers the user has chosen to permanently ignore for
 * typo detection.
 *
 * Deliberately kept OUT of the config document: the ignore list is a personal,
 * per-device preference, not shared command config. Storing user ignores here
 * (instead of in `FastTravelConfig.ignoreList`) means adding/removing one never
 * marks the config dirty and never pauses remote auto-refresh. The entries are
 * merged into the effective ignore list at parse time by [effectiveIgnoreList],
 * alongside the config's baseline ignoreList and the auto-ignore candidates.
 *
 * Triggers are stored lowercased; all reads/writes lowercase first.
 */
class LocalIgnoreStore internal constructor(private val prefs: SharedPreferences) {

    constructor(context: Context) : this(
        context.applicationContext.getSharedPreferences(PREFS_NAME, 0),
    )

    /** All locally-ignored triggers (lowercased). */
    fun all(): Set<String> =
        // getStringSet returns a shared, must-not-mutate instance — copy it.
        prefs.getStringSet(KEY_ENTRIES, emptySet())!!.toSet()

    fun contains(trigger: String): Boolean {
        val t = trigger.trim().lowercase()
        return all().contains(t)
    }

    /** Add [trigger] (lowercased). No-op for blank input or an existing entry. */
    fun add(trigger: String) {
        val t = trigger.trim().lowercase()
        if (t.isEmpty()) return
        val current = all()
        if (current.contains(t)) return
        prefs.edit().putStringSet(KEY_ENTRIES, current + t).apply()
    }

    /** Remove [trigger] if present (case-insensitive). */
    fun remove(trigger: String) {
        val t = trigger.trim().lowercase()
        val current = all()
        if (!current.contains(t)) return
        prefs.edit().putStringSet(KEY_ENTRIES, current - t).apply()
    }

    private companion object {
        const val PREFS_NAME = "fast_travel_local_ignore"
        const val KEY_ENTRIES = "entries"
    }
}
