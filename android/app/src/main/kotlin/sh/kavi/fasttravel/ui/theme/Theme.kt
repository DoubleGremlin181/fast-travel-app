package sh.kavi.fasttravel.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import sh.kavi.fasttravel.ui.appearance.ResolvedAppearance

val LocalAppearance = staticCompositionLocalOf<ResolvedAppearance> {
    error("No ResolvedAppearance provided — wrap your Composable in FastTravelTheme(...)")
}

@Composable
fun FastTravelTheme(
    appearance: ResolvedAppearance,
    content: @Composable () -> Unit,
) {
    CompositionLocalProvider(LocalAppearance provides appearance) {
        MaterialTheme(
            colorScheme = appearance.colorScheme,
            content = content,
        )
    }
}
