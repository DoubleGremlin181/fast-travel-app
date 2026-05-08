package sh.kavi.fasttravel.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import sh.kavi.fasttravel.ui.theme.LocalAppearance

/**
 * Pure-Compose rendering of the home-screen widget. Reads appearance from
 * [LocalAppearance] so it shares exactly the same brushes/borders/shape as
 * the in-app [SearchBarPill]. Callers that want to preview a draft appearance
 * wrap this in `CompositionLocalProvider(LocalAppearance provides draft) { WidgetPreview(...) }`.
 *
 * [opacityPercent] is rendered as a compositing alpha on the whole preview, matching
 * how the live widget applies widgetOpacity to its fill.
 */
@Composable
fun WidgetPreview(
    opacityPercent: Int,
    modifier: Modifier = Modifier,
    height: androidx.compose.ui.unit.Dp = 56.dp,
    showHint: Boolean = true,
) {
    val appearance = LocalAppearance.current
    val alpha = (opacityPercent.coerceIn(0, 100) / 100f)
    val shape = RoundedCornerShape(appearance.shape.cornerRadiusDp.dp)
    val border = appearance.searchBarBorder

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(height)
            .alpha(alpha)
            .clip(shape)
            .background(appearance.searchBarBrush, shape)
            .then(if (border != null) Modifier.border(border, shape) else Modifier),
        contentAlignment = Alignment.CenterStart,
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            WidgetChevron(
                backColor = appearance.searchBarContentColor,
                accentColor = appearance.searchBarContentColor,
                modifier = Modifier.size(28.dp),
            )
            Spacer(Modifier.width(8.dp))
            if (showHint) {
                Text(
                    text = "Search or type a command\u2026",
                    color = appearance.searchBarPlaceholderColor,
                    fontSize = 16.sp,
                    maxLines = 1,
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/**
 * Mirrors SearchWidgetProvider.renderChevronBitmap in Compose so in-app previews
 * show the same two-color chevron as the live widget.
 */
@Composable
private fun WidgetChevron(
    backColor: androidx.compose.ui.graphics.Color,
    accentColor: androidx.compose.ui.graphics.Color,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier = modifier) {
        val scale = size.minDimension / 200f
        val strokeW = 24f * scale
        val stroke = androidx.compose.ui.graphics.drawscope.Stroke(
            width = strokeW,
            cap = androidx.compose.ui.graphics.StrokeCap.Butt,
            join = androidx.compose.ui.graphics.StrokeJoin.Miter,
        )
        val back = androidx.compose.ui.graphics.Path().apply {
            moveTo(52f * scale, 60f * scale)
            lineTo(98f * scale, 100f * scale)
            lineTo(52f * scale, 140f * scale)
        }
        drawPath(back, color = backColor, style = stroke)
        val front = androidx.compose.ui.graphics.Path().apply {
            moveTo(102f * scale, 60f * scale)
            lineTo(148f * scale, 100f * scale)
            lineTo(102f * scale, 140f * scale)
        }
        drawPath(front, color = accentColor, style = stroke)
    }
}
