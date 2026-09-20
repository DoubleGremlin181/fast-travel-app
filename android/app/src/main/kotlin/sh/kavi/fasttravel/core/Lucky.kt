package sh.kavi.fasttravel.core

import java.net.HttpURLConnection
import java.net.URL
import java.net.URLDecoder

/**
 * Port of extension/src/core/lucky.ts.
 * Produces identical results for the same inputs as the TypeScript implementation.
 */
data class LuckyResult(val url: String, val commandId: String?)

/**
 * Build the Ctrl+Enter "lucky" navigation URL: the top-level defaultLuckyUrl
 * template with {query} substituted. Returns null when the config has no
 * defaultLuckyUrl (callers fall back to a normal search), the default
 * command doesn't resolve, or the query is empty.
 */
object Lucky {
    fun buildLuckyUrl(config: FastTravelConfig, query: String): LuckyResult? {
        val trimmed = query.trim()
        if (trimmed.isEmpty()) return null

        val luckyUrl = config.defaultLuckyUrl?.trim()
        if (luckyUrl.isNullOrEmpty()) return null

        val defaultCmd = CommandParser.buildTriggerMap(config)[config.defaultCommand.lowercase()]
            ?: return null

        return LuckyResult(
            url = luckyUrl.replace("{query}", UrlEncoding.component(trimmed)),
            commandId = defaultCmd.id,
        )
    }

    // google.com plus country domains (google.de, google.co.uk, google.com.au).
    private val GOOGLE_HOST_RE =
        Regex("^(www\\.)?google\\.[a-z]{2,3}(\\.[a-z]{2})?$", RegexOption.IGNORE_CASE)
    private val HTTP_URL_RE = Regex("^https?://", RegexOption.IGNORE_CASE)

    private fun parseGoogleUrl(url: String): URL? {
        val parsed = try {
            URL(url)
        } catch (_: Exception) {
            return null
        }
        if (!parsed.protocol.equals("https", ignoreCase = true)) return null
        return if (GOOGLE_HOST_RE.matches(parsed.host)) parsed else null
    }

    /**
     * True for Google search URLs — the only lucky templates whose redirect needs
     * resolving up front (see [extractRedirectNoticeTarget]).
     */
    fun isGoogleSearchUrl(url: String): Boolean = parseGoogleUrl(url)?.path == "/search"

    /**
     * Google answers a &btnI search with a 302 to /url?q=<target>, which renders
     * a click-through "Redirect Notice" for any visitor not arriving from a Google
     * page. Given that interstitial's URL, return the http(s) target it points
     * at; null for anything else.
     */
    fun extractRedirectNoticeTarget(url: String): String? {
        val parsed = parseGoogleUrl(url) ?: return null
        if (parsed.path != "/url") return null
        val params = parsed.query.orEmpty().split("&").associate { pair ->
            pair.substringBefore("=") to pair.substringAfter("=", "")
        }
        val raw = params["q"] ?: params["url"] ?: return null
        val target = try {
            URLDecoder.decode(raw, "UTF-8")
        } catch (_: Exception) {
            return null
        }
        if (!HTTP_URL_RE.containsMatchIn(target)) return null
        val host = try {
            URL(target).host
        } catch (_: Exception) {
            return null
        }
        return if (host.isNullOrEmpty()) null else target
    }
}

/**
 * Resolves a Google &btnI lucky URL to the page it points at, so the browser
 * opens the result directly instead of Google's "Redirect Notice" interstitial.
 * Any failure (offline, timeout, Google serving results or a consent page
 * instead) returns the lucky URL unchanged. Blocking — call off the main thread.
 */
object LuckyRedirectResolver {
    private const val CONNECT_TIMEOUT_MS = 3000
    private const val READ_TIMEOUT_MS = 3000

    fun resolve(url: String): String {
        if (!Lucky.isGoogleSearchUrl(url)) return url
        return try {
            val connection = URL(url).openConnection() as HttpURLConnection
            try {
                connection.connectTimeout = CONNECT_TIMEOUT_MS
                connection.readTimeout = READ_TIMEOUT_MS
                connection.requestMethod = "GET"
                // Only the Location header matters — the notice itself is never fetched.
                connection.instanceFollowRedirects = false
                val location = connection.getHeaderField("Location")
                location?.let { Lucky.extractRedirectNoticeTarget(it) } ?: url
            } finally {
                connection.disconnect()
            }
        } catch (_: Exception) {
            url
        }
    }
}
