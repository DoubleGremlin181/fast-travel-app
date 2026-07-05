package sh.kavi.fasttravel.ui

import android.app.Application
import android.content.ComponentName
import android.content.pm.PackageManager
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * The drawer/launcher icon follows the in-app theme by toggling two launcher
 * activity-aliases. These tests pin the decision (which alias for which surface) and
 * the enable/disable effect on PackageManager.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class)
class LauncherIconManagerTest {

    private val app: Application = ApplicationProvider.getApplicationContext()

    @Test
    fun `aliasFor picks the dark alias for a dark surface and light otherwise`() {
        assertEquals(LauncherIconManager.ALIAS_DARK, LauncherIconManager.aliasFor(isDark = true))
        assertEquals(LauncherIconManager.ALIAS_LIGHT, LauncherIconManager.aliasFor(isDark = false))
    }

    @Test
    fun `applyThemeIcon enables the dark alias and disables the light one`() {
        LauncherIconManager.applyThemeIcon(app, isDark = true)

        val pm = app.packageManager
        assertEquals(
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            pm.getComponentEnabledSetting(ComponentName(app.packageName, LauncherIconManager.ALIAS_DARK)),
        )
        assertEquals(
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            pm.getComponentEnabledSetting(ComponentName(app.packageName, LauncherIconManager.ALIAS_LIGHT)),
        )
    }

    @Test
    fun `applyThemeIcon flips back to the light alias for a light surface`() {
        LauncherIconManager.applyThemeIcon(app, isDark = true)
        LauncherIconManager.applyThemeIcon(app, isDark = false)

        val pm = app.packageManager
        assertEquals(
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            pm.getComponentEnabledSetting(ComponentName(app.packageName, LauncherIconManager.ALIAS_LIGHT)),
        )
        assertEquals(
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            pm.getComponentEnabledSetting(ComponentName(app.packageName, LauncherIconManager.ALIAS_DARK)),
        )
    }
}
