package sh.kavi.fasttravel.deeplink

import java.net.URLDecoder

/**
 * Pure-Kotlin helpers for extracting a search query from a Fast Travel deep link.
 * Separated from the Activity so it can be unit-tested on the JVM without android.jar.
 */
object DeepLinkQueryParser {

    /**
     * Extract the `q` parameter from a `fasttravel://search?q=...` URL.
     * Returns null if the URL is not a Fast Travel deep link or has no `q`.
     */
    fun extractQueryFromUrl(url: String?): String? {
        if (url.isNullOrBlank()) return null
        val match = Regex("^fasttravel://search(?:\\?(.*))?$").matchEntire(url.trim()) ?: return null
        val qs = match.groupValues[1].takeIf { it.isNotEmpty() } ?: return null
        for (pair in qs.split('&')) {
            val eq = pair.indexOf('=')
            if (eq <= 0) continue
            val key = pair.substring(0, eq)
            val value = pair.substring(eq + 1)
            if (key == "q") {
                return try {
                    URLDecoder.decode(value.replace("+", "%20"), "UTF-8")
                } catch (_: Exception) {
                    value
                }
            }
        }
        return null
    }

    /**
     * Extract a query from an action + extras combination, matching the Android
     * SearchManager / WEB_SEARCH / GLOBAL_SEARCH contract.
     */
    fun extractQueryFromSearchAction(
        action: String?,
        queryExtra: String?,
        searchManagerQueryExtra: String?,
    ): String? {
        val searchActions = setOf(
            "android.intent.action.SEARCH",
            "android.intent.action.WEB_SEARCH",
            "android.search.action.GLOBAL_SEARCH",
        )
        if (action !in searchActions) return null
        return queryExtra ?: searchManagerQueryExtra
    }
}
