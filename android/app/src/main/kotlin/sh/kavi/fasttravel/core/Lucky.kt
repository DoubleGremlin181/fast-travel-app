package sh.kavi.fasttravel.core

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
}
