package sh.kavi.fasttravel.ui

import android.app.Application
import android.content.ComponentName
import android.content.pm.PackageManager
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * The drawer/launcher icon is served by two activity-aliases. Launchers (gestures,
 * pinned shortcuts, home-screen databases) store the ComponentName that was enabled
 * when the user set them up and launch it explicitly; a component in
 * COMPONENT_ENABLED_STATE_DISABLED makes that launch throw ActivityNotFoundException
 * inside the launcher (Lawnchair crashes outright). So the contract pinned here is:
 *
 *  - By default (themed icon OFF) the light alias is always the enabled one and is
 *    never disabled by a theme change — stored references stay launchable forever.
 *  - Theme-following is opt-in (followTheme = true) and keeps the old flip behavior.
 *  - Turning the opt-in off restores the stable light alias (migration path for
 *    devices coming from 2.1.6 where the dark alias may be the live one).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class)
class LauncherIconManagerTest {

    private val app: Application = ApplicationProvider.getApplicationContext()

    private fun enabledState(alias: String): Int =
        app.packageManager.getComponentEnabledSetting(ComponentName(app.packageName, alias))

    @Test
    fun `aliasFor picks the dark alias for a dark surface and light otherwise`() {
        assertEquals(LauncherIconManager.ALIAS_DARK, LauncherIconManager.aliasFor(isDark = true))
        assertEquals(LauncherIconManager.ALIAS_LIGHT, LauncherIconManager.aliasFor(isDark = false))
    }

    // ==== Default (themed icon OFF): stored launcher components must stay launchable ====

    @Test
    fun `by default a dark theme never disables the light alias a launcher may have stored`() {
        // Lawnchair gesture set up while the light alias was live stores
        // sh.kavi.fasttravel.ui.LauncherLight. A later dark theme pass must not
        // disable it, or the gesture launch throws ActivityNotFoundException.
        LauncherIconManager.applyThemeIcon(app, isDark = true, followTheme = false)

        assertNotEquals(
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            enabledState(LauncherIconManager.ALIAS_LIGHT),
        )
        assertEquals(
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            enabledState(LauncherIconManager.ALIAS_DARK),
        )
    }

    @Test
    fun `disabling theme-following restores the stable light alias after a dark flip`() {
        // Migration from 2.1.6: the dark alias may be the live launcher component.
        // With the opt-in off, the next pass must converge back to the light alias
        // no matter what the current theme is.
        LauncherIconManager.applyThemeIcon(app, isDark = true, followTheme = true)
        LauncherIconManager.applyThemeIcon(app, isDark = true, followTheme = false)

        assertEquals(
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            enabledState(LauncherIconManager.ALIAS_LIGHT),
        )
        assertEquals(
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            enabledState(LauncherIconManager.ALIAS_DARK),
        )
    }

    // ==== Opt-in (themed icon ON): the original flip behavior ====

    @Test
    fun `opted in, a dark surface enables the dark alias and disables the light one`() {
        LauncherIconManager.applyThemeIcon(app, isDark = true, followTheme = true)

        assertEquals(
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            enabledState(LauncherIconManager.ALIAS_DARK),
        )
        assertEquals(
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            enabledState(LauncherIconManager.ALIAS_LIGHT),
        )
    }

    @Test
    fun `opted in, flips back to the light alias for a light surface`() {
        LauncherIconManager.applyThemeIcon(app, isDark = true, followTheme = true)
        LauncherIconManager.applyThemeIcon(app, isDark = false, followTheme = true)

        assertEquals(
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            enabledState(LauncherIconManager.ALIAS_LIGHT),
        )
        assertEquals(
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            enabledState(LauncherIconManager.ALIAS_DARK),
        )
    }
}
