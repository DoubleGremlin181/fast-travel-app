package sh.kavi.fasttravel.core

import java.net.URLEncoder

/**
 * URL encoding compatible with JavaScript's encodeURIComponent. Java's
 * URLEncoder encodes spaces as `+` and percent-encodes characters that
 * encodeURIComponent leaves alone — this helper rewrites those back so
 * the extension and Android produce byte-identical URLs from the same
 * config + query.
 */
object UrlEncoding {
    fun component(value: String): String =
        URLEncoder.encode(value, "UTF-8")
            .replace("+", "%20")
            .replace("%21", "!")
            .replace("%27", "'")
            .replace("%28", "(")
            .replace("%29", ")")
            .replace("%7E", "~")
}
