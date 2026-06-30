package sh.kavi.fasttravel.localsearch.query

import org.json.JSONObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.TestInstance
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import java.io.File
import java.util.stream.Stream

/**
 * Parity gate: drives all 15 cases in shared/companion-protocol/fixtures/query-parsing.json.
 * Every case must produce the exact AST listed in the fixture.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ParserParityTest {

    data class ParserCase(
        val name: String,
        val query: String,
        val queryMode: QueryMode,
        val expectedAst: Node,
    ) {
        override fun toString(): String = name
    }

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

    private fun nodeFromJson(obj: JSONObject): Node {
        val op = obj.getString("op")
        val nodes = if (obj.has("nodes")) {
            val arr = obj.getJSONArray("nodes")
            (0 until arr.length()).map { nodeFromJson(arr.getJSONObject(it)) }
        } else null
        val node = if (obj.has("node")) nodeFromJson(obj.getJSONObject("node")) else null
        val field = if (obj.has("field")) obj.getString("field") else null
        val value = if (obj.has("value")) obj.getString("value") else null
        val wildcard = if (obj.has("wildcard")) obj.getBoolean("wildcard") else null
        return Node(op = op, nodes = nodes, node = node, field = field, value = value, wildcard = wildcard)
    }

    private fun loadCases(): Stream<ParserCase> {
        val json = resolveSharedFile("companion-protocol/fixtures/query-parsing.json").readText()
        val root = JSONObject(json)
        val arr = root.getJSONArray("cases")
        val cases = (0 until arr.length()).map { i ->
            val obj = arr.getJSONObject(i)
            ParserCase(
                name = obj.getString("name"),
                query = obj.getString("query"),
                queryMode = QueryMode.fromString(obj.getString("queryMode")),
                expectedAst = nodeFromJson(obj.getJSONObject("ast")),
            )
        }
        return cases.stream()
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("loadCases")
    @DisplayName("query-parsing.json parity – all 15 cases")
    fun `parser parity`(case: ParserCase) {
        val result = parse(case.query, case.queryMode)
        assertEquals(case.expectedAst, result, "Case '${case.name}': parse(\"${case.query}\", ${case.queryMode}) AST mismatch")
    }
}
