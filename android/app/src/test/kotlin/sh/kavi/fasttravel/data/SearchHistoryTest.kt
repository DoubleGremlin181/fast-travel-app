package sh.kavi.fasttravel.data

import android.content.SharedPreferences
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class SearchHistoryTest {

    private fun newHistory(): SearchHistory = SearchHistory(SHFakePrefs())

    @Test
    fun `addEntry deduplicates - same query twice produces one entry with the newer timestamp`() {
        val h = newHistory()

        h.addEntry("github", null)
        val before = System.currentTimeMillis()
        h.addEntry("github", null)

        val entries = h.getHistory()
        assertEquals(1, entries.size)
        assertEquals("github", entries[0].query)
        assert(entries[0].timestamp >= before) { "timestamp should be from the second (newer) addEntry call" }
    }

    @Test
    fun `addEntry moves existing query to top and keeps others in order`() {
        val h = newHistory()

        h.addEntry("a", null)
        h.addEntry("b", null)
        h.addEntry("a", null)   // re-add "a" — should move to index 0, "b" to index 1

        val queries = h.getHistory().map { it.query }
        assertEquals(listOf("a", "b"), queries)
    }

    @Test
    fun `addEntry with repeated query does not grow storage beyond MAX_ENTRIES`() {
        val h = newHistory()

        // Fill to cap with distinct queries first
        repeat(50) { h.addEntry("distinct$it", null) }
        assertEquals(50, h.getHistory().size)

        // Repeatedly adding the same query must not exceed the cap
        repeat(10) { h.addEntry("repeated", null) }
        assertEquals(50, h.getHistory().size)
        assertEquals("repeated", h.getHistory().first().query)
    }

    @Test
    fun `addEntry stores entries most-recent first`() {
        val h = newHistory()

        h.addEntry("first", null)
        h.addEntry("second", null)
        h.addEntry("third", null)

        val queries = h.getHistory().map { it.query }
        assertEquals(listOf("third", "second", "first"), queries)
    }

    @Test
    fun `addEntry trims to 50 entries`() {
        val h = newHistory()

        repeat(55) { h.addEntry("query$it", null) }

        assertEquals(50, h.getHistory().size)
    }

    @Test
    fun `clearHistory removes all entries`() {
        val h = newHistory()

        h.addEntry("a", null)
        h.addEntry("b", null)
        h.clearHistory()

        assertEquals(0, h.getHistory().size)
    }

    @Test
    fun `remove deletes all entries with matching query`() {
        val h = newHistory()

        h.addEntry("github", null)
        h.addEntry("google", null)
        h.addEntry("github", "cmd1")

        h.remove("github")

        val entries = h.getHistory()
        assertEquals(1, entries.size)
        assertEquals("google", entries[0].query)
    }

    @Test
    fun `commandId and timestamp are preserved`() {
        val h = newHistory()
        val before = System.currentTimeMillis()

        h.addEntry("github", "git-cmd")

        val entry = h.getHistory().first()
        assertEquals("github", entry.query)
        assertEquals("git-cmd", entry.commandId)
        assert(entry.timestamp >= before)
    }
}

private class SHFakePrefs : SharedPreferences {
    private val storage = mutableMapOf<String, Any?>()

    override fun getAll(): MutableMap<String, *> = storage.toMutableMap()
    override fun getString(key: String?, defValue: String?): String? = storage[key] as? String ?: defValue
    @Suppress("UNCHECKED_CAST")
    override fun getStringSet(key: String?, defValues: MutableSet<String>?): MutableSet<String>? = storage[key] as? MutableSet<String> ?: defValues
    override fun getInt(key: String?, defValue: Int): Int = (storage[key] as? Int) ?: defValue
    override fun getLong(key: String?, defValue: Long): Long = (storage[key] as? Long) ?: defValue
    override fun getFloat(key: String?, defValue: Float): Float = (storage[key] as? Float) ?: defValue
    override fun getBoolean(key: String?, defValue: Boolean): Boolean = (storage[key] as? Boolean) ?: defValue
    override fun contains(key: String?): Boolean = storage.containsKey(key)
    override fun edit(): SharedPreferences.Editor = SHFakeEditor(storage)
    override fun registerOnSharedPreferenceChangeListener(listener: SharedPreferences.OnSharedPreferenceChangeListener?) = Unit
    override fun unregisterOnSharedPreferenceChangeListener(listener: SharedPreferences.OnSharedPreferenceChangeListener?) = Unit
}

private class SHFakeEditor(private val storage: MutableMap<String, Any?>) : SharedPreferences.Editor {
    private val pending = mutableMapOf<String, Any?>()
    private val removed = mutableSetOf<String>()
    private var clearAll = false

    override fun putString(key: String?, value: String?): SharedPreferences.Editor =
        apply { if (key != null) pending[key] = value }

    override fun putStringSet(key: String?, values: MutableSet<String>?): SharedPreferences.Editor =
        apply { if (key != null) pending[key] = values }

    override fun putInt(key: String?, value: Int): SharedPreferences.Editor =
        apply { if (key != null) pending[key] = value }

    override fun putLong(key: String?, value: Long): SharedPreferences.Editor =
        apply { if (key != null) pending[key] = value }

    override fun putFloat(key: String?, value: Float): SharedPreferences.Editor =
        apply { if (key != null) pending[key] = value }

    override fun putBoolean(key: String?, value: Boolean): SharedPreferences.Editor =
        apply { if (key != null) pending[key] = value }

    override fun remove(key: String?): SharedPreferences.Editor =
        apply { if (key != null) removed.add(key) }

    override fun clear(): SharedPreferences.Editor = apply { clearAll = true }

    override fun commit(): Boolean { flush(); return true }

    override fun apply() = flush()

    private fun flush() {
        if (clearAll) storage.clear()
        for (key in removed) storage.remove(key)
        for ((k, v) in pending) storage[k] = v
        pending.clear(); removed.clear(); clearAll = false
    }
}
