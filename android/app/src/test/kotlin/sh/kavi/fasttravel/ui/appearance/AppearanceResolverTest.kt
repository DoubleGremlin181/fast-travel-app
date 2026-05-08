package sh.kavi.fasttravel.ui.appearance

import android.app.Application
import android.content.Context
import androidx.compose.ui.graphics.toArgb
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import sh.kavi.fasttravel.ui.theme.GradientBlueEnd
import sh.kavi.fasttravel.ui.theme.GradientBlueStart
import sh.kavi.fasttravel.ui.theme.GradientPurpleEnd
import sh.kavi.fasttravel.ui.theme.GradientPurpleStart

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class)
class AppearanceResolverTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @Test fun `Material variant in light mode produces light color scheme`() {
        val r = resolveAppearance(context, AppearanceMode.LIGHT, AppearanceVariant.MATERIAL, AppearanceShape.PILL)
        assertEquals(AppearanceMode.LIGHT, r.mode)
        assertNull(r.surfaceBrush)
    }

    @Test fun `SYSTEM mode resolves to LIGHT or DARK`() {
        val r = resolveAppearance(context, AppearanceMode.SYSTEM, AppearanceVariant.MATERIAL, AppearanceShape.PILL)
        assert(r.mode == AppearanceMode.LIGHT || r.mode == AppearanceMode.DARK)
    }

    @Test fun `AMOLED overrides surface to black regardless of mode`() {
        val light = resolveAppearance(context, AppearanceMode.LIGHT, AppearanceVariant.AMOLED, AppearanceShape.PILL)
        val dark = resolveAppearance(context, AppearanceMode.DARK, AppearanceVariant.AMOLED, AppearanceShape.PILL)
        assertEquals(0xFF000000.toInt(), light.widgetFill)
        assertEquals(0xFF000000.toInt(), dark.widgetFill)
    }

    @Test fun `Gradient variants produce a widget gradient array`() {
        val r = resolveAppearance(context, AppearanceMode.DARK, AppearanceVariant.GRADIENT_BLUE, AppearanceShape.PILL)
        assertNotNull(r.widgetGradient)
        assertEquals(2, r.widgetGradient!!.size)
    }

    @Test fun `Transparent variant has a border and transparent fill`() {
        val r = resolveAppearance(context, AppearanceMode.LIGHT, AppearanceVariant.TRANSPARENT, AppearanceShape.PILL)
        assertNotNull(r.searchBarBorder)
        assertEquals(0, r.widgetFill)
    }

    @Test fun `Glass variant sets applyBlur true on Android 12+`() {
        val r = resolveAppearance(context, AppearanceMode.DARK, AppearanceVariant.GLASS, AppearanceShape.PILL)
        assertEquals(true, r.applyBlur)
    }

    @Test fun `shape passes through unchanged`() {
        val r = resolveAppearance(context, AppearanceMode.LIGHT, AppearanceVariant.MATERIAL, AppearanceShape.SQUARE)
        assertEquals(AppearanceShape.SQUARE, r.shape)
    }

    // --- Parameterized matrix: every variant × {LIGHT, DARK} must resolve ---
    // to a non-null ResolvedAppearance with a search-bar brush, a resolved mode
    // (never SYSTEM), and the same variant/shape we passed in. Guards against
    // a future variant being added that forgets a required field.
    @Test fun `every variant x mode resolves to a valid appearance`() {
        val modes = listOf(AppearanceMode.LIGHT, AppearanceMode.DARK)
        for (variant in AppearanceVariant.entries) {
            for (mode in modes) {
                val r = resolveAppearance(context, mode, variant, AppearanceShape.PILL)
                assertEquals("variant mismatch for $variant/$mode", variant, r.variant)
                assertEquals("shape mismatch for $variant/$mode", AppearanceShape.PILL, r.shape)
                assertEquals("mode mismatch for $variant/$mode", mode, r.mode)
                assertTrue("mode should be resolved (never SYSTEM) for $variant/$mode",
                    r.mode != AppearanceMode.SYSTEM)
                assertNotNull("searchBarBrush null for $variant/$mode", r.searchBarBrush)
                assertNotNull("colorScheme null for $variant/$mode", r.colorScheme)
            }
        }
    }

    @Test fun `gradient variants preserve start then end ordering`() {
        val blue = resolveAppearance(context, AppearanceMode.LIGHT, AppearanceVariant.GRADIENT_BLUE, AppearanceShape.PILL)
        val purple = resolveAppearance(context, AppearanceMode.DARK, AppearanceVariant.GRADIENT_PURPLE, AppearanceShape.PILL)
        assertEquals(listOf(GradientBlueStart.toArgb(), GradientBlueEnd.toArgb()), blue.widgetGradient)
        assertEquals(listOf(GradientPurpleStart.toArgb(), GradientPurpleEnd.toArgb()), purple.widgetGradient)
    }

    // Robolectric defaults to the requested SDK; running the same test under
    // SDK 30 (pre-S, no dynamic color) exercises the MATERIAL_YOU /
    // MATERIAL_YOU_TINT fallback path without needing a second @Config class.
    @Test
    @Config(sdk = [30])
    fun `Material You variants fall back to brand palette on pre-S`() {
        val you = resolveAppearance(context, AppearanceMode.LIGHT, AppearanceVariant.MATERIAL_YOU, AppearanceShape.PILL)
        val tint = resolveAppearance(context, AppearanceMode.DARK, AppearanceVariant.MATERIAL_YOU_TINT, AppearanceShape.PILL)
        // Pre-S path: no dynamic scheme, no gradient overlay, no neumorph shadows.
        assertNull(you.surfaceBrush)
        assertNull(tint.surfaceBrush)
        assertEquals(false, you.useNeumorphShadows)
        assertEquals(false, tint.useNeumorphShadows)
    }

    @Test
    @Config(sdk = [30])
    fun `Glass applyBlur is false on pre-S`() {
        val r = resolveAppearance(context, AppearanceMode.DARK, AppearanceVariant.GLASS, AppearanceShape.PILL)
        assertEquals(false, r.applyBlur)
    }

    @Test fun `widget text and icon colors have sufficient contrast against fill for all variants`() {
        val modes = listOf(AppearanceMode.LIGHT, AppearanceMode.DARK)
        for (variant in AppearanceVariant.entries) {
            if (variant == AppearanceVariant.TRANSPARENT) continue // fill is 0x00000000
            for (mode in modes) {
                val r = resolveAppearance(context, mode, variant, AppearanceShape.PILL)
                val fillLum = relativeLuminance(r.widgetFill)
                val textLum = relativeLuminance(r.widgetTextColor)
                val iconLum = relativeLuminance(r.widgetIconColor)
                val textContrast = contrastRatio(fillLum, textLum)
                val iconContrast = contrastRatio(fillLum, iconLum)
                assertTrue(
                    "$variant/$mode: widgetTextColor contrast ${"%.2f".format(textContrast)}:1 < 3:1",
                    textContrast >= 3.0,
                )
                assertTrue(
                    "$variant/$mode: widgetIconColor contrast ${"%.2f".format(iconContrast)}:1 < 3:1",
                    iconContrast >= 3.0,
                )
            }
        }
    }

    private fun relativeLuminance(argb: Int): Double {
        fun channel(c: Int): Double {
            val s = (c and 0xFF) / 255.0
            return if (s <= 0.04045) s / 12.92 else Math.pow((s + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * channel(argb shr 16) + 0.7152 * channel(argb shr 8) + 0.0722 * channel(argb)
    }

    private fun contrastRatio(l1: Double, l2: Double): Double {
        val lighter = maxOf(l1, l2)
        val darker = minOf(l1, l2)
        return (lighter + 0.05) / (darker + 0.05)
    }
}
