package sh.kavi.fasttravel.core

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import android.content.res.Configuration
import android.graphics.drawable.AdaptiveIconDrawable
import android.graphics.drawable.Drawable
import android.os.Build

data class InstalledApp(
    val label: String,
    val packageName: String,
    val activityName: String,
    val icon: Drawable,
)

object InstalledAppResolver {

    private const val MAX_RESULTS = 6

    @Volatile
    private var cachedApps: List<ResolvedEntry>? = null

    private data class ResolvedEntry(
        val label: String,
        val labelLower: String,
        /** Initials of space/hyphen tokens AND camelCase splits, concatenated.
         *  e.g. "YouTube Revanced" → "ytr", "Google Maps" → "gm". */
        val initials: String,
        /** Lowercased tokens (space / hyphen / camelCase split). Useful for
         *  per-token prefix matches like `yt` → "YouTube" via the "tube" token. */
        val tokens: List<String>,
        val packageLower: String,
        val resolveInfo: ResolveInfo,
    )

    fun invalidate() {
        cachedApps = null
    }

    fun query(context: Context, query: String): List<InstalledApp> {
        val trimmed = query.trim()
        if (trimmed.isEmpty()) return emptyList()
        val needle = trimmed.lowercase()

        val entries = ensureLoaded(context)

        // Score each entry by its strongest match. Lower score ranks higher.
        //  0: label prefix
        //  1: label substring
        //  2: initials prefix (launcher-style: "yt" -> "YouTube")
        //  3: initials substring
        //  4: any token prefix
        //  5: package-name substring
        val scored = entries.mapNotNull { entry ->
            val score = when {
                entry.labelLower.startsWith(needle) -> 0
                entry.labelLower.contains(needle) -> 1
                entry.initials.startsWith(needle) -> 2
                entry.initials.contains(needle) -> 3
                entry.tokens.any { it.startsWith(needle) } -> 4
                entry.packageLower.contains(needle) -> 5
                else -> null
            } ?: return@mapNotNull null
            score to entry
        }.sortedWith(compareBy({ it.first }, { it.second.labelLower }))
            .map { it.second }
            .take(MAX_RESULTS)

        val pm = context.packageManager
        val themedMode = isThemedIconMode(context)
        val packPkg = IconPackResolver.getActivePackPackage(context)
        return scored.map {
            val activityInfo = it.resolveInfo.activityInfo
            InstalledApp(
                label = it.label,
                packageName = activityInfo.packageName,
                activityName = activityInfo.name,
                icon = loadIcon(context, pm, it.resolveInfo, themedMode, packPkg),
            )
        }
    }

    fun launchIntent(app: InstalledApp): Intent {
        return Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_LAUNCHER)
            component = ComponentName(app.packageName, app.activityName)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
    }

    private fun ensureLoaded(context: Context): List<ResolvedEntry> {
        val cached = cachedApps
        if (cached != null) return cached

        val pm = context.packageManager
        val intent = Intent(Intent.ACTION_MAIN).apply { addCategory(Intent.CATEGORY_LAUNCHER) }
        val resolveInfos = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            pm.queryIntentActivities(intent, PackageManager.ResolveInfoFlags.of(0L))
        } else {
            @Suppress("DEPRECATION")
            pm.queryIntentActivities(intent, 0)
        }

        val selfPackage = context.packageName
        val entries = resolveInfos
            .filter { it.activityInfo.packageName != selfPackage }
            .map {
                val label = it.loadLabel(pm).toString()
                val tokens = tokenize(label)
                val initials = tokens.mapNotNull { t -> t.firstOrNull() }.joinToString("")
                ResolvedEntry(
                    label = label,
                    labelLower = label.lowercase(),
                    initials = initials,
                    tokens = tokens,
                    packageLower = it.activityInfo.packageName.lowercase(),
                    resolveInfo = it,
                )
            }
            .sortedBy { it.labelLower }

        cachedApps = entries
        return entries
    }

    /**
     * Splits [label] into lowercased tokens on whitespace, hyphens, underscores,
     * AND camelCase boundaries — so "YouTube Revanced" yields ["you", "tube",
     * "revanced"], matching how launchers like Lawnchair / Pixel interpret names.
     * This is what lets "yt" resolve to "YouTube" (initials y + t).
     */
    private fun tokenize(label: String): List<String> {
        val withCamelSplit = label.replace(Regex("(?<=[a-z])(?=[A-Z])"), " ")
        return withCamelSplit
            .split(Regex("[\\s\\-_/]+"))
            .map { it.lowercase() }
            .filter { it.isNotEmpty() }
    }

    /**
     * Best-effort icon lookup with the following preference order:
     *  1. If a launcher icon pack (ADW/GO-style) is installed, try its direct
     *     `<item component=... drawable=.../>` mapping via [IconPackResolver].
     *  2. On Android 13+ when the device is in themed-icons (dark) mode, prefer
     *     the monochrome layer from the app's AdaptiveIconDrawable — what the
     *     Pixel Launcher uses for its themed icons.
     *  3. Fall back to `info.loadIcon(pm)`, the standard launcher icon.
     */
    private fun loadIcon(
        context: Context,
        pm: PackageManager,
        info: ResolveInfo,
        themedMode: Boolean,
        packPkg: String?,
    ): Drawable {
        if (packPkg != null) {
            try {
                val activityInfo = info.activityInfo
                val component = ComponentName(activityInfo.packageName, activityInfo.name)
                IconPackResolver.loadIconForComponent(context, packPkg, component)?.let { return it }
            } catch (_: Throwable) {
            }
        }
        val base = info.loadIcon(pm)
        if (themedMode && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (base is AdaptiveIconDrawable) {
                base.monochrome?.let { return it }
            }
        }
        return base
    }

    /**
     * Rough heuristic for whether the user has asked the launcher to apply themed
     * (monochrome) icons. We don't have a public API that returns this directly, so
     * we treat dark-mode as a proxy — most themed-icon users enable them together,
     * and on Android 13+ monochrome icons are only drawn when supplied anyway.
     */
    private fun isThemedIconMode(context: Context): Boolean {
        val uiMode = context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
        return uiMode == Configuration.UI_MODE_NIGHT_YES
    }
}
