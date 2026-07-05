package sh.kavi.fasttravel.ui

import android.app.Activity
import android.app.ActivityManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.compose.ui.graphics.toArgb
import androidx.core.content.ContextCompat
import sh.kavi.fasttravel.R
import sh.kavi.fasttravel.ui.appearance.ResolvedAppearance

/**
 * Drives the two launcher-facing surfaces that should follow the in-app theme:
 *  - the drawer/launcher icon, via two activity-aliases toggled here, and
 *  - the recents/overview card, via [Activity.setTaskDescription].
 *
 * The Settings > Apps listing uses the `<application>` icon, which is fixed at build
 * time and can't follow the in-app theme at runtime — an OS limitation, not handled here.
 */
object LauncherIconManager {
    // Fully-qualified names of the launcher activity-aliases declared in AndroidManifest.
    const val ALIAS_LIGHT = "sh.kavi.fasttravel.ui.LauncherLight"
    const val ALIAS_DARK = "sh.kavi.fasttravel.ui.LauncherDark"

    /** The launcher alias that should be enabled for the given surface darkness. */
    fun aliasFor(isDark: Boolean): String = if (isDark) ALIAS_DARK else ALIAS_LIGHT

    /**
     * Opaque ARGB used to tint the recents card header. `TaskDescription` requires an
     * opaque primary color, so the alpha byte is forced to 0xFF.
     */
    fun recentsPrimaryColor(appearance: ResolvedAppearance): Int =
        appearance.colorScheme.background.toArgb() or 0xFF000000.toInt()

    /**
     * Enable the alias matching [isDark] and disable the other, so exactly one launcher
     * icon is ever live. Idempotent: no-ops when already in the desired state to avoid
     * redundant PackageManager writes / icon flicker. `DONT_KILL_APP` keeps the running
     * task alive; callers switch on `onStop()` so flipping the live launcher component
     * can't drop the task from recents.
     */
    fun applyThemeIcon(context: Context, isDark: Boolean) {
        val pm = context.packageManager
        val pkg = context.packageName
        val enable = ComponentName(pkg, aliasFor(isDark))
        val disable = ComponentName(pkg, aliasFor(!isDark))

        val alreadyApplied =
            pm.getComponentEnabledSetting(enable) == PackageManager.COMPONENT_ENABLED_STATE_ENABLED &&
                pm.getComponentEnabledSetting(disable) == PackageManager.COMPONENT_ENABLED_STATE_DISABLED
        if (alreadyApplied) return

        // Enable the target before disabling the other so at least one alias is always on.
        pm.setComponentEnabledSetting(
            enable,
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            PackageManager.DONT_KILL_APP,
        )
        pm.setComponentEnabledSetting(
            disable,
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP,
        )
    }

    /**
     * Point the recents/overview card at the current theme: an opaque header color and a
     * themed icon rendered from the matching adaptive launcher icon. The header color is
     * honored broadly across OEMs; the icon is best-effort (many launchers reuse the
     * activity-alias icon in recents anyway, which we already theme).
     */
    fun applyTaskDescription(activity: Activity, appearance: ResolvedAppearance) {
        val label = activity.getString(R.string.app_name)
        val color = recentsPrimaryColor(appearance)
        val iconRes = if (appearance.isDarkSurface) R.mipmap.ic_launcher_dark else R.mipmap.ic_launcher
        @Suppress("DEPRECATION")
        activity.setTaskDescription(
            ActivityManager.TaskDescription(label, renderIcon(activity, iconRes), color),
        )
    }

    /** Rasterize an (adaptive) launcher icon drawable into a square bitmap for recents. */
    private fun renderIcon(context: Context, resId: Int, sizePx: Int = 192): Bitmap? {
        val drawable = ContextCompat.getDrawable(context, resId) ?: return null
        val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        drawable.setBounds(0, 0, sizePx, sizePx)
        drawable.draw(canvas)
        return bitmap
    }
}
