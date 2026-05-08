package sh.kavi.fasttravel.core

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

data class Suggestion(
    val text: String,
    val displayText: String,
    val commandTrigger: String? = null,
    val commandName: String? = null,
    val commandIconUrl: String? = null,
    val isHistory: Boolean = false,
)

/**
 * Fetches autocomplete suggestions for the search input.
 *
 * Rules (per R7.3):
 *  - No command detected -> use defaultSuggestionsApi with the full query.
 *  - Command detected with its own suggestionsApi -> use that API with the post-command query.
 *  - Command detected WITHOUT suggestionsApi -> use defaultSuggestionsApi but PREFIX the
 *    command trigger into the query sent to the API (so Google autocomplete gets
 *    "yt cats", not "cats"). Results are still attributed to the detected command.
 */
object SuggestionProvider {

    private const val MAX_SUGGESTIONS = 8
    private const val CONNECT_TIMEOUT_MS = 3000
    private const val READ_TIMEOUT_MS = 3000

    suspend fun fetchSuggestions(
        input: String,
        config: FastTravelConfig,
    ): List<Suggestion> {
        val trimmed = input.trim()
        if (trimmed.isEmpty()) return emptyList()

        val triggerMap = CommandParser.buildTriggerMap(config)

        // 1. Prefix commands (e.g. "r/ask", "$AAPL"): longest-trigger-first so
        //    "ra/" wins over "r/". Query upstream with the FULL input so
        //    autocomplete is contextual to the prefix, and tag every result
        //    with the matched command so the UI paints the prefix command's
        //    favicon.
        val lowerTrimmed = trimmed.lowercase()
        val prefixCommands = triggerMap.entries
            .filter { (_, cmd) -> cmd.type == CommandType.Prefix }
            .sortedByDescending { (trigger, _) -> trigger.length }
        for ((trigger, cmd) in prefixCommands) {
            if (!lowerTrimmed.startsWith(trigger)) continue
            // Require at least one character after the prefix before hitting
            // the API — otherwise we'd query upstream for a bare "r/" on every
            // keystroke.
            if (trimmed.length <= trigger.length) return emptyList()
            val apiUrl = cmd.suggestionsApi
                ?: config.defaultSuggestionsApi
                ?: return emptyList()
            return fetchFromApi(apiUrl, trimmed).map { s ->
                // Some engines echo the prefix back; others don't. Either way,
                // the stored `text` (used on row selection) must include it so
                // the parser routes through the prefix command.
                val withPrefix = if (s.lowercase().startsWith(trigger)) s
                else "$trigger${s.removePrefix(" ")}"
                Suggestion(
                    text = withPrefix,
                    displayText = withPrefix,
                    commandTrigger = trigger,
                    commandName = cmd.name,
                    commandIconUrl = resolveIconUrl(cmd, DeviceType.Android),
                )
            }
        }

        // 2. Standard commands with args.
        val parts = trimmed.split(Regex("\\s+"))
        val firstToken = parts[0].lowercase()
        val matchedCommand = triggerMap[firstToken]

        if (matchedCommand != null && matchedCommand.type == CommandType.Standard && parts.size > 1) {
            val searchTerms = parts.drop(1).joinToString(" ")
            val primaryTrigger = matchedCommand.triggers.first()

            val hasOwnApi = matchedCommand.suggestionsApi != null
            val apiUrl = matchedCommand.suggestionsApi
                ?: config.defaultSuggestionsApi
                ?: return emptyList()
            val apiQuery = if (hasOwnApi) searchTerms else "$primaryTrigger $searchTerms"

            return fetchFromApi(apiUrl, apiQuery).map { s ->
                val displayTail = if (hasOwnApi) s else {
                    if (s.startsWith("$primaryTrigger ", ignoreCase = true))
                        s.substring(primaryTrigger.length + 1)
                    else
                        s
                }.ifEmpty { s }
                Suggestion(
                    text = "$firstToken $displayTail",
                    displayText = displayTail,
                    commandTrigger = firstToken,
                    commandName = matchedCommand.name,
                    commandIconUrl = resolveIconUrl(matchedCommand, DeviceType.Android),
                )
            }
        }

        // 3. Default fallback — no command context.
        val apiUrl = config.defaultSuggestionsApi ?: return emptyList()
        return fetchFromApi(apiUrl, trimmed).map { s ->
            Suggestion(text = s, displayText = s, commandTrigger = null, commandName = null)
        }
    }

    private suspend fun fetchFromApi(
        urlTemplate: String,
        query: String,
    ): List<String> = withContext(Dispatchers.IO) {
        val url = urlTemplate.replace("{query}", UrlEncoding.component(query))

        try {
            val connection = URL(url).openConnection() as HttpURLConnection
            connection.connectTimeout = CONNECT_TIMEOUT_MS
            connection.readTimeout = READ_TIMEOUT_MS
            connection.requestMethod = "GET"
            connection.setRequestProperty("Accept", "application/json")

            if (connection.responseCode != HttpURLConnection.HTTP_OK) {
                connection.disconnect()
                return@withContext emptyList()
            }

            val responseText = try {
                BufferedReader(InputStreamReader(connection.inputStream)).use { it.readText() }
            } finally {
                connection.disconnect()
            }

            parseResponse(responseText)
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun parseResponse(responseText: String): List<String> {
        return try {
            val data = JSONArray(responseText)

            // OpenSearch format: [query, [suggestions, ...]]
            if (data.length() >= 2) {
                val second = data.opt(1)
                if (second is JSONArray) {
                    val results = mutableListOf<String>()
                    for (i in 0 until minOf(second.length(), MAX_SUGGESTIONS)) {
                        results.add(second.getString(i))
                    }
                    return results
                }
            }

            // DuckDuckGo format: [{phrase: "..."}, ...]
            if (data.length() > 0 && data.opt(0) is JSONObject) {
                val results = mutableListOf<String>()
                for (i in 0 until minOf(data.length(), MAX_SUGGESTIONS)) {
                    val item = data.getJSONObject(i)
                    if (item.has("phrase")) {
                        results.add(item.getString("phrase"))
                    }
                }
                return results
            }

            // Plain array of strings
            if (data.length() > 0 && data.opt(0) is String) {
                val results = mutableListOf<String>()
                for (i in 0 until minOf(data.length(), MAX_SUGGESTIONS)) {
                    results.add(data.getString(i))
                }
                return results
            }

            emptyList()
        } catch (_: Exception) {
            emptyList()
        }
    }
}
