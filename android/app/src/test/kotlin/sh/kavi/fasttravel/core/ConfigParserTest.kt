package sh.kavi.fasttravel.core

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Test

class ConfigParserTest {

    @Test
    fun `parseConfig returns empty ignoreList when ignoreList key is absent`() {
        val json = """
            {
                "version": 1,
                "defaultCommand": "g",
                "groups": [
                    {
                        "id": "group1",
                        "name": "Group 1",
                        "commands": [
                            {
                                "id": "cmd1",
                                "triggers": ["g"],
                                "name": "Google",
                                "type": "search",
                                "routes": [
                                    {
                                        "devices": "*",
                                        "defaultUrl": "https://www.google.com",
                                        "searchUrl": "https://www.google.com/search?q={query}"
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        """.trimIndent()

        val config = ConfigParser.parseConfig(json)

        assertNotNull(config)
        assertEquals(emptyList<String>(), config.ignoreList)
    }

    @Test
    fun `defaultLuckyUrl survives a parse-write-parse round trip`() {
        val json = """
            {
              "version": 2,
              "defaultCommand": "g",
              "defaultLuckyUrl": "https://www.google.com/search?q={query}&btnI",
              "groups": [
                {
                  "id": "grp",
                  "name": "Group",
                  "commands": [
                    {
                      "id": "google",
                      "triggers": ["g"],
                      "name": "Google",
                      "type": "standard",
                      "routes": [{ "devices": "*", "defaultUrl": "https://www.google.com" }]
                    }
                  ]
                }
              ],
              "ignoreList": []
            }
        """.trimIndent()

        val parsed = ConfigParser.parseConfig(json)
        assertEquals(
            "https://www.google.com/search?q={query}&btnI",
            parsed.defaultLuckyUrl,
        )

        val rewritten = ConfigParser.parseConfig(ConfigWriter.writeConfig(parsed))
        assertEquals(
            "https://www.google.com/search?q={query}&btnI",
            rewritten.defaultLuckyUrl,
        )
    }
}
