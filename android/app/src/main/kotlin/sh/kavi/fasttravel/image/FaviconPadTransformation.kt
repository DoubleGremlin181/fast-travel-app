package sh.kavi.fasttravel.image

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import coil.size.Size
import coil.transform.Transformation

/**
 * If the decoded icon is mostly transparent with dark opaque pixels (typical
 * monochrome glyph logo — GitHub, RSS, etc.), composite it onto a soft rounded
 * background so it stays visible on dark surfaces and tinted chips. Icons that
 * already carry their own opaque colored background (Maps, Slides, brand logos)
 * are returned unchanged, so they keep their intended look.
 */
class FaviconPadTransformation : Transformation {

    override val cacheKey: String = "fasttravel-favicon-pad-v1"

    override suspend fun transform(input: Bitmap, size: Size): Bitmap {
        if (!needsPad(input)) return input

        val w = input.width
        val h = input.height
        val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(out)
        val radius = minOf(w, h) * 0.18f
        val bg = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = PAD_COLOR }
        canvas.drawRoundRect(RectF(0f, 0f, w.toFloat(), h.toFloat()), radius, radius, bg)
        val inset = (minOf(w, h) * 0.08f).toInt().coerceAtLeast(1)
        val dst = Rect(inset, inset, w - inset, h - inset)
        val src = Rect(0, 0, w, h)
        canvas.drawBitmap(input, src, dst, Paint(Paint.FILTER_BITMAP_FLAG))
        return out
    }

    private fun needsPad(bmp: Bitmap): Boolean {
        val step = maxOf(1, minOf(bmp.width, bmp.height) / 16)
        var transparent = 0
        var opaque = 0
        var darkOpaque = 0
        var y = 0
        while (y < bmp.height) {
            var x = 0
            while (x < bmp.width) {
                val p = bmp.getPixel(x, y)
                val a = Color.alpha(p)
                if (a < 32) {
                    transparent++
                } else {
                    opaque++
                    val r = Color.red(p)
                    val g = Color.green(p)
                    val b = Color.blue(p)
                    val luma = (0.2126f * r + 0.7152f * g + 0.0722f * b) / 255f
                    if (luma < 0.35f) darkOpaque++
                }
                x += step
            }
            y += step
        }
        val total = transparent + opaque
        if (total == 0 || opaque == 0) return false
        val transparentFrac = transparent.toFloat() / total
        val darkFrac = darkOpaque.toFloat() / opaque
        return transparentFrac >= 0.25f && darkFrac >= 0.55f
    }

    override fun equals(other: Any?): Boolean = other is FaviconPadTransformation
    override fun hashCode(): Int = cacheKey.hashCode()

    companion object {
        private val PAD_COLOR = Color.parseColor("#F5F5F5")
    }
}
