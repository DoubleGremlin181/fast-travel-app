package sh.kavi.fasttravel.deeplink

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class DeepLinkQueryParserTest {

    @Test
    fun `extractQueryFromUrl returns q param from fasttravel scheme`() {
        assertEquals(
            "yt cats",
            DeepLinkQueryParser.extractQueryFromUrl("fasttravel://search?q=yt%20cats"),
        )
    }

    @Test
    fun `extractQueryFromUrl decodes plus as space`() {
        assertEquals(
            "g hello world",
            DeepLinkQueryParser.extractQueryFromUrl("fasttravel://search?q=g+hello+world"),
        )
    }

    @Test
    fun `extractQueryFromUrl returns empty string for empty q`() {
        // An empty q= yields "" which is considered missing for our purposes.
        assertEquals(
            "",
            DeepLinkQueryParser.extractQueryFromUrl("fasttravel://search?q="),
        )
    }

    @Test
    fun `extractQueryFromUrl returns null without query string`() {
        assertNull(DeepLinkQueryParser.extractQueryFromUrl("fasttravel://search"))
    }

    @Test
    fun `extractQueryFromUrl returns null for non-fasttravel schemes`() {
        assertNull(DeepLinkQueryParser.extractQueryFromUrl("https://example.com/search?q=foo"))
    }

    @Test
    fun `extractQueryFromUrl handles null and blank`() {
        assertNull(DeepLinkQueryParser.extractQueryFromUrl(null))
        assertNull(DeepLinkQueryParser.extractQueryFromUrl(""))
        assertNull(DeepLinkQueryParser.extractQueryFromUrl("   "))
    }

    @Test
    fun `extractQueryFromUrl ignores other params`() {
        assertEquals(
            "github issues",
            DeepLinkQueryParser.extractQueryFromUrl("fasttravel://search?source=widget&q=github%20issues&foo=bar"),
        )
    }

    @Test
    fun `extractQueryFromSearchAction reads query extra for ACTION_SEARCH`() {
        assertEquals(
            "hello",
            DeepLinkQueryParser.extractQueryFromSearchAction(
                action = "android.intent.action.SEARCH",
                queryExtra = "hello",
                searchManagerQueryExtra = null,
            ),
        )
    }

    @Test
    fun `extractQueryFromSearchAction falls back to SearchManager QUERY extra`() {
        assertEquals(
            "fallback",
            DeepLinkQueryParser.extractQueryFromSearchAction(
                action = "android.intent.action.WEB_SEARCH",
                queryExtra = null,
                searchManagerQueryExtra = "fallback",
            ),
        )
    }

    @Test
    fun `extractQueryFromSearchAction returns null for unrelated actions`() {
        assertNull(
            DeepLinkQueryParser.extractQueryFromSearchAction(
                action = "android.intent.action.VIEW",
                queryExtra = "should-not-read",
                searchManagerQueryExtra = "also-ignored",
            ),
        )
    }

    @Test
    fun `extractQueryFromSearchAction handles GLOBAL_SEARCH`() {
        assertEquals(
            "global q",
            DeepLinkQueryParser.extractQueryFromSearchAction(
                action = "android.search.action.GLOBAL_SEARCH",
                queryExtra = "global q",
                searchManagerQueryExtra = null,
            ),
        )
    }
}
