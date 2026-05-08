package sh.kavi.fasttravel.data

import android.content.Context
import android.content.SharedPreferences

/**
 * Device-local store of auto-ignore candidates. Each candidate has a dismissal
 * [count] and a [doNotIgnore] flag that lets the user "pin" a trigger so it
 * won't be auto-added to the ignore list even if the count crosses the
 * auto-ignore threshold.
 *
 * Missing entries imply `count=0, doNotIgnore=false`. A count of `0` is never
 * persisted — decrementing to zero removes the candidate entirely.
 *
 * Triggers are stored lowercased; all read/write keys lowercase first.
 */
class AutoIgnoreStore internal constructor(private val prefs: SharedPreferences) {

    constructor(context: Context) : this(
        context.applicationContext.getSharedPreferences(PREFS_NAME, 0),
    )

    data class Candidate(val count: Int, val doNotIgnore: Boolean)

    /** Bump the dismissal count by one. Returns the new count. */
    fun increment(trigger: String): Int {
        val key = countKey(trigger)
        val next = prefs.getInt(key, 0) + 1
        prefs.edit().putInt(key, next).apply()
        return next
    }

    /**
     * Decrease the dismissal count by one. If the candidate's count hits zero
     * the count key is removed (the do-not-ignore flag is left untouched —
     * use [remove] to clear both). No-op if the trigger isn't stored.
     */
    fun decrement(trigger: String) {
        val key = countKey(trigger)
        val current = prefs.getInt(key, 0)
        if (current <= 0) return
        val next = current - 1
        val editor = prefs.edit()
        if (next <= 0) {
            editor.remove(key)
        } else {
            editor.putInt(key, next)
        }
        editor.apply()
    }

    fun countOf(trigger: String): Int =
        prefs.getInt(countKey(trigger), 0)

    fun isDoNotIgnore(trigger: String): Boolean =
        prefs.getBoolean(dniKey(trigger), false)

    fun setDoNotIgnore(trigger: String, value: Boolean) {
        val editor = prefs.edit()
        if (value) editor.putBoolean(dniKey(trigger), true)
        else editor.remove(dniKey(trigger))
        editor.apply()
    }

    /** Delete both the count and do-not-ignore flag for [trigger]. */
    fun remove(trigger: String) {
        prefs.edit()
            .remove(countKey(trigger))
            .remove(dniKey(trigger))
            .apply()
    }

    /** Wipe every candidate — every count and every do-not-ignore flag. */
    fun clearAll() {
        val editor = prefs.edit()
        for (key in prefs.all.keys) {
            if (key.startsWith(COUNT_PREFIX) || key.startsWith(DNI_PREFIX)) {
                editor.remove(key)
            }
        }
        editor.apply()
    }

    /**
     * Lowercase trigger → [Candidate] snapshot. A trigger appears if it has a
     * non-zero count OR a do-not-ignore flag set. Missing fields default to
     * `count=0, doNotIgnore=false`.
     */
    fun all(): Map<String, Candidate> {
        val counts = mutableMapOf<String, Int>()
        val flags = mutableMapOf<String, Boolean>()
        for ((k, v) in prefs.all) {
            when {
                k.startsWith(COUNT_PREFIX) && v is Int && v > 0 ->
                    counts[k.removePrefix(COUNT_PREFIX)] = v
                k.startsWith(DNI_PREFIX) && v is Boolean && v ->
                    flags[k.removePrefix(DNI_PREFIX)] = v
            }
        }
        val triggers = counts.keys + flags.keys
        return triggers.associateWith { trigger ->
            Candidate(
                count = counts[trigger] ?: 0,
                doNotIgnore = flags[trigger] ?: false,
            )
        }
    }

    private fun countKey(trigger: String): String =
        COUNT_PREFIX + trigger.lowercase()

    private fun dniKey(trigger: String): String =
        DNI_PREFIX + trigger.lowercase()

    private companion object {
        const val PREFS_NAME = "fast_travel_auto_ignore"
        const val COUNT_PREFIX = "ignore_count_"
        const val DNI_PREFIX = "ignore_dni_"
    }
}
