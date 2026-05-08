package sh.kavi.fasttravel.ui.theme

import androidx.compose.ui.graphics.Color

// --- Fast Travel Chevron Brand Kit palette ---
// Night · Ink · Paper · Bone · Denim (Flare accent) · Fog · Slate.
val Night = Color(0xFF0E1020)
val Ink = Color(0xFF1A1D2E)
val Paper = Color(0xFFF5F2EC)
val Bone = Color(0xFFECE7DC)
val Denim = Color(0xFF3E6098)
val DenimSoft = Color(0xFFDCE4F1)
val DenimLight = Color(0xFF7A8FB5)
val Fog = Color(0xFFC8C3BA)
val Slate = Color(0xFF4A4E63)

// --- Spec tokens (search surface) ---
val SurfaceLight = Paper
val SurfaceDark = Night
val SearchBarFillLight = Bone
val SearchBarFillDark = Ink
val TextPrimaryLight = Ink
val TextSecondaryLight = Slate
val DividerLight = Color(0xFFD9D3C6)
val DividerDark = Color(0xFF2A2D3E)
val MatchedChipBgLight = Color(0xFFE2ECDE)
val MatchedChipTextLight = Color(0xFF3D7A4A)
val MatchedChipBgDark = Color(0xFF1B3A2B)
val MatchedChipTextDark = Color(0xFFA7E6B8)

/**
 * Derives a (chipFill, chipText) pair from an arbitrary hex color and mode.
 *
 * - Light mode: tint the base color over a white surface at ~12% to get a pale
 *   fill, and darken the base by ~25% for a readable text color.
 * - Dark mode: tint the base over a dark navy surface at ~22% for a desaturated
 *   fill, and lighten the base toward white for readable text.
 *
 * Any valid 6-digit #RRGGBB string resolves to visibly-related colors — so custom
 * user-picked group colors stop silently falling back to hash-picked palette
 * entries.
 */
object GroupColorPalette {
    /**
     * Precomputed overrides for the canonical Google palette hexes used in the
     * default config. These preserve the exact shades used in the Figma v2 spec.
     */
    private val lightOverrides: Map<String, Pair<Color, Color>> = mapOf(
        "#4285F4" to (Color(0xFFE8F0FE) to Color(0xFF1A73E8)),
        "#EA4335" to (Color(0xFFFDECEA) to Color(0xFFC5221F)),
        "#34A853" to (Color(0xFFE8F5E9) to Color(0xFF2E7D32)),
        "#FBBC04" to (Color(0xFFFFF8E1) to Color(0xFFB28704)),
        "#9C27B0" to (Color(0xFFF3E5F5) to Color(0xFF7B1FA2)),
        "#FF9800" to (Color(0xFFFFF3E0) to Color(0xFFE65100)),
        "#00897B" to (Color(0xFFE0F2F1) to Color(0xFF00695C)),
        "#C2185B" to (Color(0xFFFCE4EC) to Color(0xFFAD1457)),
        "#5E35B1" to (Color(0xFFEDE7F6) to Color(0xFF4527A0)),
        "#455A64" to (Color(0xFFECEFF1) to Color(0xFF37474F)),
    )

    private val darkOverrides: Map<String, Pair<Color, Color>> = mapOf(
        "#4285F4" to (Color(0xFF1A2A40) to Color(0xFF8AB4F8)),
        "#EA4335" to (Color(0xFF3A1F1D) to Color(0xFFF28B82)),
        "#34A853" to (Color(0xFF1B3A2B) to Color(0xFF81C995)),
        "#FBBC04" to (Color(0xFF3A2F15) to Color(0xFFFDD663)),
        "#9C27B0" to (Color(0xFF2E1A33) to Color(0xFFD8A7DF)),
        "#FF9800" to (Color(0xFF3A2715) to Color(0xFFFFB74D)),
        "#00897B" to (Color(0xFF15312E) to Color(0xFF4DB6AC)),
        "#C2185B" to (Color(0xFF3A1A2B) to Color(0xFFF48FB1)),
        "#5E35B1" to (Color(0xFF241B3A) to Color(0xFFB39DDB)),
        "#455A64" to (Color(0xFF1F2A33) to Color(0xFFB0BEC5)),
    )

    private val fallbackCycleLight = listOf(
        Color(0xFFE8F0FE) to Color(0xFF1A73E8),
        Color(0xFFFDECEA) to Color(0xFFC5221F),
        Color(0xFFE8F5E9) to Color(0xFF2E7D32),
        Color(0xFFFFF3E0) to Color(0xFFE65100),
        Color(0xFFF3E5F5) to Color(0xFF7B1FA2),
        Color(0xFFE0F2F1) to Color(0xFF00695C),
    )

    private val fallbackCycleDark = listOf(
        Color(0xFF1A2A40) to Color(0xFF8AB4F8),
        Color(0xFF3A1F1D) to Color(0xFFF28B82),
        Color(0xFF1B3A2B) to Color(0xFF81C995),
        Color(0xFF3A2715) to Color(0xFFFFB74D),
        Color(0xFF2E1A33) to Color(0xFFD8A7DF),
        Color(0xFF15312E) to Color(0xFF4DB6AC),
    )

    /**
     * Returns (fill, text) for [hex] in the given [isDark] mode. For unknown
     * hexes the fill is derived by blending the base over the surface, and the
     * text by shifting the base toward readable luminance. If [hex] is null,
     * falls back to a deterministic slot from the cycle keyed by [fallbackKey].
     */
    fun resolve(hex: String?, fallbackKey: String? = null, isDark: Boolean = false): Pair<Color, Color> {
        if (hex != null) {
            val key = hex.uppercase()
            val overrides = if (isDark) darkOverrides else lightOverrides
            overrides[key]?.let { return it }
            overrides[hex]?.let { return it }
            parseHex(hex)?.let { base ->
                return deriveFromBase(base, isDark)
            }
        }
        val cycle = if (isDark) fallbackCycleDark else fallbackCycleLight
        val idx = ((fallbackKey?.hashCode() ?: 0) and Int.MAX_VALUE) % cycle.size
        return cycle[idx]
    }

    private fun parseHex(hex: String): Color? {
        val cleaned = hex.removePrefix("#")
        return try {
            when (cleaned.length) {
                6 -> Color(0xFF000000 or cleaned.toLong(16))
                8 -> Color(cleaned.toLong(16))
                else -> null
            }
        } catch (_: NumberFormatException) {
            null
        }
    }

    private fun deriveFromBase(base: Color, isDark: Boolean): Pair<Color, Color> {
        if (isDark) {
            // Fill: base at 22% over the Night surface (#0E1020).
            val surface = Night
            val fill = blend(base, surface, 0.22f)
            // Text: lift base toward white so it stays readable on the dark fill.
            val text = blend(Color.White, base, 0.55f)
            return fill to text
        }
        val fill = blend(base, Color.White, 0.12f)
        val text = blend(base, Color.Black, 0.75f)
        return fill to text
    }

    private fun blend(fg: Color, bg: Color, alpha: Float): Color {
        val a = alpha.coerceIn(0f, 1f)
        return Color(
            red = fg.red * a + bg.red * (1 - a),
            green = fg.green * a + bg.green * (1 - a),
            blue = fg.blue * a + bg.blue * (1 - a),
            alpha = 1f,
        )
    }
}

// --- Material 3 palette, derived from the Chevron Brand Kit ---
val LightPrimary = Denim
val LightOnPrimary = Paper
val LightPrimaryContainer = DenimSoft
val LightSecondary = Slate
val LightBackground = Paper
val LightSurface = Paper
val LightSurfaceVariant = Bone
val LightOnSurface = Ink
val LightOnSurfaceVariant = Slate
val LightOutline = Fog
val LightError = Color(0xFFC4432E)

val DarkPrimary = DenimLight
val DarkOnPrimary = Night
val DarkPrimaryContainer = Color(0xFF1F2A44)
val DarkSecondary = Color(0xFFB8B1A3)
val DarkBackground = Night
val DarkSurface = Ink
val DarkSurfaceVariant = Color(0xFF242738)
val DarkOnSurface = Paper
val DarkOnSurfaceVariant = Color(0xFFB8B1A3)
val DarkOutline = Color(0xFF3A3D4E)
val DarkError = Color(0xFFE58671)

// --- Variant-specific accents (shared with extension/src/ui/variants.css) ---
val GradientBlueStart = DenimLight
val GradientBlueEnd = Denim
val GradientPurpleStart = Color(0xFFE74FC9)
val GradientPurpleEnd = Color(0xFF9333EA)
val NeumorphFillLight = Color(0xFFE0E0E0)
val NeumorphFillDark = Color(0xFF2A2A2A)
val AmoledBorder = Color(0xFF4A4A4A)
val AmoledOnSurfaceVariant = Color(0xFFCCCCCC)
val GlassFillLight = Color(0x99FFFFFF)
val GlassFillDark = Color(0x99000000)
val GlassBorder = Color(0xCCFFFFFF)
