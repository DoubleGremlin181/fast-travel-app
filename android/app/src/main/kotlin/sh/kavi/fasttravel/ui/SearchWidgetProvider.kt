package sh.kavi.fasttravel.ui

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.content.res.ColorStateList
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.view.View
import android.util.TypedValue
import android.widget.RemoteViews
import sh.kavi.fasttravel.R
import sh.kavi.fasttravel.data.ThemePreferences
import sh.kavi.fasttravel.ui.appearance.AppearanceShape
import sh.kavi.fasttravel.ui.appearance.ResolvedAppearance
import sh.kavi.fasttravel.ui.appearance.resolveAppearance

class SearchWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }

    override fun onAppWidgetOptionsChanged(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int,
        newOptions: android.os.Bundle?,
    ) {
        updateAppWidget(context, appWidgetManager, appWidgetId)
    }

    private fun updateAppWidget(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int,
    ) {
        val prefs = ThemePreferences(context)
        val appearance = resolveAppearance(context, prefs.mode, prefs.variant, prefs.shape)
        val opacity = prefs.widgetOpacity

        val views = RemoteViews(context.packageName, R.layout.widget_search)

        // Two render paths:
        //  - SHAPE: tint a shape drawable at the FrameLayout's own background. Corner
        //    radius is rendered by the framework at the actual View size, so it stays
        //    crisp at any pinned dimensions (Lawnchair, OneUI, Pixel, …).
        //  - BITMAP: render a Bitmap into the widget_bg ImageView. fitXY stretches the
        //    bitmap to fit, which can compress corners on widgets whose aspect ratio
        //    differs from our render size. Used only when the variant can't be
        //    expressed as a single tinted shape (gradients, bordered styles) or on
        //    pre-API-31 where setBackgroundTintList isn't a remotable method.
        val canUseShape = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
        val needsBitmap =
            !canUseShape ||
                appearance.widgetGradient != null ||
                (appearance.widgetBorderColor != null && appearance.widgetBorderDp > 0f)

        val alphaFactor = (opacity.coerceIn(0, 100) / 100f)

        if (needsBitmap) {
            val opts = appWidgetManager.getAppWidgetOptions(appWidgetId)
            val minWidthDp = opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0)
            val maxWidthDp = opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, 0)
            val minHeightDp = opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0)
            val maxHeightDp = opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0)
            val widthPx = dpToPx(context, maxOf(minWidthDp, maxWidthDp, 250).toFloat()).toInt()
            val heightPx = dpToPx(context, maxOf(minHeightDp, maxHeightDp, 48).toFloat()).toInt()
            val bitmap = renderBackgroundBitmap(
                context = context,
                widthPx = widthPx,
                heightPx = heightPx,
                cornerRadiusDp = appearance.shape.cornerRadiusDp.toFloat(),
                appearance = appearance,
                opacityPercent = opacity,
            )
            views.setImageViewBitmap(R.id.widget_bg, bitmap)
            views.setViewVisibility(R.id.widget_bg, View.VISIBLE)
            // Clear the container's background so it doesn't double-render.
            views.setInt(R.id.widget_container, "setBackgroundResource", 0)
        } else {
            views.setViewVisibility(R.id.widget_bg, View.GONE)
            views.setInt(R.id.widget_container, "setBackgroundResource", shapeDrawableFor(appearance.shape))
            views.setColorStateList(
                R.id.widget_container,
                "setBackgroundTintList",
                ColorStateList.valueOf(applyAlpha(appearance.widgetFill, alphaFactor)),
            )
        }

        views.setTextColor(R.id.widget_hint, appearance.widgetTextColor)
        // Two-color chevron: back uses the surface-paired fg (iconColor); front uses
        // the variant's accent (brand Denim or scheme primary). Rendered as a bitmap
        // because RemoteViews can't independently tint two paths inside a VectorDrawable.
        val iconSizePx = dpToPx(context, WIDGET_ICON_DP).toInt().coerceAtLeast(1)
        val chevronBitmap = renderChevronBitmap(iconSizePx, appearance.widgetIconColor, appearance.widgetAccentColor)
        views.setImageViewBitmap(R.id.widget_icon, chevronBitmap)

        // Whole-widget click -> SearchActivity, always landing on the focused
        // search screen even if the user has Settings (or another in-app screen)
        // on top. CLEAR_TOP pops anything above SearchActivity in the task and
        // recreates it, which re-fires the auto-focus + keyboard LaunchedEffect.
        val intent = Intent(context, SearchActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("from_widget", true)
        }
        // Request code is bumped whenever the intent flags change so Android
        // issues a fresh PendingIntent instead of reusing a cached one (which
        // ignores intent-flag updates).
        val pendingIntent = PendingIntent.getActivity(
            context,
            WIDGET_REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        views.setOnClickPendingIntent(R.id.widget_container, pendingIntent)

        appWidgetManager.updateAppWidget(appWidgetId, views)
    }

    companion object {
        // Bump when Intent flags change to invalidate cached PendingIntents.
        private const val WIDGET_REQUEST_CODE = 2
        private const val WIDGET_ICON_DP = 28f

        fun renderBackgroundBitmap(
            context: Context,
            widthPx: Int,
            heightPx: Int,
            cornerRadiusDp: Float,
            appearance: ResolvedAppearance,
            opacityPercent: Int,
        ): Bitmap {
            val w = widthPx.coerceAtLeast(1)
            val h = heightPx.coerceAtLeast(1)
            val radiusPx = dpToPx(context, cornerRadiusDp)
            val fillAlpha = (opacityPercent.coerceIn(0, 100) / 100f)

            val gradient = appearance.widgetGradient?.toIntArray()

            val drawable = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = radiusPx
                if (gradient != null && gradient.size >= 2) {
                    orientation = GradientDrawable.Orientation.LEFT_RIGHT
                    colors = gradient.map { applyAlpha(it, fillAlpha) }.toIntArray()
                } else {
                    setColor(applyAlpha(appearance.widgetFill, fillAlpha))
                }
                if (appearance.widgetBorderColor != null && appearance.widgetBorderDp > 0f) {
                    setStroke(dpToPx(context, appearance.widgetBorderDp).toInt(), appearance.widgetBorderColor)
                }
            }

            val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            drawable.setBounds(0, 0, w, h)
            drawable.draw(canvas)
            return bitmap
        }

        private fun applyAlpha(color: Int, factor: Float): Int {
            if (color == Color.TRANSPARENT) return color
            val a = (Color.alpha(color) * factor).toInt().coerceIn(0, 255)
            return Color.argb(a, Color.red(color), Color.green(color), Color.blue(color))
        }

        /**
         * Two-color chevron rendered into a Bitmap. RemoteViews can't tint two
         * paths inside a VectorDrawable independently, so we bake the colors in.
         *
         * Geometry mirrors the main-screen ChevronMark: viewBox 200, stroke 24,
         * back tip at x=98, front spine at x=102 (tight gap).
         */
        fun renderChevronBitmap(sizePx: Int, backColor: Int, accentColor: Int): Bitmap {
            val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            val scale = sizePx / 200f
            val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeWidth = 24f * scale
                strokeCap = Paint.Cap.BUTT
                strokeJoin = Paint.Join.MITER
            }
            val back = Path().apply {
                moveTo(52f * scale, 60f * scale)
                lineTo(98f * scale, 100f * scale)
                lineTo(52f * scale, 140f * scale)
            }
            paint.color = backColor
            canvas.drawPath(back, paint)
            val front = Path().apply {
                moveTo(102f * scale, 60f * scale)
                lineTo(148f * scale, 100f * scale)
                lineTo(102f * scale, 140f * scale)
            }
            paint.color = accentColor
            canvas.drawPath(front, paint)
            return bitmap
        }

        fun shapeDrawableFor(shape: AppearanceShape): Int = when (shape) {
            AppearanceShape.PILL -> R.drawable.widget_bg_shape_pill
            AppearanceShape.SOFT -> R.drawable.widget_bg_shape_soft
            AppearanceShape.ROUNDED -> R.drawable.widget_bg_shape_rect
            AppearanceShape.SQUARE -> R.drawable.widget_bg_shape_square
        }

        fun dpToPx(context: Context, dp: Float): Float =
            TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP,
                dp,
                context.resources.displayMetrics,
            )

        /**
         * Triggers an update of every pinned Fast Travel widget. Call after committing
         * new widget appearance preferences.
         */
        fun refreshAll(context: Context) {
            val mgr = AppWidgetManager.getInstance(context)
            val component = ComponentName(context, SearchWidgetProvider::class.java)
            val ids = mgr.getAppWidgetIds(component)
            if (ids.isEmpty()) return
            val intent = Intent(context, SearchWidgetProvider::class.java).apply {
                action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
            }
            context.sendBroadcast(intent)
        }
    }
}
