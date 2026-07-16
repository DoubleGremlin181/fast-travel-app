package sh.kavi.fasttravel.data

import android.content.SharedPreferences
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ThemePreferencesTest {

    private fun newPrefs(): ThemePreferences = ThemePreferences(TPFakePrefs())

    @Test
    fun `installedAppsEnabled defaults to on`() {
        // Default must stay ON so existing users keep today's app-launch behavior.
        assertTrue(newPrefs().installedAppsEnabled)
    }

    @Test
    fun `themedIconEnabled defaults to off`() {
        // Default must stay OFF: theme-following flips the live launcher alias and
        // breaks launcher-stored references (gestures, pinned shortcuts) to the
        // disabled one — Lawnchair crashes launching them. Opt-in only.
        assertFalse(newPrefs().themedIconEnabled)
    }

    @Test
    fun `themedIconEnabled persists when opted in`() {
        val prefs = newPrefs()

        prefs.themedIconEnabled = true
        assertTrue(prefs.themedIconEnabled)

        prefs.themedIconEnabled = false
        assertFalse(prefs.themedIconEnabled)
    }

    @Test
    fun `installedAppsEnabled persists when toggled off and back on`() {
        val prefs = newPrefs()

        prefs.installedAppsEnabled = false
        assertFalse(prefs.installedAppsEnabled)

        prefs.installedAppsEnabled = true
        assertTrue(prefs.installedAppsEnabled)
    }
}

private class TPFakePrefs : SharedPreferences {
    private val storage = mutableMapOf<String, Any?>()

    override fun getAll(): MutableMap<String, *> = storage.toMutableMap()
    override fun getString(key: String?, defValue: String?): String? = storage[key] as? String ?: defValue
    @Suppress("UNCHECKED_CAST")
    override fun getStringSet(key: String?, defValues: MutableSet<String>?): MutableSet<String>? =
        storage[key] as? MutableSet<String> ?: defValues
    override fun getInt(key: String?, defValue: Int): Int = (storage[key] as? Int) ?: defValue
    override fun getLong(key: String?, defValue: Long): Long = (storage[key] as? Long) ?: defValue
    override fun getFloat(key: String?, defValue: Float): Float = (storage[key] as? Float) ?: defValue
    override fun getBoolean(key: String?, defValue: Boolean): Boolean = (storage[key] as? Boolean) ?: defValue
    override fun contains(key: String?): Boolean = storage.containsKey(key)
    override fun edit(): SharedPreferences.Editor = TPFakeEditor(storage)
    override fun registerOnSharedPreferenceChangeListener(listener: SharedPreferences.OnSharedPreferenceChangeListener?) = Unit
    override fun unregisterOnSharedPreferenceChangeListener(listener: SharedPreferences.OnSharedPreferenceChangeListener?) = Unit
}

private class TPFakeEditor(private val storage: MutableMap<String, Any?>) : SharedPreferences.Editor {
    private val pending = mutableMapOf<String, Any?>()
    private val removed = mutableSetOf<String>()
    private var clearAll = false

    override fun putString(key: String?, value: String?) = apply { if (key != null) pending[key] = value }
    override fun putStringSet(key: String?, values: MutableSet<String>?) = apply { if (key != null) pending[key] = values }
    override fun putInt(key: String?, value: Int) = apply { if (key != null) pending[key] = value }
    override fun putLong(key: String?, value: Long) = apply { if (key != null) pending[key] = value }
    override fun putFloat(key: String?, value: Float) = apply { if (key != null) pending[key] = value }
    override fun putBoolean(key: String?, value: Boolean) = apply { if (key != null) pending[key] = value }
    override fun remove(key: String?) = apply { if (key != null) removed.add(key) }
    override fun clear() = apply { clearAll = true }
    override fun commit(): Boolean { flush(); return true }
    override fun apply() = flush()

    private fun flush() {
        if (clearAll) storage.clear()
        for (key in removed) storage.remove(key)
        for ((k, v) in pending) storage[k] = v
        pending.clear(); removed.clear(); clearAll = false
    }
}
