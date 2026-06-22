package sh.kavi.fasttravel.core

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * [ChipRanking] decides which command / installed-app ids fill the empty-input
 * shortcut grid. Apps only become chips once they've been launched (i.e. appear in
 * history) and only when the installed-apps toggle is on. Ranking itself is delegated
 * to [Frecency], so this verifies the candidate-set construction + toggle gating.
 */
class ChipRankingTest {

    private val now = 1_000_000_000_000L
    private val dayMs = 86_400_000L

    private fun used(id: String, daysAgo: Long) =
        Frecency.HistoryEntry(id, now - daysAgo * dayMs)

    @Test
    fun `cold start with no history keeps command config order`() {
        val ranked = ChipRanking.rankedIds(
            commandIds = listOf("g", "yt", "r"),
            history = emptyList(),
            now = now,
            includeApps = true,
            limit = 8,
        )
        assertEquals(listOf("g", "yt", "r"), ranked)
    }

    @Test
    fun `launched app becomes a candidate when apps are enabled`() {
        val appId = installedAppId("com.maps", "com.maps.Main")
        val ranked = ChipRanking.rankedIds(
            commandIds = listOf("g", "yt"),
            history = listOf(used(appId, daysAgo = 0)),
            now = now,
            includeApps = true,
            limit = 8,
        )
        assertTrue(ranked.contains(appId), "recently launched app should be a chip candidate")
    }

    @Test
    fun `app candidates are dropped when apps are disabled`() {
        val appId = installedAppId("com.maps", "com.maps.Main")
        val ranked = ChipRanking.rankedIds(
            commandIds = listOf("g", "yt"),
            history = listOf(used(appId, daysAgo = 0)),
            now = now,
            includeApps = false,
            limit = 8,
        )
        assertFalse(ranked.contains(appId), "apps must not appear as chips when the toggle is off")
        assertEquals(listOf("g", "yt"), ranked)
    }

    @Test
    fun `a recently used app outranks an unused command`() {
        val appId = installedAppId("com.maps", "com.maps.Main")
        val ranked = ChipRanking.rankedIds(
            commandIds = listOf("g", "yt"),
            history = listOf(used(appId, daysAgo = 0)),
            now = now,
            includeApps = true,
            limit = 8,
        )
        assertEquals(appId, ranked.first(), "a used app should rank above never-used commands")
    }

    @Test
    fun `limit caps the number of chips`() {
        val ranked = ChipRanking.rankedIds(
            commandIds = listOf("a", "b", "c", "d", "e"),
            history = emptyList(),
            now = now,
            includeApps = true,
            limit = 3,
        )
        assertEquals(listOf("a", "b", "c"), ranked)
    }
}
