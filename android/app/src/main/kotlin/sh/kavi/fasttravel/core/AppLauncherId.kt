package sh.kavi.fasttravel.core

/**
 * Installed apps are recorded in search history and ranked alongside real commands.
 * To reuse the command-keyed [Frecency] and history machinery, an app launch is stored
 * under a namespaced pseudo-command id of the form `app:<package>/<activity>`.
 *
 * Package names never contain `/`, and activity names may contain `.`/`$` but not `/`,
 * so the first slash unambiguously separates the two halves.
 */
private const val APP_ID_PREFIX = "app:"

fun installedAppId(packageName: String, activityName: String): String =
    "$APP_ID_PREFIX$packageName/$activityName"

fun isInstalledAppId(id: String?): Boolean = id != null && id.startsWith(APP_ID_PREFIX)

/** Returns (packageName, activityName) for a valid app id, or null otherwise. */
fun parseInstalledAppId(id: String): Pair<String, String>? {
    if (!id.startsWith(APP_ID_PREFIX)) return null
    val rest = id.substring(APP_ID_PREFIX.length)
    val slash = rest.indexOf('/')
    if (slash <= 0 || slash >= rest.length - 1) return null
    return rest.substring(0, slash) to rest.substring(slash + 1)
}
