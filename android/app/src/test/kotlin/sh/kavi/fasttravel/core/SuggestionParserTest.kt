package sh.kavi.fasttravel.core

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test

/**
 * Unit tests for the response-shape parser inside [SuggestionProvider].
 * Covers each format the parser understands so a regression in one branch
 * doesn't go unnoticed because another shape happens to match.
 */
class SuggestionParserTest {

    @Test
    @DisplayName("OpenSearch — extracts the suggestions array, capped at 8")
    fun openSearchFormat() {
        val json = """["query",["a","b","c"]]"""
        assertEquals(listOf("a", "b", "c"), SuggestionProvider.parseResponse(json))
    }

    @Test
    @DisplayName("DuckDuckGo — maps each {phrase} object to its phrase")
    fun duckDuckGoFormat() {
        val json = """[{"phrase":"hello world"},{"phrase":"hello there"}]"""
        assertEquals(listOf("hello world", "hello there"), SuggestionProvider.parseResponse(json))
    }

    @Test
    @DisplayName("Plain string array — passes strings through")
    fun plainStringArray() {
        val json = """["alpha","beta"]"""
        assertEquals(listOf("alpha", "beta"), SuggestionProvider.parseResponse(json))
    }

    @Test
    @DisplayName("Lyrics.ovh — formats each track as 'Title — Artist'")
    fun lyricsOvhFormat() {
        val json = """
            {
              "data": [
                {"title":"Hey Jude","artist":{"name":"The Beatles"}},
                {"title":"Hello","artist":{"name":"Adele"}}
              ]
            }
        """.trimIndent()
        assertEquals(
            listOf("Hey Jude — The Beatles", "Hello — Adele"),
            SuggestionProvider.parseResponse(json),
        )
    }

    @Test
    @DisplayName("Lyrics.ovh — falls back to title-only when artist is missing")
    fun lyricsOvhMissingArtist() {
        val json = """{"data":[{"title":"Solo Title"}]}"""
        assertEquals(listOf("Solo Title"), SuggestionProvider.parseResponse(json))
    }

    @Test
    @DisplayName("Lyrics.ovh — empty data array yields empty list")
    fun lyricsOvhEmpty() {
        val json = """{"data":[]}"""
        assertTrue(SuggestionProvider.parseResponse(json).isEmpty())
    }

    @Test
    @DisplayName("Unknown shape — returns empty list rather than throwing")
    fun unknownShape() {
        val json = """{"unexpected":true}"""
        assertTrue(SuggestionProvider.parseResponse(json).isEmpty())
    }

    @Test
    @DisplayName("Invalid JSON — returns empty list rather than throwing")
    fun invalidJson() {
        assertTrue(SuggestionProvider.parseResponse("not json at all").isEmpty())
    }
}
