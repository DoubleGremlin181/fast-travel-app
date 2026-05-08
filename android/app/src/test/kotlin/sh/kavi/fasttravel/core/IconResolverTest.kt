package sh.kavi.fasttravel.core

import org.json.JSONObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import java.io.File

class IconResolverTest {

    @TestFactory
    fun `resolveIconUrl matches shared fixtures`(): List<DynamicTest> {
        val candidates = listOf(
            "../shared/test-fixtures/icon-resolution.fixtures.json",
            "../../shared/test-fixtures/icon-resolution.fixtures.json",
            "../../../shared/test-fixtures/icon-resolution.fixtures.json",
        )
        val fixtureFile = candidates
            .map { File(it) }
            .firstOrNull { it.exists() }
            ?: error("Cannot locate icon-resolution.fixtures.json relative to ${File(".").absolutePath}")

        val cases = JSONObject(fixtureFile.readText()).getJSONArray("cases")
        val tests = mutableListOf<DynamicTest>()
        for (i in 0 until cases.length()) {
            val case = cases.getJSONObject(i)
            val name = case.getString("name")
            val cmdJson = case.getJSONObject("command")
            val device = DeviceType.fromString(case.getString("device"))
            val expected = if (case.isNull("expected")) null else case.getString("expected")

            val overrides = mutableListOf<IconOverride>()
            val overridesJson = cmdJson.optJSONArray("iconOverrides")
            if (overridesJson != null) {
                for (j in 0 until overridesJson.length()) {
                    val ov = overridesJson.getJSONObject(j)
                    val devArr = ov.getJSONArray("devices")
                    val devs = (0 until devArr.length()).map { DeviceType.fromString(devArr.getString(it)) }
                    overrides.add(IconOverride(devices = devs, iconUrl = ov.getString("iconUrl")))
                }
            }
            val cmd = Command(
                id = "fixture-$i",
                triggers = listOf("x"),
                name = "X",
                type = CommandType.Standard,
                iconUrl = if (cmdJson.has("iconUrl")) cmdJson.getString("iconUrl") else null,
                iconOverrides = overrides,
                routes = listOf(Route(devices = RouteDevices.Wildcard, defaultUrl = "https://example.com")),
            )

            tests.add(
                DynamicTest.dynamicTest("case: $name") {
                    assertEquals(expected, resolveIconUrl(cmd, device))
                },
            )
        }
        return tests
    }
}
