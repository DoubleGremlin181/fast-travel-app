package sh.kavi.fasttravel.data

import android.content.SharedPreferences
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class AutoIgnoreStoreTest {

    private fun newStore(): AutoIgnoreStore = AutoIgnoreStore(FakeSharedPreferences())

    @Test
    fun `empty store returns empty snapshot and zero count`() {
        val store = newStore()

        assertEquals(emptyMap<String, AutoIgnoreStore.Candidate>(), store.all())
        assertEquals(0, store.countOf("anything"))
        assertFalse(store.isDoNotIgnore("anything"))
    }

    @Test
    fun `increment bumps count to 1 with doNotIgnore false`() {
        val store = newStore()

        val next = store.increment("fcb")

        assertEquals(1, next)
        assertEquals(1, store.countOf("fcb"))
        assertFalse(store.isDoNotIgnore("fcb"))
        val snapshot = store.all()
        assertEquals(1, snapshot.size)
        assertEquals(AutoIgnoreStore.Candidate(count = 1, doNotIgnore = false), snapshot["fcb"])
    }

    @Test
    fun `three increments produces count of 3`() {
        val store = newStore()

        store.increment("fcb")
        store.increment("fcb")
        val finalCount = store.increment("fcb")

        assertEquals(3, finalCount)
        assertEquals(3, store.countOf("fcb"))
    }

    @Test
    fun `increment then decrement lands at 1`() {
        val store = newStore()

        store.increment("fcb") // 1
        store.increment("fcb") // 2
        store.decrement("fcb") // 1

        assertEquals(1, store.countOf("fcb"))
        assertEquals(AutoIgnoreStore.Candidate(count = 1, doNotIgnore = false), store.all()["fcb"])
    }

    @Test
    fun `decrement to zero removes the candidate entirely`() {
        val store = newStore()

        store.increment("fcb") // 1
        store.decrement("fcb") // 0 -> removed

        assertEquals(0, store.countOf("fcb"))
        assertEquals(emptyMap<String, AutoIgnoreStore.Candidate>(), store.all())
    }

    @Test
    fun `decrement on missing trigger is a no-op`() {
        val store = newStore()

        store.decrement("ghost")

        assertEquals(0, store.countOf("ghost"))
        assertEquals(emptyMap<String, AutoIgnoreStore.Candidate>(), store.all())
    }

    @Test
    fun `setDoNotIgnore after increments preserves the count`() {
        val store = newStore()

        store.increment("fcb")
        store.increment("fcb")
        store.setDoNotIgnore("fcb", true)

        assertEquals(2, store.countOf("fcb"))
        assertTrue(store.isDoNotIgnore("fcb"))
        assertEquals(
            AutoIgnoreStore.Candidate(count = 2, doNotIgnore = true),
            store.all()["fcb"],
        )
    }

    @Test
    fun `remove deletes both count and do-not-ignore flag`() {
        val store = newStore()

        store.increment("fcb")
        store.increment("fcb")
        store.setDoNotIgnore("fcb", true)

        store.remove("fcb")

        assertEquals(0, store.countOf("fcb"))
        assertFalse(store.isDoNotIgnore("fcb"))
        assertEquals(emptyMap<String, AutoIgnoreStore.Candidate>(), store.all())
    }

    @Test
    fun `clearAll wipes every trigger`() {
        val store = newStore()

        store.increment("fcb")
        store.increment("fcb")
        store.increment("ytube")
        store.setDoNotIgnore("pinned", true)

        store.clearAll()

        assertEquals(0, store.countOf("fcb"))
        assertEquals(0, store.countOf("ytube"))
        assertFalse(store.isDoNotIgnore("pinned"))
        assertEquals(emptyMap<String, AutoIgnoreStore.Candidate>(), store.all())
    }

    @Test
    fun `setDoNotIgnore alone makes trigger appear in all with count 0`() {
        val store = newStore()

        store.setDoNotIgnore("pinned", true)

        assertEquals(
            mapOf("pinned" to AutoIgnoreStore.Candidate(count = 0, doNotIgnore = true)),
            store.all(),
        )
    }

    @Test
    fun `decrement to zero preserves doNotIgnore flag`() {
        val store = newStore()

        store.increment("fcb")
        store.setDoNotIgnore("fcb", true)
        store.decrement("fcb")

        assertEquals(0, store.countOf("fcb"))
        assertTrue(store.isDoNotIgnore("fcb"))
        assertEquals(
            mapOf("fcb" to AutoIgnoreStore.Candidate(count = 0, doNotIgnore = true)),
            store.all(),
        )
    }

    @Test
    fun `trigger casing is normalized to lowercase`() {
        val store = newStore()

        store.increment("FcB")

        assertEquals(1, store.countOf("fcb"))
        assertEquals(1, store.countOf("FCB"))
        assertEquals(1, store.countOf("Fcb"))
        val snapshot = store.all()
        assertEquals(setOf("fcb"), snapshot.keys)
    }
}

/**
 * Minimal in-memory fake implementing only the [SharedPreferences] surface that
 * [AutoIgnoreStore] actually touches: typed getters with defaults, `all`, and
 * an `edit()` that supports putInt/putBoolean/remove/apply with chaining.
 *
 * Everything else returns the JVM default (null / 0 / false / empty) — we don't
 * exercise those paths from the store.
 */
private class FakeSharedPreferences : SharedPreferences {
    private val storage = mutableMapOf<String, Any?>()

    override fun getAll(): MutableMap<String, *> = storage.toMutableMap()

    override fun getString(key: String?, defValue: String?): String? =
        storage[key] as? String ?: defValue

    @Suppress("UNCHECKED_CAST")
    override fun getStringSet(key: String?, defValues: MutableSet<String>?): MutableSet<String>? =
        storage[key] as? MutableSet<String> ?: defValues

    override fun getInt(key: String?, defValue: Int): Int =
        (storage[key] as? Int) ?: defValue

    override fun getLong(key: String?, defValue: Long): Long =
        (storage[key] as? Long) ?: defValue

    override fun getFloat(key: String?, defValue: Float): Float =
        (storage[key] as? Float) ?: defValue

    override fun getBoolean(key: String?, defValue: Boolean): Boolean =
        (storage[key] as? Boolean) ?: defValue

    override fun contains(key: String?): Boolean = storage.containsKey(key)

    override fun edit(): SharedPreferences.Editor = FakeEditor(storage)

    override fun registerOnSharedPreferenceChangeListener(
        listener: SharedPreferences.OnSharedPreferenceChangeListener?,
    ) = Unit

    override fun unregisterOnSharedPreferenceChangeListener(
        listener: SharedPreferences.OnSharedPreferenceChangeListener?,
    ) = Unit
}

private class FakeEditor(private val storage: MutableMap<String, Any?>) : SharedPreferences.Editor {
    private val pending = mutableMapOf<String, Any?>()
    private val removed = mutableSetOf<String>()
    private var clearAll = false

    override fun putString(key: String?, value: String?): SharedPreferences.Editor = apply {
        if (key != null) pending[key] = value
    }

    override fun putStringSet(
        key: String?,
        values: MutableSet<String>?,
    ): SharedPreferences.Editor = apply {
        if (key != null) pending[key] = values
    }

    override fun putInt(key: String?, value: Int): SharedPreferences.Editor = apply {
        if (key != null) pending[key] = value
    }

    override fun putLong(key: String?, value: Long): SharedPreferences.Editor = apply {
        if (key != null) pending[key] = value
    }

    override fun putFloat(key: String?, value: Float): SharedPreferences.Editor = apply {
        if (key != null) pending[key] = value
    }

    override fun putBoolean(key: String?, value: Boolean): SharedPreferences.Editor = apply {
        if (key != null) pending[key] = value
    }

    override fun remove(key: String?): SharedPreferences.Editor = apply {
        if (key != null) removed.add(key)
    }

    override fun clear(): SharedPreferences.Editor = apply { clearAll = true }

    override fun commit(): Boolean {
        apply()
        return true
    }

    override fun apply() {
        if (clearAll) storage.clear()
        for (key in removed) storage.remove(key)
        for ((k, v) in pending) storage[k] = v
        pending.clear()
        removed.clear()
        clearAll = false
    }
}
