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
class NormalizeTest {

    data class NormalizeFixture(
        val description: String,
        val input: String,
        val steps: List<NormalizeStep>,
        val expected: String,
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

    private fun loadFixtures(): Stream<NormalizeFixture> {
        val json = resolveSharedFile("test-fixtures/normalize.fixtures.json").readText()
        val arr = JSONArray(json)
        val fixtures = mutableListOf<NormalizeFixture>()
        for (i in 0 until arr.length()) {
            val obj = arr.getJSONObject(i)
            val stepsArr = obj.getJSONArray("steps")
            val steps = (0 until stepsArr.length()).mapNotNull {
                NormalizeStep.fromString(stepsArr.getString(it))
            }
            fixtures.add(
                NormalizeFixture(
                    description = obj.getString("description"),
                    input = obj.getString("input"),
                    steps = steps,
                    expected = obj.getString("expected"),
                )
            )
        }
        return fixtures.stream()
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("loadFixtures")
    @DisplayName("normalizeArgs shared fixtures")
    fun `normalize fixtures`(fixture: NormalizeFixture) {
        assertEquals(
            fixture.expected,
            CommandParser.normalizeArgs(fixture.input, fixture.steps),
            fixture.description,
        )
    }
}
