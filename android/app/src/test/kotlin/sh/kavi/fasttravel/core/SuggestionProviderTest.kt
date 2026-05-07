package sh.kavi.fasttravel.core

import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import java.net.ServerSocket
import java.net.Socket

/**
 * Unit tests for [SuggestionProvider], specifically the case-insensitive trigger-prefix
 * stripping logic applied when mapping API suggestions back to display text.
 *
 * A minimal raw-socket HTTP/1.0 stub server is used so the full
 * [SuggestionProvider.fetchSuggestions] path executes end-to-end without touching the network.
 */
class SuggestionProviderTest {

    private lateinit var serverSocket: ServerSocket
    private lateinit var serverThread: Thread
    private var serverPort: Int = 0

    /** The raw suggestion strings the stub server will return in its next response. */
    private val stubSuggestions = mutableListOf<String>()

    @BeforeEach
    fun startServer() {
        serverSocket = ServerSocket(0) // OS assigns a free port
        serverPort = serverSocket.localPort

        serverThread = Thread {
            while (!serverSocket.isClosed) {
                val client: Socket = try {
                    serverSocket.accept()
                } catch (_: Exception) {
                    break
                }
                try {
                    // Drain the request (we don't care about it)
                    val input = client.getInputStream().bufferedReader()
                    while (input.readLine()?.isNotEmpty() == true) { /* consume headers */ }

                    // Build OpenSearch-format response: ["q", ["sug1", "sug2", ...]]
                    val sugJson = stubSuggestions
                        .joinToString(",") { "\"${it.replace("\"", "\\\"")}\"" }
                    val body = "[\"q\",[$sugJson]]"
                    val response = "HTTP/1.0 200 OK\r\n" +
                        "Content-Type: application/json\r\n" +
                        "Content-Length: ${body.length}\r\n" +
                        "\r\n" +
                        body
                    client.getOutputStream().write(response.toByteArray())
                } finally {
                    client.close()
                }
            }
        }
        serverThread.isDaemon = true
        serverThread.start()
    }

    @AfterEach
    fun stopServer() {
        serverSocket.close()
        serverThread.join(500)
    }

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    /**
     * Build a minimal config with one Standard command that has no [Command.suggestionsApi] of
     * its own, so [SuggestionProvider] will fall through to [FastTravelConfig.defaultSuggestionsApi]
     * and prefix the trigger into the query sent upstream.
     */
    private fun configWithTrigger(trigger: String): FastTravelConfig {
        val command = Command(
            id = "test-cmd",
            triggers = listOf(trigger),
            name = "Test Command",
            type = CommandType.Standard,
            routes = listOf(
                Route(
                    devices = RouteDevices.Wildcard,
                    defaultUrl = "https://example.com",
                    searchUrl = "https://example.com/search?q={query}",
                )
            ),
        )
        return FastTravelConfig(
            version = 1,
            defaultCommand = "test-cmd",
            defaultSuggestionsApi = "http://localhost:$serverPort/suggest?q={query}",
            groups = listOf(Group(id = "g", name = "G", commands = listOf(command))),
            ignoreList = emptyList(),
        )
    }

    private fun suggestions(trigger: String, terms: String): List<Suggestion> = runBlocking {
        SuggestionProvider.fetchSuggestions("$trigger $terms", configWithTrigger(trigger))
    }

    // ---------------------------------------------------------------------------
    // Tests
    // ---------------------------------------------------------------------------

    @Test
    @DisplayName("uppercase trigger, lowercase API echo — display text strips prefix correctly")
    fun `uppercase trigger with lowercased API echo strips prefix`() {
        // Trigger is "YT"; upstream returns "yt cats" (lowercase echo).
        // Before the fix, removePrefix("YT ") was a no-op → displayText was "yt cats"
        // and the full suggestion text was "YT yt cats".
        stubSuggestions.clear()
        stubSuggestions.add("yt cats")

        val results = suggestions("YT", "cats")

        assertEquals(1, results.size)
        assertEquals(
            "cats",
            results[0].displayText,
            "displayText should be 'cats' after stripping the lowercased prefix",
        )
        assertEquals(
            "yt cats",
            results[0].text,
            "text uses the matched trigger (lowercased), which the parser accepts",
        )
    }

    @Test
    @DisplayName("mixed-case trigger, lowercase API echo — display text strips prefix correctly")
    fun `mixed-case trigger with lowercase API echo strips prefix`() {
        // Trigger "Gh"; upstream echoes "gh /torvalds".
        stubSuggestions.clear()
        stubSuggestions.add("gh /torvalds")

        val results = suggestions("Gh", "/torvalds")

        assertEquals(1, results.size)
        assertEquals(
            "/torvalds",
            results[0].displayText,
            "displayText should be '/torvalds'",
        )
        assertEquals(
            "gh /torvalds",
            results[0].text,
            "text uses the matched trigger (lowercased), which the parser accepts",
        )
    }

    @Test
    @DisplayName("lowercase trigger, matching API echo — display text strips prefix (regression)")
    fun `lowercase trigger with matching API echo strips prefix`() {
        // Regression guard: the original case still works after the fix.
        stubSuggestions.clear()
        stubSuggestions.add("g search term")

        val results = suggestions("g", "search term")

        assertEquals(1, results.size)
        assertEquals(
            "search term",
            results[0].displayText,
            "displayText should be 'search term'",
        )
        assertEquals(
            "g search term",
            results[0].text,
            "text should be 'g search term'",
        )
    }
}
