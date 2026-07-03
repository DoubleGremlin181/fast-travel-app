package sh.kavi.fasttravel.ui.appearance

import android.content.Context
import android.content.res.Configuration
import android.os.Build
import androidx.compose.foundation.BorderStroke
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import sh.kavi.fasttravel.data.ThemePreferences
import sh.kavi.fasttravel.ui.theme.AmoledBorder
import sh.kavi.fasttravel.ui.theme.AmoledOnSurfaceVariant
import sh.kavi.fasttravel.ui.theme.DarkBackground
import sh.kavi.fasttravel.ui.theme.DarkError
import sh.kavi.fasttravel.ui.theme.DarkOnPrimary
import sh.kavi.fasttravel.ui.theme.DarkOnSurface
import sh.kavi.fasttravel.ui.theme.DarkOnSurfaceVariant
import sh.kavi.fasttravel.ui.theme.DarkOutline
import sh.kavi.fasttravel.ui.theme.DarkPrimary
import sh.kavi.fasttravel.ui.theme.DarkPrimaryContainer
import sh.kavi.fasttravel.ui.theme.DarkSecondary
import sh.kavi.fasttravel.ui.theme.DarkSurface
import sh.kavi.fasttravel.ui.theme.DarkSurfaceVariant
import sh.kavi.fasttravel.ui.theme.GlassBorder
import sh.kavi.fasttravel.ui.theme.GlassFillDark
import sh.kavi.fasttravel.ui.theme.GlassFillLight
import sh.kavi.fasttravel.ui.theme.GradientBlueEnd
import sh.kavi.fasttravel.ui.theme.GradientBlueStart
import sh.kavi.fasttravel.ui.theme.GradientPurpleEnd
import sh.kavi.fasttravel.ui.theme.GradientPurpleStart
import sh.kavi.fasttravel.ui.theme.LightBackground
import sh.kavi.fasttravel.ui.theme.LightError
import sh.kavi.fasttravel.ui.theme.LightOnPrimary
import sh.kavi.fasttravel.ui.theme.LightOnSurface
import sh.kavi.fasttravel.ui.theme.LightOnSurfaceVariant
import sh.kavi.fasttravel.ui.theme.LightOutline
import sh.kavi.fasttravel.ui.theme.LightPrimary
import sh.kavi.fasttravel.ui.theme.LightPrimaryContainer
import sh.kavi.fasttravel.ui.theme.LightSecondary
import sh.kavi.fasttravel.ui.theme.LightSurface
import sh.kavi.fasttravel.ui.theme.LightSurfaceVariant
import sh.kavi.fasttravel.ui.theme.NeumorphFillDark
import sh.kavi.fasttravel.ui.theme.NeumorphFillLight
import sh.kavi.fasttravel.ui.theme.SearchBarFillDark
import sh.kavi.fasttravel.ui.theme.SearchBarFillLight

enum class AppearanceMode { LIGHT, DARK, SYSTEM;
    companion object {
        fun fromName(name: String?): AppearanceMode =
            entries.firstOrNull { it.name == name } ?: SYSTEM
    }
}

enum class AppearanceVariant(val displayName: String) {
    MATERIAL("Material"),
    MATERIAL_YOU("Material You"),
    MATERIAL_YOU_TINT("Material You — Tint"),
    GLASS("Glass"),
    GRADIENT_BLUE("Gradient Blue"),
    GRADIENT_PURPLE("Gradient Purple"),
    NEUMORPHISM("Neumorphism"),
    AMOLED("AMOLED"),
    TRANSPARENT("Transparent");
    companion object {
        fun fromName(name: String?): AppearanceVariant =
            entries.firstOrNull { it.name == name } ?: MATERIAL
    }
}

enum class AppearanceShape(val displayName: String, val cornerRadiusDp: Int) {
    PILL("Pill", 999),
    SOFT("Soft", 20),
    ROUNDED("Rounded", 16),
    SQUARE("Square", 8);
    companion object {
        fun fromName(name: String?): AppearanceShape =
            entries.firstOrNull { it.name == name } ?: PILL
    }
}

data class ResolvedAppearance(
    val mode: AppearanceMode,            // resolved: never SYSTEM
    val variant: AppearanceVariant,
    val shape: AppearanceShape,
    val colorScheme: ColorScheme,
    val surfaceBrush: Brush?,
    val searchBarBrush: Brush,
    val searchBarBorder: BorderStroke?,
    // Foreground colors pinned against the search-bar fill. Kept separate from
    // colorScheme.onSurface because some variants (gradients, AMOLED, Glass)
    // need a fg that contrasts the *pill*, not the page. SearchBarPill reads
    // these directly so text stays legible even when MaterialTheme.colorScheme
    // defaults would pick a poorly coordinated value.
    val searchBarContentColor: Color,
    val searchBarPlaceholderColor: Color,
    val applyBlur: Boolean,
    val useNeumorphShadows: Boolean,
    val widgetFill: Int,
    val widgetGradient: List<Int>?,
    val widgetBorderColor: Int?,
    val widgetBorderDp: Float,
    val widgetTextColor: Int,
    val widgetIconColor: Int,
    val widgetAccentColor: Int,
) {
    /**
     * True when the resolved surface reads as dark — i.e. content painted on the
     * page/surface (chips, dividers, monogram fallbacks, system-bar icon tint)
     * should use dark-mode colors. Derived from surface luminance so it is
     * correct for every variant, including AMOLED (black surface) under an
     * explicit LIGHT mode. Use this instead of isSystemInDarkTheme(), which
     * follows the OS and ignores the app's Light/Dark setting.
     */
    val isDarkSurface: Boolean
        get() {
            val s = colorScheme.surface
            return (0.2126f * s.red + 0.7152f * s.green + 0.0722f * s.blue) < 0.5f
        }
}

private val BrandLightColorScheme: ColorScheme = lightColorScheme(
    primary = LightPrimary, onPrimary = LightOnPrimary,
    primaryContainer = LightPrimaryContainer,
    secondary = LightSecondary,
    background = LightBackground, surface = LightSurface,
    surfaceVariant = LightSurfaceVariant,
    onSurface = LightOnSurface, onSurfaceVariant = LightOnSurfaceVariant,
    outline = LightOutline, error = LightError,
)

private val BrandDarkColorScheme: ColorScheme = darkColorScheme(
    primary = DarkPrimary, onPrimary = DarkOnPrimary,
    primaryContainer = DarkPrimaryContainer,
    secondary = DarkSecondary,
    background = DarkBackground, surface = DarkSurface,
    surfaceVariant = DarkSurfaceVariant,
    onSurface = DarkOnSurface, onSurfaceVariant = DarkOnSurfaceVariant,
    outline = DarkOutline, error = DarkError,
)

private fun brandScheme(isDark: Boolean): ColorScheme =
    if (isDark) BrandDarkColorScheme else BrandLightColorScheme

/**
 * Builds a ResolvedAppearance for variants that piggyback on a ColorScheme
 * without a page-background brush (Material, Material You, tint, Neumorphism,
 * Transparent, pre-S Material You fallbacks). Caller supplies the scheme and
 * the search-bar fill/border; widget colors default to the scheme's surface
 * container unless overridden.
 */
private fun schemeBased(
    mode: AppearanceMode,
    variant: AppearanceVariant,
    shape: AppearanceShape,
    scheme: ColorScheme,
    searchBarFill: Color,
    widgetFill: Int = searchBarFill.toArgb(),
    searchBarBorder: BorderStroke? = null,
    widgetBorderColor: Int? = null,
    widgetBorderDp: Float = 0f,
    useNeumorphShadows: Boolean = false,
    widgetAccentColor: Int = scheme.primary.toArgb(),
    searchBarContentColor: Color = contrastOn(searchBarFill),
    searchBarPlaceholderColor: Color = searchBarContentColor.copy(alpha = 0.6f),
): ResolvedAppearance = ResolvedAppearance(
    mode = mode,
    variant = variant,
    shape = shape,
    colorScheme = scheme,
    surfaceBrush = null,
    searchBarBrush = SolidColor(searchBarFill),
    searchBarBorder = searchBarBorder,
    searchBarContentColor = searchBarContentColor,
    searchBarPlaceholderColor = searchBarPlaceholderColor,
    applyBlur = false,
    useNeumorphShadows = useNeumorphShadows,
    widgetFill = widgetFill,
    widgetGradient = null,
    widgetBorderColor = widgetBorderColor,
    widgetBorderDp = widgetBorderDp,
    widgetTextColor = searchBarPlaceholderColor.toArgb(),
    widgetIconColor = searchBarContentColor.toArgb(),
    widgetAccentColor = widgetAccentColor,
)

// Picks pure black or pure white for text on [bg] based on perceived luminance.
// Uses WCAG-style relative luminance with a 0.5 threshold. We pick pure colors
// (not the brand Ink/Paper) so legibility is maximal regardless of variant —
// Paper (#F5F2EC) looks washed-out on very dark bars, which is what users hit
// with MATERIAL dark.
private fun contrastOn(bg: Color): Color {
    if (bg.alpha < 0.5f) return Color.White
    val luminance = 0.2126f * bg.red + 0.7152f * bg.green + 0.0722f * bg.blue
    return if (luminance > 0.5f) Color.Black else Color.White
}

/**
 * Builds a ResolvedAppearance for gradient variants. The gradient paints both
 * the page background and the search-bar fill; on-surface text is forced white
 * for legibility against the mid-to-dark gradient regardless of mode.
 */
private fun gradientBased(
    mode: AppearanceMode,
    variant: AppearanceVariant,
    shape: AppearanceShape,
    isDark: Boolean,
    start: Color,
    end: Color,
): ResolvedAppearance {
    val scheme = brandScheme(isDark).copy(
        onBackground = Color.White,
        onSurface = Color.White,
        onSurfaceVariant = Color.White.copy(alpha = 0.8f),
        primary = Color.White,
    )
    val brush = Brush.linearGradient(listOf(start, end))
    return ResolvedAppearance(
        mode = mode,
        variant = variant,
        shape = shape,
        colorScheme = scheme,
        surfaceBrush = brush,
        searchBarBrush = brush,
        searchBarBorder = null,
        searchBarContentColor = Color.White,
        searchBarPlaceholderColor = Color.White.copy(alpha = 0.8f),
        applyBlur = false,
        useNeumorphShadows = false,
        widgetFill = end.toArgb(),
        widgetGradient = listOf(start.toArgb(), end.toArgb()),
        widgetBorderColor = null,
        widgetBorderDp = 0f,
        widgetTextColor = Color.White.toArgb(),
        widgetIconColor = Color.White.toArgb(),
        widgetAccentColor = Color.White.toArgb(),
    )
}

fun resolveFromPrefs(context: Context, prefs: ThemePreferences): ResolvedAppearance =
    resolveAppearance(context, prefs.mode, prefs.variant, prefs.shape)

/**
 * Returns an appearance safe for the settings UI. Gradient and AMOLED
 * variants override colorScheme.onSurface/onBackground to white for
 * legibility against the search bar, but settings uses opaque M3 surface
 * containers — white text on those is unreadable. We swap in the brand
 * scheme so M3 surfaces stay readable while the theme/mode is preserved.
 * surfaceBrush is cleared so Scaffolds don't fight a gradient they can't
 * usefully show through.
 */
fun ResolvedAppearance.forSettings(): ResolvedAppearance = copy(
    surfaceBrush = null,
    applyBlur = false,
    colorScheme = when (variant) {
        AppearanceVariant.GRADIENT_BLUE,
        AppearanceVariant.GRADIENT_PURPLE,
        AppearanceVariant.GLASS -> brandScheme(mode == AppearanceMode.DARK)
        AppearanceVariant.AMOLED -> brandScheme(isDark = true)
        else -> colorScheme
    },
)

fun resolveAppearance(
    context: Context,
    mode: AppearanceMode,
    variant: AppearanceVariant,
    shape: AppearanceShape,
): ResolvedAppearance {
    // 1. Resolve SYSTEM to LIGHT/DARK.
    val resolvedMode: AppearanceMode = when (mode) {
        AppearanceMode.LIGHT, AppearanceMode.DARK -> mode
        AppearanceMode.SYSTEM -> {
            val nightMask = context.resources.configuration.uiMode and
                Configuration.UI_MODE_NIGHT_MASK
            if (nightMask == Configuration.UI_MODE_NIGHT_YES) AppearanceMode.DARK
            else AppearanceMode.LIGHT
        }
    }
    val isDark = resolvedMode == AppearanceMode.DARK
    val supportsDynamic = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S

    return when (variant) {
        AppearanceVariant.MATERIAL -> {
            // Brand-coordinated fill instead of M3's default surfaceContainerHigh
            // so the pill stays in palette and the onSurface text is guaranteed
            // to be legible against it.
            val scheme = brandScheme(isDark)
            val fill = if (isDark) SearchBarFillDark else SearchBarFillLight
            schemeBased(resolvedMode, variant, shape, scheme, searchBarFill = fill)
        }

        AppearanceVariant.MATERIAL_YOU -> {
            val scheme: ColorScheme = if (supportsDynamic) {
                if (isDark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
            } else {
                brandScheme(isDark)
            }
            schemeBased(resolvedMode, variant, shape, scheme,
                searchBarFill = scheme.surfaceContainerHigh,
                searchBarContentColor = scheme.onSurface,
                searchBarPlaceholderColor = scheme.onSurfaceVariant)
        }

        AppearanceVariant.MATERIAL_YOU_TINT -> {
            if (supportsDynamic) {
                val fillArgb = context.getColor(android.R.color.system_accent1_100)
                val accentArgb = context.getColor(android.R.color.system_accent1_600)
                val fill = Color(fillArgb)
                val scheme = brandScheme(isDark).copy(
                    primary = Color(accentArgb),
                    surface = fill,
                    surfaceVariant = fill,
                )
                schemeBased(resolvedMode, variant, shape, scheme,
                    searchBarFill = fill,
                    widgetFill = fillArgb,
                    widgetAccentColor = accentArgb)
            } else {
                // Pre-S fallback: brand palette.
                val scheme = brandScheme(isDark)
                val fill = if (isDark) SearchBarFillDark else SearchBarFillLight
                schemeBased(resolvedMode, variant, shape, scheme, searchBarFill = fill)
            }
        }

        AppearanceVariant.GLASS -> {
            val fill = if (isDark) GlassFillDark else GlassFillLight
            schemeBased(resolvedMode, variant, shape, brandScheme(isDark),
                searchBarFill = fill,
                searchBarBorder = BorderStroke(1.dp, GlassBorder),
                widgetBorderColor = GlassBorder.toArgb(),
                widgetBorderDp = 1f,
            ).copy(
                surfaceBrush = SolidColor(fill),
                applyBlur = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S,
            )
        }

        AppearanceVariant.GRADIENT_BLUE ->
            gradientBased(resolvedMode, variant, shape, isDark, GradientBlueStart, GradientBlueEnd)

        AppearanceVariant.GRADIENT_PURPLE ->
            gradientBased(resolvedMode, variant, shape, isDark, GradientPurpleStart, GradientPurpleEnd)

        AppearanceVariant.NEUMORPHISM -> {
            val fill = if (isDark) NeumorphFillDark else NeumorphFillLight
            val fg = if (isDark) Color(0xFFE0E0E0) else Color(0xFF5F6368)
            schemeBased(resolvedMode, variant, shape, brandScheme(isDark),
                searchBarFill = fill,
                useNeumorphShadows = true,
                searchBarContentColor = fg,
                searchBarPlaceholderColor = fg.copy(alpha = 0.6f))
        }

        AppearanceVariant.AMOLED -> {
            // AMOLED forces black surfaces regardless of Mode. Text tint must
            // remain readable against black, so onSurface/onBackground are
            // always light. Primary accent still follows Mode.
            val scheme = brandScheme(isDark).copy(
                background = Color.Black,
                surface = Color.Black,
                surfaceVariant = Color.Black,
                onBackground = Color.White,
                onSurface = Color.White,
                onSurfaceVariant = AmoledOnSurfaceVariant,
            )
            schemeBased(resolvedMode, variant, shape, scheme,
                searchBarFill = Color.Black,
                searchBarBorder = BorderStroke(1.dp, AmoledBorder),
                widgetBorderColor = AmoledBorder.toArgb(),
                widgetBorderDp = 1f,
                searchBarContentColor = Color.White,
                searchBarPlaceholderColor = AmoledOnSurfaceVariant,
            ).copy(
                surfaceBrush = SolidColor(Color.Black),
            )
        }

        AppearanceVariant.TRANSPARENT -> {
            val scheme = brandScheme(isDark)
            schemeBased(resolvedMode, variant, shape, scheme,
                searchBarFill = Color.Transparent,
                searchBarBorder = BorderStroke(1.5.dp, scheme.primary),
                widgetFill = 0,
                widgetBorderColor = scheme.primary.toArgb(),
                widgetBorderDp = 1.5f,
                searchBarContentColor = scheme.primary,
                searchBarPlaceholderColor = scheme.primary.copy(alpha = 0.6f),
            )
        }
    }
}
