package sh.kavi.fasttravel.data

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import sh.kavi.fasttravel.core.Command
import sh.kavi.fasttravel.core.CommandType
import sh.kavi.fasttravel.core.DeviceType
import sh.kavi.fasttravel.core.FastTravelConfig
import sh.kavi.fasttravel.core.Group
import sh.kavi.fasttravel.core.IconOverride
import sh.kavi.fasttravel.core.Route
import sh.kavi.fasttravel.core.RouteDevices

class ConfigValidatorTest {

    private fun baseCommand(iconOverrides: List<IconOverride> = emptyList()) = Command(
        id = "test-cmd",
        triggers = listOf("t"),
        name = "Test",
        type = CommandType.Standard,
        iconOverrides = iconOverrides,
        routes = listOf(
            Route(devices = RouteDevices.Wildcard, defaultUrl = "https://example.com"),
        ),
    )

    /** Minimal valid whole-config fixture; each test overrides just what it needs. */
    private fun baseConfig(defaultLuckyUrl: String? = null) = FastTravelConfig(
        version = 1,
        defaultCommand = "t",
        defaultLuckyUrl = defaultLuckyUrl,
        groups = listOf(Group(id = "g", name = "G", commands = listOf(baseCommand()))),
        ignoreList = emptyList(),
    )

    @Test
    fun `defaultLuckyUrl null is valid`() {
        val errors = ConfigValidator.validate(baseConfig(defaultLuckyUrl = null))
        assertEquals(emptyList<String>(), errors)
    }

    @Test
    fun `defaultLuckyUrl with query placeholder is valid`() {
        val errors = ConfigValidator.validate(
            baseConfig(defaultLuckyUrl = "https://www.google.com/search?q={query}&btnI"),
        )
        assertEquals(emptyList<String>(), errors)
    }

    @Test
    fun `defaultLuckyUrl missing query placeholder is rejected`() {
        val errors = ConfigValidator.validate(
            baseConfig(defaultLuckyUrl = "https://www.google.com/search?q=foo"),
        )
        assertTrue(
            errors.any { it.contains("Default lucky URL") },
            "expected a Default lucky URL error, got: $errors",
        )
    }

    @Test
    fun `defaultLuckyUrl with non-http scheme is rejected`() {
        val errors = ConfigValidator.validate(
            baseConfig(defaultLuckyUrl = "ftp://example.com/{query}"),
        )
        assertTrue(
            errors.any { it.contains("Default lucky URL") },
            "expected a Default lucky URL error, got: $errors",
        )
    }

    @Test
    fun `valid iconOverrides pass validation`() {
        val cmd = baseCommand(
            iconOverrides = listOf(
                IconOverride(devices = listOf(DeviceType.iOS), iconUrl = "https://example.com/ios.png"),
                IconOverride(
                    devices = listOf(DeviceType.Windows, DeviceType.MacOS, DeviceType.Linux),
                    iconUrl = "https://example.com/steam.png",
                ),
            ),
        )
        val errors = ConfigValidator.validateCommand(cmd)
        assertEquals(emptyList<String>(), errors)
    }

    @Test
    fun `iconOverrides rejects duplicate devices across entries`() {
        val cmd = baseCommand(
            iconOverrides = listOf(
                IconOverride(devices = listOf(DeviceType.Android), iconUrl = "https://example.com/a.png"),
                IconOverride(devices = listOf(DeviceType.Android), iconUrl = "https://example.com/b.png"),
            ),
        )
        val errors = ConfigValidator.validateCommand(cmd)
        assertTrue(
            errors.any { it.contains("iconOverrides") && it.contains("Android") },
            "expected an iconOverrides duplicate-device error mentioning Android, got: $errors",
        )
    }

    @Test
    fun `iconOverrides rejects empty devices list`() {
        val cmd = baseCommand(
            iconOverrides = listOf(
                IconOverride(devices = emptyList(), iconUrl = "https://example.com/a.png"),
            ),
        )
        val errors = ConfigValidator.validateCommand(cmd)
        assertTrue(
            errors.any { it.contains("iconOverrides[0]") && it.contains("devices") },
            "expected an iconOverrides[0] devices error, got: $errors",
        )
    }

    @Test
    fun `iconOverrides rejects blank iconUrl`() {
        val cmd = baseCommand(
            iconOverrides = listOf(
                IconOverride(devices = listOf(DeviceType.iOS), iconUrl = ""),
            ),
        )
        val errors = ConfigValidator.validateCommand(cmd)
        assertTrue(
            errors.any { it.contains("iconOverrides[0]") && it.contains("iconUrl") },
            "expected an iconOverrides[0] iconUrl error, got: $errors",
        )
    }

    @Test
    fun `iconOverrides empty list is valid`() {
        val cmd = baseCommand(iconOverrides = emptyList())
        val errors = ConfigValidator.validateCommand(cmd)
        assertEquals(emptyList<String>(), errors)
    }
}
