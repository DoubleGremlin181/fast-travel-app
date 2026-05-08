package sh.kavi.fasttravel

import android.app.Application
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.res.Configuration
import android.os.Build
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.disk.DiskCache
import coil.memory.MemoryCache
import coil.request.CachePolicy
import sh.kavi.fasttravel.core.IconPackResolver
import sh.kavi.fasttravel.core.InstalledAppResolver
import sh.kavi.fasttravel.data.ConfigRefreshScheduler
import sh.kavi.fasttravel.data.ThemePreferences

/**
 * Custom Coil [ImageLoader] for command favicons.
 *
 * Favicons come from Google S2 (PNG at up to 256px). No SVG decoding and no
 * custom User-Agent are needed — Google S2 serves plain PNGs to any client.
 */
class FastTravelApplication : Application(), ImageLoaderFactory {
    /** Last-seen night-mode bit. Tracked so we only repaint widgets when the
     * bit actually flips, not on unrelated configuration changes (font scale,
     * locale, orientation, …) that also fire ACTION_CONFIGURATION_CHANGED. */
    @Volatile
    private var lastNightMask: Int = Configuration.UI_MODE_NIGHT_UNDEFINED

    override fun onCreate() {
        super.onCreate()
        // Re-broadcast a widget update so pinned widgets pick up the latest
        // PendingIntent (e.g. after an app upgrade that changed intent flags).
        // Skip on WorkManager background process starts — WorkManager runs in
        // the same process space and triggers onCreate() on each job, but the
        // widget bitmap/PendingIntent is already up-to-date; re-rendering it
        // every background refresh wastes memory and CPU for no visual change.
        if (!isWorkManagerProcess()) {
            sh.kavi.fasttravel.ui.SearchWidgetProvider.refreshAll(this)
        }

        ConfigRefreshScheduler.schedule(this, ThemePreferences(this).configRefreshInterval)

        // Drop the launcher-app cache whenever a package is installed/removed/
        // changed so the suggestion list reflects what's actually on the device.
        val pkgFilter = IntentFilter().apply {
            addAction(Intent.ACTION_PACKAGE_ADDED)
            addAction(Intent.ACTION_PACKAGE_REMOVED)
            addAction(Intent.ACTION_PACKAGE_CHANGED)
            addAction(Intent.ACTION_PACKAGE_REPLACED)
            addDataScheme("package")
        }
        registerReceiver(
            object : BroadcastReceiver() {
                override fun onReceive(c: Context, i: Intent) {
                    InstalledAppResolver.invalidate()
                    IconPackResolver.invalidate()
                }
            },
            pkgFilter,
        )

        // Repaint AUTO-variant widgets when the system flips between light and
        // dark mode. AppWidgetProviders otherwise only re-render on
        // updatePeriodMillis (30 min), so toggling night mode leaves the widget
        // stuck on the previous palette until it next polls. ACTION_CONFIGURATION_CHANGED
        // can't be declared in the manifest (implicit-broadcast restriction), so
        // we register at runtime and keep a guard to only refresh when the
        // night-mode bit actually changes.
        lastNightMask = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
        registerReceiver(
            object : BroadcastReceiver() {
                override fun onReceive(c: Context, i: Intent) {
                    val next = c.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
                    if (next != lastNightMask) {
                        lastNightMask = next
                        sh.kavi.fasttravel.ui.SearchWidgetProvider.refreshAll(c)
                    }
                }
            },
            IntentFilter(Intent.ACTION_CONFIGURATION_CHANGED),
        )
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        // Belt-and-suspenders: some Android versions deliver the signal here
        // instead of through the broadcast, depending on whether the process
        // has foreground components alive.
        val next = newConfig.uiMode and Configuration.UI_MODE_NIGHT_MASK
        if (next != lastNightMask) {
            lastNightMask = next
            sh.kavi.fasttravel.ui.SearchWidgetProvider.refreshAll(this)
        }
    }

    /**
     * Returns true when this [Application.onCreate] invocation is happening
     * inside a WorkManager background process.
     *
     * WorkManager isolates its workers in a process named
     * `<packageName>:work`. Detecting this prevents the widget bitmap from
     * being redundantly re-rendered on every scheduled config refresh.
     */
    private fun isWorkManagerProcess(): Boolean {
        val processName = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getProcessName()
        } else {
            val pid = android.os.Process.myPid()
            val manager = getSystemService(ACTIVITY_SERVICE) as android.app.ActivityManager
            manager.runningAppProcesses?.firstOrNull { it.pid == pid }?.processName
        }
        return processName?.endsWith(":work") == true
    }

    override fun newImageLoader(): ImageLoader {
        return ImageLoader.Builder(this)
            .memoryCache {
                MemoryCache.Builder(this)
                    .maxSizePercent(0.20)
                    .build()
            }
            .diskCache {
                DiskCache.Builder()
                    .directory(cacheDir.resolve("favicon_cache"))
                    .maxSizeBytes(50L * 1024 * 1024)
                    .build()
            }
            .memoryCachePolicy(CachePolicy.ENABLED)
            .diskCachePolicy(CachePolicy.ENABLED)
            .crossfade(false)
            .build()
    }
}
