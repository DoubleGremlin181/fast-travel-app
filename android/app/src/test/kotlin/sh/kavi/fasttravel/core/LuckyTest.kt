package sh.kavi.fasttravel.core

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * Minimal hand-written coverage for [Lucky.buildLuckyUrl]. A later task adds a
 * fixture-driven @ParameterizedTest block here (shared/test-fixtures) that exercises
 * the extension and Android ports against the same cases — kept as plain @Test
 * functions for now so that block can be added alongside without restructuring.
 */
class LuckyTest {

    private fun command(id: String, trigger: String) = Command(
        id = id,
        triggers = listOf(trigger),
        name = id,
        type = CommandType.Standard,
        routes = listOf(
            Route(devices = RouteDevices.Wildcard, defaultUrl = "https://example.com"),
        ),
    )

    private fun config(
        defaultCommand: String = "g",
        defaultLuckyUrl: String? = "https://www.google.com/search?q={query}&btnI",
    ) = FastTravelConfig(
        version = 1,
        defaultCommand = defaultCommand,
        defaultLuckyUrl = defaultLuckyUrl,
        groups = listOf(
            Group(id = "g1", name = "Group", commands = listOf(command("google", "g"))),
        ),
        ignoreList = emptyList(),
    )

    @Test
    fun `substitutes query and attributes the default command`() {
        val result = Lucky.buildLuckyUrl(config(), "cat pics")

        assertEquals(
            LuckyResult(
                url = "https://www.google.com/search?q=cat%20pics&btnI",
                commandId = "google",
            ),
            result,
        )
    }

    @Test
    fun `returns null when defaultLuckyUrl is absent`() {
        assertNull(Lucky.buildLuckyUrl(config(defaultLuckyUrl = null), "cat pics"))
    }

    @Test
    fun `returns null when defaultLuckyUrl is blank`() {
        assertNull(Lucky.buildLuckyUrl(config(defaultLuckyUrl = "   "), "cat pics"))
    }

    @Test
    fun `returns null when query is blank`() {
        assertNull(Lucky.buildLuckyUrl(config(), "   "))
    }

    @Test
    fun `returns null when the default command does not resolve`() {
        assertNull(Lucky.buildLuckyUrl(config(defaultCommand = "missing"), "cat pics"))
    }
}
