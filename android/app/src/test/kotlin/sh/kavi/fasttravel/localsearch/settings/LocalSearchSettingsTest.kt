package sh.kavi.fasttravel.localsearch.settings

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import sh.kavi.fasttravel.core.Command
import sh.kavi.fasttravel.core.CommandType
import sh.kavi.fasttravel.core.FastTravelConfig
import sh.kavi.fasttravel.core.Group
import sh.kavi.fasttravel.core.Route
import sh.kavi.fasttravel.core.RouteDevices

/**
 * Unit tests for the pure Local Search settings helpers.
 * All tests run on the JVM — no android.* dependencies.
 */
class LocalSearchSettingsTest {

    // ── canEnableLocalSearch ──────────────────────────────────────────────────

    @Test
    fun `canEnableLocalSearch returns true when permission granted and no s collision`() {
        assertTrue(canEnableLocalSearch(hasPermission = true, configHasS = false))
    }

    @Test
    fun `canEnableLocalSearch returns false when permission missing regardless of collision`() {
        assertFalse(canEnableLocalSearch(hasPermission = false, configHasS = false))
        assertFalse(canEnableLocalSearch(hasPermission = false, configHasS = true))
    }

    @Test
    fun `canEnableLocalSearch returns false when s collision exists even if permission granted`() {
        assertFalse(canEnableLocalSearch(hasPermission = true, configHasS = true))
    }

    // ── configHasSTrigger ─────────────────────────────────────────────────────

    /** Builds a minimal FastTravelConfig with a single command using the given triggers. */
    private fun configWithTriggers(vararg triggers: String): FastTravelConfig {
        val cmd = Command(
            id = "test-cmd",
            triggers = triggers.toList(),
            name = "Test",
            type = CommandType.Standard,
            routes = listOf(
                Route(
                    devices = RouteDevices.Wildcard,
                    defaultUrl = "https://example.com/{query}",
                )
            ),
        )
        val group = Group(id = "test-group", name = "Test Group", commands = listOf(cmd))
        return FastTravelConfig(
            version = 1,
            defaultCommand = "g",
            groups = listOf(group),
            ignoreList = emptyList(),
        )
    }

    private fun emptyConfig() = FastTravelConfig(
        version = 1,
        defaultCommand = "g",
        groups = emptyList(),
        ignoreList = emptyList(),
    )

    @Test
    fun `configHasSTrigger returns false for empty config`() {
        assertFalse(configHasSTrigger(emptyConfig()))
    }

    @Test
    fun `configHasSTrigger returns false when no command uses the s trigger`() {
        assertFalse(configHasSTrigger(configWithTriggers("g", "gh", "wiki", "so")))
    }

    @Test
    fun `configHasSTrigger returns true when a command uses lowercase s`() {
        assertTrue(configHasSTrigger(configWithTriggers("s")))
    }

    @Test
    fun `configHasSTrigger returns true when a command uses uppercase S (case-insensitive)`() {
        // buildTriggerMap lowercases all triggers, so "S" must also match.
        assertTrue(configHasSTrigger(configWithTriggers("S")))
    }

    @Test
    fun `configHasSTrigger returns true when s is one of several triggers on a command`() {
        assertTrue(configHasSTrigger(configWithTriggers("search", "s", "find")))
    }

    @Test
    fun `configHasSTrigger does not match triggers that merely start with s`() {
        assertFalse(configHasSTrigger(configWithTriggers("so", "sp", "search", "si")))
    }

    @Test
    fun `configHasSTrigger detects s across multiple groups`() {
        val cmd1 = Command(
            id = "cmd-a", triggers = listOf("g"), name = "Google",
            type = CommandType.Standard,
            routes = listOf(Route(devices = RouteDevices.Wildcard, defaultUrl = "https://google.com")),
        )
        val cmd2 = Command(
            id = "cmd-b", triggers = listOf("s"), name = "Stack Overflow",
            type = CommandType.Standard,
            routes = listOf(Route(devices = RouteDevices.Wildcard, defaultUrl = "https://stackoverflow.com")),
        )
        val config = FastTravelConfig(
            version = 1,
            defaultCommand = "g",
            groups = listOf(
                Group(id = "g1", name = "Group 1", commands = listOf(cmd1)),
                Group(id = "g2", name = "Group 2", commands = listOf(cmd2)),
            ),
            ignoreList = emptyList(),
        )
        assertTrue(configHasSTrigger(config))
    }
}
