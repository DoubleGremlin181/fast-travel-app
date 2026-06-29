package sh.kavi.fasttravel.data

import android.app.Application
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class)
class LocalIgnoreStoreTest {

    private val context: Context = ApplicationProvider.getApplicationContext()
    private fun newStore() = LocalIgnoreStore(context)

    @Test
    fun `empty store returns empty set`() {
        assertEquals(emptySet<String>(), newStore().all())
        assertFalse(newStore().contains("anything"))
    }

    @Test
    fun `add stores the trigger lowercased and survives a fresh instance`() {
        newStore().add("ScHoLr")

        // A new instance reads the same persisted prefs.
        val store = newStore()
        assertEquals(setOf("scholr"), store.all())
        assertTrue(store.contains("scholr"))
        assertTrue(store.contains("SCHOLR")) // case-insensitive
    }

    @Test
    fun `add is idempotent and ignores blanks`() {
        val store = newStore()
        store.add("dupe")
        store.add("DUPE")
        store.add("   ")
        assertEquals(setOf("dupe"), store.all())
    }

    @Test
    fun `remove deletes case-insensitively`() {
        val store = newStore()
        store.add("one")
        store.add("two")
        store.remove("ONE")
        assertEquals(setOf("two"), store.all())
    }
}
