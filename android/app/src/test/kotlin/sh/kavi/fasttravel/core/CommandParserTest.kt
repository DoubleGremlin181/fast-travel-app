package sh.kavi.fasttravel.core

import org.json.JSONArray
import org.json.JSONObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import java.io.File
import java.util.stream.Stream

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class CommandParserTest {

    private lateinit var config: FastTravelConfig

    /** Get an optional string field, returning null if absent (not the empty string). */
    private fun JSONObject.optStringOrNull(key: String): String? =
        if (has(key) && !isNull(key)) getString(key) else null

    data class ParseCommandFixture(
        val description: String,
        val rawQuery: String,
        val device: String,
        val ignoreList: List<String>,
        val expectedType: String,
        val expectedUrl: String?,
        val expectedCommandId: String?,
        val expectedMatchType: String?,
        val expectedSuggestedTrigger: String?,
    )

    @BeforeAll
    fun setup() {
        val configJson = resolveSharedFile("config/default-config.json").readText()
        config = ConfigParser.parseConfig(configJson)
    }

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

    private fun loadParseCommandFixtures(): Stream<ParseCommandFixture> {
        val json = resolveSharedFile("test-fixtures/parse-command.fixtures.json").readText()
        val arr = JSONArray(json)
        val fixtures = mutableListOf<ParseCommandFixture>()

        for (i in 0 until arr.length()) {
            val obj = arr.getJSONObject(i)
            val input = obj.getJSONObject("input")
            val expected = obj.getJSONObject("expected")
            val ignoreList = if (input.has("ignoreList")) {
                val il = input.getJSONArray("ignoreList")
                (0 until il.length()).map { il.getString(it) }
            } else {
                emptyList()
            }
            fixtures.add(
                ParseCommandFixture(
                    description = obj.getString("description"),
                    rawQuery = input.getString("rawQuery"),
                    device = input.getString("device"),
                    ignoreList = ignoreList,
                    expectedType = expected.getString("type"),
                    expectedUrl = expected.optStringOrNull("url"),
                    expectedCommandId = expected.optStringOrNull("commandId"),
                    expectedMatchType = expected.optStringOrNull("matchType"),
                    expectedSuggestedTrigger = expected.optStringOrNull("suggestedTrigger"),
                )
            )
        }

        return fixtures.stream()
    }

    private fun loadTypoFixtures(): Stream<ParseCommandFixture> {
        val json = resolveSharedFile("test-fixtures/typo-detection.fixtures.json").readText()
        val arr = JSONArray(json)
        val fixtures = mutableListOf<ParseCommandFixture>()

        for (i in 0 until arr.length()) {
            val obj = arr.getJSONObject(i)
            val input = obj.getJSONObject("input")
            val expected = obj.getJSONObject("expected")
            val ignoreList = if (input.has("ignoreList")) {
                val il = input.getJSONArray("ignoreList")
                (0 until il.length()).map { il.getString(it) }
            } else {
                emptyList()
            }
            fixtures.add(
                ParseCommandFixture(
                    description = obj.getString("description"),
                    rawQuery = input.getString("rawQuery"),
                    device = input.getString("device"),
                    ignoreList = ignoreList,
                    expectedType = expected.getString("type"),
                    expectedUrl = expected.optStringOrNull("url"),
                    expectedCommandId = expected.optStringOrNull("commandId"),
                    expectedMatchType = expected.optStringOrNull("matchType"),
                    expectedSuggestedTrigger = expected.optStringOrNull("suggestedTrigger"),
                )
            )
        }

        return fixtures.stream()
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("loadParseCommandFixtures")
    @DisplayName("Parse command fixtures")
    fun `parse command fixtures`(fixture: ParseCommandFixture) {
        val input = ParseInput(
            rawQuery = fixture.rawQuery,
            device = DeviceType.fromString(fixture.device),
            config = config,
            ignoreList = fixture.ignoreList,
        )

        val result = CommandParser.parseCommand(input)

        when (fixture.expectedType) {
            "redirect" -> {
                assertTrue(result is ParseOutput.RedirectResult,
                    "${fixture.description}: expected redirect but got ${result::class.simpleName}")
                val redirect = result as ParseOutput.RedirectResult
                if (fixture.expectedUrl != null) {
                    assertEquals(fixture.expectedUrl, redirect.url,
                        "${fixture.description}: URL mismatch")
                }
                if (fixture.expectedCommandId != null) {
                    assertEquals(fixture.expectedCommandId, redirect.commandId,
                        "${fixture.description}: commandId mismatch")
                }
                if (fixture.expectedMatchType != null) {
                    assertEquals(fixture.expectedMatchType, redirect.matchType.value,
                        "${fixture.description}: matchType mismatch")
                }
            }
            "typo" -> {
                assertTrue(result is ParseOutput.TypoResult,
                    "${fixture.description}: expected typo but got ${result::class.simpleName}")
                val typo = result as ParseOutput.TypoResult
                if (fixture.expectedSuggestedTrigger != null) {
                    assertEquals(fixture.expectedSuggestedTrigger, typo.suggestedTrigger,
                        "${fixture.description}: suggestedTrigger mismatch")
                }
            }
            else -> throw IllegalArgumentException("Unknown expected type: ${fixture.expectedType}")
        }
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("loadTypoFixtures")
    @DisplayName("Typo detection fixtures")
    fun `typo detection fixtures`(fixture: ParseCommandFixture) {
        val input = ParseInput(
            rawQuery = fixture.rawQuery,
            device = DeviceType.fromString(fixture.device),
            config = config,
            ignoreList = fixture.ignoreList,
        )

        val result = CommandParser.parseCommand(input)

        when (fixture.expectedType) {
            "redirect" -> {
                assertTrue(result is ParseOutput.RedirectResult,
                    "${fixture.description}: expected redirect but got ${result::class.simpleName}")
                val redirect = result as ParseOutput.RedirectResult
                if (fixture.expectedMatchType != null) {
                    assertEquals(fixture.expectedMatchType, redirect.matchType.value,
                        "${fixture.description}: matchType mismatch")
                }
            }
            "typo" -> {
                assertTrue(result is ParseOutput.TypoResult,
                    "${fixture.description}: expected typo but got ${result::class.simpleName}")
                val typo = result as ParseOutput.TypoResult
                if (fixture.expectedSuggestedTrigger != null) {
                    assertEquals(fixture.expectedSuggestedTrigger, typo.suggestedTrigger,
                        "${fixture.description}: suggestedTrigger mismatch")
                }
            }
            else -> throw IllegalArgumentException("Unknown expected type: ${fixture.expectedType}")
        }
    }

    // --- Default engine independence (issue #27) --------------------------------

    private val ddgConfigJson = """
        {
          "version": 2,
          "defaultCommand": "ddg",
          "groups": [
            {
              "id": "engines",
              "name": "Engines",
              "commands": [
                {
                  "id": "duckduckgo",
                  "triggers": ["ddg"],
                  "name": "DuckDuckGo",
                  "type": "standard",
                  "routes": [
                    {
                      "devices": "*",
                      "defaultUrl": "https://duckduckgo.com",
                      "searchUrl": "https://duckduckgo.com/?q={query}"
                    }
                  ]
                }
              ]
            }
          ],
          "ignoreList": []
        }
    """.trimIndent()

    @Test
    @DisplayName("empty query redirects to the default engine's home, not Google")
    fun `empty query uses default engine home`() {
        val cfg = ConfigParser.parseConfig(ddgConfigJson)
        val result = CommandParser.parseCommand(
            ParseInput(rawQuery = "", device = DeviceType.fromString("Linux"), config = cfg)
        )
        assertTrue(result is ParseOutput.RedirectResult)
        result as ParseOutput.RedirectResult
        assertEquals("https://duckduckgo.com", result.url)
        assertEquals("duckduckgo", result.commandId)
    }

    @Test
    @DisplayName("an unmatched query searches the default engine, not Google")
    fun `unmatched query searches default engine`() {
        val cfg = ConfigParser.parseConfig(ddgConfigJson)
        val result = CommandParser.parseCommand(
            ParseInput(rawQuery = "some random thing", device = DeviceType.fromString("Linux"), config = cfg)
        )
        assertTrue(result is ParseOutput.RedirectResult)
        result as ParseOutput.RedirectResult
        assertEquals("https://duckduckgo.com/?q=some%20random%20thing", result.url)
        assertEquals("duckduckgo", result.commandId)
        assertEquals("default-search", result.matchType.value)
    }

    @Test
    @DisplayName("dismissing a typo (trigger ignored) searches the default engine, not Google")
    fun `typo dismissal re-parses to default engine`() {
        // Mirrors SearchViewModel.fallbackSearchAfterTypo(): re-parse with the
        // typo'd trigger forced into the ignore list -> a verbatim default-engine
        // search rather than a hard-coded Google URL.
        val cfg = ConfigParser.parseConfig(ddgConfigJson)
        val result = CommandParser.parseCommand(
            ParseInput(
                rawQuery = "ddh something",
                device = DeviceType.fromString("Linux"),
                config = cfg,
                ignoreList = listOf("ddh"),
            )
        )
        assertTrue(result is ParseOutput.RedirectResult)
        result as ParseOutput.RedirectResult
        assertEquals("https://duckduckgo.com/?q=ddh%20something", result.url)
    }

    @Test
    @DisplayName("falls back to the default command's home page when it has no searchUrl (not Google)")
    fun `no searchUrl falls back to default command home`() {
        val noSearchJson = """
            {
              "version": 2,
              "defaultCommand": "home",
              "groups": [
                {
                  "id": "grp",
                  "name": "Group",
                  "commands": [
                    {
                      "id": "home",
                      "triggers": ["home"],
                      "name": "Home",
                      "type": "standard",
                      "routes": [{ "devices": "*", "defaultUrl": "https://home.example.com" }]
                    }
                  ]
                }
              ],
              "ignoreList": []
            }
        """.trimIndent()
        val cfg = ConfigParser.parseConfig(noSearchJson)
        val result = CommandParser.parseCommand(
            ParseInput(rawQuery = "anything here", device = DeviceType.fromString("Linux"), config = cfg)
        )
        assertTrue(result is ParseOutput.RedirectResult)
        result as ParseOutput.RedirectResult
        assertEquals("https://home.example.com", result.url)
        assertEquals("home", result.commandId)
    }
}
