package sh.kavi.fasttravel.debug

import android.app.Activity
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import sh.kavi.fasttravel.ui.SearchWidgetProvider

/**
 * Debug-only headless activity: calls `AppWidgetManager.requestPinAppWidget`
 * and finishes. Triggers the launcher's "Add widget to home screen?" system
 * dialog so we can pin from `adb shell am start` without UI automation.
 *
 * Start with:
 *   adb shell am start -n sh.kavi.fasttravel/sh.kavi.fasttravel.debug.PinWidgetActivity
 */
class PinWidgetActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val mgr = AppWidgetManager.getInstance(this)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || !mgr.isRequestPinAppWidgetSupported) {
            Toast.makeText(this, "Pin widget API unsupported on this launcher", Toast.LENGTH_LONG).show()
            finish()
            return
        }
        val provider = ComponentName(this, SearchWidgetProvider::class.java)
        val callback = PendingIntent.getBroadcast(
            this,
            0,
            Intent("sh.kavi.fasttravel.PIN_WIDGET_RESULT").setPackage(packageName),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        mgr.requestPinAppWidget(provider, null, callback)
        finish()
    }
}
