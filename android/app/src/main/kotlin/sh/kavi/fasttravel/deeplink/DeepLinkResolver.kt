package sh.kavi.fasttravel.deeplink

import android.content.Context
import android.content.Intent
import android.net.Uri

/**
 * Resolves URLs to Android Intents, preferring native app handlers when available.
 */
object DeepLinkResolver {

    private val ALLOWED_SCHEMES = setOf("http", "https", "mailto", "tel")

    sealed class Resolution {
        data class Ok(val intent: Intent) : Resolution()
        data class Rejected(val reason: String) : Resolution()
    }

    /**
     * Create an Intent for the given URL.
     *
     * Only schemes in [ALLOWED_SCHEMES] are forwarded; other schemes (file://,
     * content://, custom app schemes) are rejected so a malicious or
     * mis-configured config cannot route Intent.ACTION_VIEW at arbitrary
     * targets. The set is conservative — extend it deliberately.
     */
    fun resolveOrReject(context: Context, url: String): Resolution {
        val uri = Uri.parse(url)
        val scheme = uri.scheme?.lowercase()
        if (scheme == null || scheme !in ALLOWED_SCHEMES) {
            return Resolution.Rejected("Unsupported URL scheme: $scheme")
        }
        val intent = Intent(Intent.ACTION_VIEW, uri).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return Resolution.Ok(intent)
    }

    /**
     * Convenience wrapper for callers that want the legacy "always returns an
     * Intent or null" shape. Returns null when the scheme is rejected.
     */
    fun resolve(context: Context, url: String): Intent? = when (val r = resolveOrReject(context, url)) {
        is Resolution.Ok -> r.intent
        is Resolution.Rejected -> null
    }
}
