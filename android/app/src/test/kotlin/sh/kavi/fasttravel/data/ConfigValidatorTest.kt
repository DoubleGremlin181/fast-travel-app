package sh.kavi.fasttravel.data

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import sh.kavi.fasttravel.core.Command
import sh.kavi.fasttravel.core.CommandType
import sh.kavi.fasttravel.core.DeviceType
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
