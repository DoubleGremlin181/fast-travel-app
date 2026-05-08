package sh.kavi.fasttravel.data

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import sh.kavi.fasttravel.core.FastTravelConfig
import sh.kavi.fasttravel.core.Group

class ConfigMutationsTest {

    private fun makeConfig(vararg groups: Pair<String, String>): FastTravelConfig = FastTravelConfig(
        version = 1,
        defaultCommand = "g",
        groups = groups.map { (id, name) -> Group(id = id, name = name) },
        ignoreList = emptyList(),
    )

    /** Convenience overload: id == name (capitalised). */
    private fun makeConfig(vararg groupIds: String): FastTravelConfig =
        makeConfig(*groupIds.map { it to it.replaceFirstChar { c -> c.uppercaseChar() } }.toTypedArray())

    // --------------- withGroupMoved (basic) ---------------

    @Test
    fun `withGroupMoved moves first group to last position`() {
        val cfg = makeConfig("alpha", "beta", "gamma")
        val result = cfg.withGroupMoved(fromIndex = 0, toIndex = 2)
        assertEquals(listOf("beta", "gamma", "alpha"), result.groups.map { it.id })
    }

    @Test
    fun `withGroupMoved moves last group to first position`() {
        val cfg = makeConfig("alpha", "beta", "gamma")
        val result = cfg.withGroupMoved(fromIndex = 2, toIndex = 0)
        assertEquals(listOf("gamma", "alpha", "beta"), result.groups.map { it.id })
    }

    @Test
    fun `withGroupMoved returns unchanged config when indices are equal`() {
        val cfg = makeConfig("alpha", "beta", "gamma")
        val result = cfg.withGroupMoved(fromIndex = 1, toIndex = 1)
        assertEquals(cfg, result)
    }

    @Test
    fun `withGroupMoved returns unchanged config when index is out of bounds`() {
        val cfg = makeConfig("alpha", "beta")
        assertEquals(cfg, cfg.withGroupMoved(fromIndex = 0, toIndex = 5))
        assertEquals(cfg, cfg.withGroupMoved(fromIndex = -1, toIndex = 1))
    }

    // --------------- filtered-index → unfiltered-index mapping ---------------

    /**
     * Simulates the fix in GroupsHomeScreen: when a search filter hides some
     * groups, drag indices from the filtered list must be mapped back to
     * positions in the full config.groups list before calling withGroupMoved.
     *
     * Setup: 3 groups — "Apple" (id=apple), "Bravo" (id=bravo), "Cherry" (id=cherry).
     * Filter needle "e": matches "Apple" and "Cherry" but NOT "Bravo".
     *   filteredGroups = [apple, cherry]  (filtered indices 0 and 1)
     * Action: drag filtered[0] ("apple") to filtered[1] ("cherry").
     * Expected full list after move: ["bravo", "cherry", "apple"]
     *   i.e. "apple" (unfiltered index 0) moved to unfiltered index 2.
     */
    @Test
    fun `drag in filtered list reorders correct groups in full list`() {
        val cfg = makeConfig(
            "apple" to "Apple",
            "bravo" to "Bravo",
            "cherry" to "Cherry",
        )
        val allGroups = cfg.groups

        // Simulate the filter the UI applies
        val needle = "e"
        val filteredGroups = allGroups.filter { it.name.lowercase().contains(needle) }
        // "Apple" → 'e' ✓  |  "Bravo" → no 'e' ✗  |  "Cherry" → 'e' ✓
        assertEquals(listOf("apple", "cherry"), filteredGroups.map { it.id })

        // Drag: filtered index 0 ("apple") → filtered index 1 ("cherry")
        val fromGroupId = filteredGroups[0].id  // "apple"
        val toGroupId = filteredGroups[1].id    // "cherry"

        val fromIdx = cfg.groups.indexOfFirst { it.id == fromGroupId }  // 0
        val toIdx = cfg.groups.indexOfFirst { it.id == toGroupId }      // 2

        val result = cfg.withGroupMoved(fromIdx, toIdx)

        // "apple" moved past "cherry"; "bravo" stays in the middle
        assertEquals(listOf("bravo", "cherry", "apple"), result.groups.map { it.id })
    }

    /**
     * Complementary case: drag the second filtered item ("cherry") up to the
     * first position in the filtered list ("apple"). The unfiltered "bravo"
     * (index 1) must remain untouched between them.
     * Expected full list after move: ["cherry", "apple", "bravo"]
     */
    @Test
    fun `drag second filtered item to top reorders correct groups in full list`() {
        val cfg = makeConfig(
            "apple" to "Apple",
            "bravo" to "Bravo",
            "cherry" to "Cherry",
        )
        val allGroups = cfg.groups

        val needle = "e"
        val filteredGroups = allGroups.filter { it.name.lowercase().contains(needle) }
        // filteredGroups = [apple, cherry]

        // Drag: filtered index 1 ("cherry") → filtered index 0 ("apple")
        val fromGroupId = filteredGroups[1].id  // "cherry"
        val toGroupId = filteredGroups[0].id    // "apple"

        val fromIdx = cfg.groups.indexOfFirst { it.id == fromGroupId }  // 2
        val toIdx = cfg.groups.indexOfFirst { it.id == toGroupId }      // 0

        val result = cfg.withGroupMoved(fromIdx, toIdx)

        assertEquals(listOf("cherry", "apple", "bravo"), result.groups.map { it.id })
    }

    /**
     * When no filter is active (filteredGroups == allGroups), the mapping
     * must be a no-op: fromIdx == fromFilteredIdx and toIdx == toFilteredIdx.
     */
    @Test
    fun `drag with no filter active maps correctly to unfiltered indices`() {
        val cfg = makeConfig("alpha", "beta", "gamma")
        val filteredGroups = cfg.groups  // no filter

        val fromGroupId = filteredGroups[0].id
        val toGroupId = filteredGroups[2].id

        val fromIdx = cfg.groups.indexOfFirst { it.id == fromGroupId }
        val toIdx = cfg.groups.indexOfFirst { it.id == toGroupId }

        val result = cfg.withGroupMoved(fromIdx, toIdx)
        assertEquals(listOf("beta", "gamma", "alpha"), result.groups.map { it.id })
    }
}
