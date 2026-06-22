package sh.kavi.fasttravel.core

import org.json.JSONArray
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.TestInstance
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import java.io.File
import java.util.stream.Stream

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class FrecencyTest {

    private val dayMs = 86_400_000L

    data class FrecencyFixture(
        val description: String,
        val commandIds: List<String>,
        val nowMs: Long,
        val history: List<Frecency.HistoryEntry>,
        val expected: List<String>,
    )

    private fun resolveSharedFile(relativePath: String): File {
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

    private fun loadFixtures(): Stream<FrecencyFixture> {
        val json = resolveSharedFile("test-fixtures/frecency.fixtures.json").readText()
        val arr = JSONArray(json)
        val fixtures = mutableListOf<FrecencyFixture>()
        for (i in 0 until arr.length()) {
            val obj = arr.getJSONObject(i)
            val nowMs = obj.getLong("nowMs")
            val idsArr = obj.getJSONArray("commandIds")
            val ids = (0 until idsArr.length()).map { idsArr.getString(it) }
            val histArr = obj.getJSONArray("history")
            val history = (0 until histArr.length()).map {
                val h = histArr.getJSONObject(it)
                Frecency.HistoryEntry(
                    commandId = h.getString("commandId"),
                    timestamp = nowMs - h.getLong("ageDays") * dayMs,
                )
            }
            val expArr = obj.getJSONArray("expected")
            val expected = (0 until expArr.length()).map { expArr.getString(it) }
            fixtures.add(
                FrecencyFixture(obj.getString("description"), ids, nowMs, history, expected)
            )
        }
        return fixtures.stream()
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("loadFixtures")
    @DisplayName("rankByFrecency shared fixtures")
    fun `frecency fixtures`(fixture: FrecencyFixture) {
        assertEquals(
            fixture.expected,
            Frecency.rank(fixture.commandIds, fixture.history, fixture.nowMs),
            fixture.description,
        )
    }
}
