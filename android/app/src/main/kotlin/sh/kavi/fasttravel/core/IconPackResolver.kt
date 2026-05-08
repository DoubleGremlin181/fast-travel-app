package sh.kavi.fasttravel.core

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.drawable.Drawable
import android.os.Build
import org.xmlpull.v1.XmlPullParser

/**
 * Resolves installed-app icons through the de-facto icon-pack protocol shared
 * by Nova, ADW, Apex, Smart Launcher, and friends.
 *
 * Simplifications vs the full spec:
 *  - No user selection UI; the first detected pack wins.
 *  - Only direct `<item component=... drawable=.../>` mappings are honored.
 *    `<iconback>/<iconmask>/<iconupon>` composition is ignored.
 */
object IconPackResolver {

    private val PACK_INTENT_ACTIONS = listOf(
        "org.adw.launcher.THEMES",
        "com.gau.go.launcherex.theme",
    )

    @Volatile
    private var cachedPackPkg: String? = null

    @Volatile
    private var cachedPackLookupDone: Boolean = false

    @Volatile
    private var componentMaps: Map<String, Map<String, String>> = emptyMap()

    fun invalidate() {
        cachedPackPkg = null
        cachedPackLookupDone = false
        componentMaps = emptyMap()
    }

    fun getActivePackPackage(context: Context): String? {
        if (cachedPackLookupDone) return cachedPackPkg
        val pkg = try {
            detectFirstInstalledPack(context)
        } catch (_: Throwable) {
            null
        }
        cachedPackPkg = pkg
        cachedPackLookupDone = true
        return pkg
    }

    fun loadIconForComponent(
        context: Context,
        packPkg: String,
        component: ComponentName,
    ): Drawable? {
        return try {
            val mapping = ensureMappingLoaded(context, packPkg) ?: return null
            val key = "ComponentInfo{${component.packageName}/${component.className}}"
            val drawableName = mapping[key] ?: return null
            val pm = context.packageManager
            val packResources = pm.getResourcesForApplication(packPkg)
            val resId = packResources.getIdentifier(drawableName, "drawable", packPkg)
            if (resId == 0) return null
            @Suppress("DEPRECATION")
            packResources.getDrawable(resId, null)
        } catch (_: Throwable) {
            null
        }
    }

    private fun detectFirstInstalledPack(context: Context): String? {
        val pm = context.packageManager
        for (action in PACK_INTENT_ACTIONS) {
            val intent = Intent(action)
            val infos = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                pm.queryIntentActivities(intent, PackageManager.ResolveInfoFlags.of(0L))
            } else {
                @Suppress("DEPRECATION")
                pm.queryIntentActivities(intent, 0)
            }
            val first = infos.firstOrNull()
            if (first != null) return first.activityInfo.packageName
        }
        return null
    }

    private fun ensureMappingLoaded(context: Context, packPkg: String): Map<String, String>? {
        componentMaps[packPkg]?.let { return it }
        val parsed = try {
            parseAppFilter(context, packPkg)
        } catch (_: Throwable) {
            null
        } ?: return null
        synchronized(this) {
            val current = componentMaps
            if (current[packPkg] == null) {
                componentMaps = current + (packPkg to parsed)
            }
        }
        return parsed
    }

    private fun parseAppFilter(context: Context, packPkg: String): Map<String, String>? {
        val pm = context.packageManager
        val packResources = pm.getResourcesForApplication(packPkg)
        val result = HashMap<String, String>()

        val resId = packResources.getIdentifier("appfilter", "xml", packPkg)
        val parser: XmlPullParser = if (resId != 0) {
            packResources.getXml(resId)
        } else {
            packResources.assets.openXmlResourceParser(0, "res/xml/appfilter.xml")
        }

        try {
            var event = parser.eventType
            while (event != XmlPullParser.END_DOCUMENT) {
                if (event == XmlPullParser.START_TAG && parser.name == "item") {
                    val component = parser.getAttributeValue(null, "component")
                    val drawable = parser.getAttributeValue(null, "drawable")
                    if (!component.isNullOrEmpty() && !drawable.isNullOrEmpty()) {
                        result[component] = drawable
                    }
                }
                event = parser.next()
            }
        } finally {
            try {
                if (parser is AutoCloseable) parser.close()
            } catch (_: Throwable) {
            }
        }

        return if (result.isEmpty()) null else result
    }
}
