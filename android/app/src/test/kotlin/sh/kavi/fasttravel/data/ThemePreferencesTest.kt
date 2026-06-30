package sh.kavi.fasttravel.data

import android.content.SharedPreferences
import org.junit.jupiter.api.Assertions.assertEquals
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
    fun `installedAppsEnabled persists when toggled off and back on`() {
        val prefs = newPrefs()

        prefs.installedAppsEnabled = false
        assertFalse(prefs.installedAppsEnabled)

        prefs.installedAppsEnabled = true
        assertTrue(prefs.installedAppsEnabled)
    }

    // ── localSearchEnabled ────────────────────────────────────────────────────

    @Test
    fun `localSearchEnabled defaults to false`() {
        // Must start OFF so no user gains an unrequested s-intercept on upgrade.
        assertFalse(newPrefs().localSearchEnabled)
    }

    @Test
    fun `localSearchEnabled persists when toggled`() {
        val prefs = newPrefs()
        prefs.localSearchEnabled = true
        assertTrue(prefs.localSearchEnabled)
        prefs.localSearchEnabled = false
        assertFalse(prefs.localSearchEnabled)
    }

    // ── localSearchQueryMode ──────────────────────────────────────────────────

    @Test
    fun `localSearchQueryMode defaults to simple`() {
        assertEquals("simple", newPrefs().localSearchQueryMode)
    }

    @Test
    fun `localSearchQueryMode persists custom value`() {
        val prefs = newPrefs()
        prefs.localSearchQueryMode = "wildcard"
        assertEquals("wildcard", prefs.localSearchQueryMode)
    }

    // ── localSearchSortField / localSearchSortDir ─────────────────────────────

    @Test
    fun `localSearchSortField defaults to empty string (relevance)`() {
        assertEquals("", newPrefs().localSearchSortField)
    }

    @Test
    fun `localSearchSortDir defaults to empty string (desc)`() {
        assertEquals("", newPrefs().localSearchSortDir)
    }

    @Test
    fun `localSearchSortField and SortDir persist custom values`() {
        val prefs = newPrefs()
        prefs.localSearchSortField = "name"
        prefs.localSearchSortDir = "asc"
        assertEquals("name", prefs.localSearchSortField)
        assertEquals("asc", prefs.localSearchSortDir)
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
