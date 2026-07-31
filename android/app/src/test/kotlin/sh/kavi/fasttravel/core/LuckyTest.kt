package sh.kavi.fasttravel.core

import org.json.JSONArray
import org.json.JSONObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import java.io.File
import java.util.stream.Stream

/**
 * Coverage for [Lucky.buildLuckyUrl]: hand-written cases plus a fixture-driven
 * block (shared/test-fixtures/lucky.fixtures.json) that exercises the extension
 * and Android ports against the same cases to pin cross-platform parity.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
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

    /** Get an optional string field, returning null if absent (not the empty string). */
    private fun JSONObject.optStringOrNull(key: String): String? =
        if (has(key) && !isNull(key)) getString(key) else null

    private fun resolveSharedFile(relativePath: String): File {
        // Try multiple base paths - Gradle may run from android/ or android/app/
        val candidates = listOf(
            File("../shared/$relativePath"),
            File("../../shared/$relativePath"),
            File("shared/$relativePath"),
        )
        return candidates.firstOrNull { it.exists() }
            ?: throw IllegalStateException(
                "Cannot find shared/$relativePath. Tried: ${candidates.map { it.absolutePath }}"
            )
    }

    data class LuckyFixture(
        val description: String,
        val defaultLuckyUrl: String?,
        val defaultCommand: String,
        val query: String,
        val expectedUrl: String?,
        val expectedCommandId: String?,
    )

    private fun loadLuckyFixtures(): Stream<LuckyFixture> {
        val json = resolveSharedFile("test-fixtures/lucky.fixtures.json").readText()
        val arr = JSONArray(json)
        val fixtures = mutableListOf<LuckyFixture>()

        for (i in 0 until arr.length()) {
            val obj = arr.getJSONObject(i)
            val input = obj.getJSONObject("input")
            val expected = obj.optJSONObject("expected")
            fixtures.add(
                LuckyFixture(
                    description = obj.getString("description"),
                    defaultLuckyUrl = input.optStringOrNull("defaultLuckyUrl"),
                    defaultCommand = input.getString("defaultCommand"),
                    query = input.getString("query"),
                    expectedUrl = expected?.optStringOrNull("url"),
                    expectedCommandId = expected?.optStringOrNull("commandId"),
                )
            )
        }

        return fixtures.stream()
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("loadLuckyFixtures")
    @DisplayName("Lucky URL fixtures")
    fun `lucky url fixtures`(fixture: LuckyFixture) {
        val result = Lucky.buildLuckyUrl(
            config(defaultCommand = fixture.defaultCommand, defaultLuckyUrl = fixture.defaultLuckyUrl),
            fixture.query,
        )

        if (fixture.expectedUrl == null) {
            assertNull(result, "${fixture.description}: expected null")
        } else {
            assertEquals(
                LuckyResult(url = fixture.expectedUrl, commandId = fixture.expectedCommandId),
                result,
                fixture.description,
            )
        }
    }
}
