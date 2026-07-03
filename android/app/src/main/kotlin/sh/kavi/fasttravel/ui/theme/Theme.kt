package sh.kavi.fasttravel.ui.theme

import android.app.Activity
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import sh.kavi.fasttravel.ui.appearance.ResolvedAppearance

val LocalAppearance = staticCompositionLocalOf<ResolvedAppearance> {
    error("No ResolvedAppearance provided — wrap your Composable in FastTravelTheme(...)")
}

@Composable
fun FastTravelTheme(
    appearance: ResolvedAppearance,
    content: @Composable () -> Unit,
) {
    // Tint the status/navigation bar icons for the resolved app theme (not the
    // OS): dark icons on a light surface, light icons on a dark one. Updates
    // live when the appearance changes.
    val view = LocalView.current
    if (!view.isInEditMode) {
        val lightBars = !appearance.isDarkSurface
        SideEffect {
            val window = (view.context as? Activity)?.window ?: return@SideEffect
            val controller = WindowCompat.getInsetsController(window, view)
            controller.isAppearanceLightStatusBars = lightBars
            controller.isAppearanceLightNavigationBars = lightBars
        }
    }
    CompositionLocalProvider(LocalAppearance provides appearance) {
        MaterialTheme(
            colorScheme = appearance.colorScheme,
            content = content,
        )
    }
}
