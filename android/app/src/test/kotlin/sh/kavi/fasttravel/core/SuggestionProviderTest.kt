package sh.kavi.fasttravel.core

import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import java.net.ServerSocket
import java.net.Socket
import java.nio.charset.Charset

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

    /** Charset the stub server encodes its body with. */
    private var stubCharset: Charset = Charsets.UTF_8

    /**
     * Whether the stub server advertises [stubCharset] in its Content-Type header.
     * When false the header is a bare `application/json`, mimicking servers that
     * omit the parameter (the client must then assume UTF-8).
     */
    private var stubDeclaresCharset: Boolean = true

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
                    val body = "[\"q\",[$sugJson]]".toByteArray(stubCharset)
                    val contentType = if (stubDeclaresCharset)
                        "application/json; charset=${stubCharset.name()}"
                    else
                        "application/json"
                    val headers = "HTTP/1.0 200 OK\r\n" +
                        "Content-Type: $contentType\r\n" +
                        "Content-Length: ${body.size}\r\n" +
                        "\r\n"
                    client.getOutputStream().apply {
                        write(headers.toByteArray(Charsets.US_ASCII))
                        write(body)
                        flush()
                    }
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
        stubCharset = Charsets.UTF_8
        stubDeclaresCharset = true
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

    // ---------------------------------------------------------------------------
    // Response charset handling
    // ---------------------------------------------------------------------------

    @Test
    @DisplayName("ISO-8859-1 response body is decoded using the declared charset")
    fun `latin1 response body decodes accented characters`() {
        // Google's suggest endpoint answers "charset=ISO-8859-1" unless asked
        // otherwise; "é" is the single byte 0xE9 there. Decoding it as UTF-8
        // produced U+FFFD ("pok\uFFFDmon"), which then leaked into the search.
        stubCharset = Charsets.ISO_8859_1
        stubSuggestions.clear()
        stubSuggestions.add("pokémon")
        stubSuggestions.add("pokémon go")

        val results = suggestions("g", "poké")

        assertEquals(listOf("pokémon", "pokémon go"), results.map { it.displayText })
        assertEquals("g pokémon", results[0].text)
    }

    @Test
    @DisplayName("UTF-8 response body with explicit charset decodes accented characters")
    fun `utf8 response body with explicit charset decodes accented characters`() {
        stubCharset = Charsets.UTF_8
        stubSuggestions.clear()
        stubSuggestions.add("pokémon")
        stubSuggestions.add("日本語")

        val results = suggestions("g", "poké")

        assertEquals(listOf("pokémon", "日本語"), results.map { it.displayText })
    }

    @Test
    @DisplayName("response without a charset parameter is treated as UTF-8")
    fun `missing charset parameter falls back to utf8`() {
        stubCharset = Charsets.UTF_8
        stubDeclaresCharset = false
        stubSuggestions.clear()
        stubSuggestions.add("pokémon")

        val results = suggestions("g", "poké")

        assertEquals(listOf("pokémon"), results.map { it.displayText })
    }

    @Test
    @DisplayName("charsetFrom parses Content-Type values and falls back to UTF-8")
    fun `charsetFrom handles header variants`() {
        assertEquals(Charsets.ISO_8859_1, SuggestionProvider.charsetFrom("text/javascript; charset=ISO-8859-1"))
        assertEquals(Charsets.UTF_8, SuggestionProvider.charsetFrom("application/json; charset=utf-8"))
        assertEquals(Charsets.UTF_8, SuggestionProvider.charsetFrom("application/json;charset=\"UTF-8\""))
        assertEquals(Charsets.ISO_8859_1, SuggestionProvider.charsetFrom("text/plain; CHARSET=iso-8859-1; foo=bar"))
        assertEquals(Charsets.UTF_8, SuggestionProvider.charsetFrom("application/json"))
        assertEquals(Charsets.UTF_8, SuggestionProvider.charsetFrom(null))
        assertEquals(Charsets.UTF_8, SuggestionProvider.charsetFrom("text/plain; charset=not-a-real-charset"))
    }
}
