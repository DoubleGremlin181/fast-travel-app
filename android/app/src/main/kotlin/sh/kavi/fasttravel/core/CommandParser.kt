package sh.kavi.fasttravel.core

/**
 * Port of extension/src/core/parser.ts.
 * Produces identical results for the same inputs as the TypeScript implementation.
 */
object CommandParser {

    /**
     * Common words loaded from assets. These are skipped during typo detection
     * to avoid false positives (e.g. "go" being suggested as "g").
     */
    private var commonWords: Set<String> = emptySet()

    /**
     * Initialize the common words list. Should be called once at app startup.
     * For unit tests, this can be called with the parsed list directly.
     */
    fun setCommonWords(words: Set<String>) {
        commonWords = words.map { it.lowercase() }.toSet()
    }

    /**
     * Valid TLDs loaded from assets (shared/config/tlds.json), used by URL
     * detection. Should be set once at app startup; unit tests set it directly.
     */
    private var tlds: Set<String> = emptySet()

    fun setTlds(list: Set<String>) {
        tlds = list.map { it.lowercase() }.toSet()
    }

    /**
     * Build a flat trigger-to-command lookup map from all groups (recursively).
     * Nesting is display-only; parsing uses flat trigger lookup.
     */
    fun buildTriggerMap(config: FastTravelConfig): Map<String, Command> {
        val map = mutableMapOf<String, Command>()
        for (group in config.groups) {
            for (cmd in group.commands) {
                for (trigger in cmd.triggers) {
                    map[trigger.lowercase()] = cmd
                }
            }
        }
        return map
    }

    /**
     * Find the best matching route for a device.
     * Fallback chain: (1) exact device match -> (2) wildcard "*" -> (3) "Unknown"
     */
    fun findRoute(routes: List<Route>, device: DeviceType): Route? {
        // 1. Exact device match
        val exact = routes.find { route ->
            val devices = route.devices
            devices is RouteDevices.DeviceList && device in devices.devices
        }
        if (exact != null) return exact

        // 2. Wildcard
        val wildcard = routes.find { it.devices is RouteDevices.Wildcard }
        if (wildcard != null) return wildcard

        // 3. "Unknown" fallback
        val unknown = routes.find { route ->
            val devices = route.devices
            devices is RouteDevices.DeviceList && DeviceType.Unknown in devices.devices
        }
        return unknown
    }

    /**
     * Compile a pattern match string into a regex with positional capture groups,
     * and return the ordered list of placeholder names.
     * Java/Kotlin regex named groups don't support underscores, so we use
     * positional groups and map them back by index.
     */
    private val placeholderRegex = Regex("\\{(\\w+)(?::(\\d+)(?:-(\\d+))?)?\\}")

    private fun compilePattern(matchStr: String): Pair<Regex, List<String>> {
        val placeholders = placeholderRegex.findAll(matchStr).map { it.groupValues[1] }.toList()
        val regexStr = placeholderRegex.replace(matchStr) { m ->
            val lo = m.groupValues[2]
            val hi = m.groupValues[3]
            when {
                lo.isEmpty() -> "([^/]+)"
                hi.isEmpty() -> "([^\\s/]{$lo})"
                else -> "([^\\s/]{$lo,$hi})"
            }
        }
        return Pair(Regex("^${regexStr}$", RegexOption.IGNORE_CASE), placeholders)
    }

    /**
     * Try to match args against a route's patterns.
     * Returns the resolved URL if a pattern matches, null otherwise.
     */
    private fun tryPatternMatch(route: Route, argsStr: String): String? {
        if (route.patterns.isEmpty()) return null

        for (pattern in route.patterns) {
            val (regex, placeholders) = compilePattern(pattern.match)
            val matchResult = regex.find(argsStr)
            if (matchResult != null) {
                var url = pattern.url
                for ((index, key) in placeholders.withIndex()) {
                    val value = matchResult.groupValues[index + 1]
                    url = url.replace("{$key}", encodeURIComponent(value))
                }
                return url
            }
        }

        return null
    }

    /**
     * Apply an ordered pipeline of normalize transforms to the args string.
     * Exposed so JUnit can exercise the pipeline in isolation.
     */
    fun normalizeArgs(argsStr: String, steps: List<NormalizeStep>): String {
        if (steps.isEmpty()) return argsStr
        val wsRegex = Regex("\\s+")
        var out = argsStr
        for (step in steps) {
            out = when (step) {
                NormalizeStep.Trim -> out.trim()
                NormalizeStep.CollapseSpaces -> out.replace(wsRegex, " ")
                NormalizeStep.StripSpaces -> out.replace(wsRegex, "")
                NormalizeStep.Lower -> out.lowercase()
                NormalizeStep.Upper -> out.uppercase()
                NormalizeStep.Snake -> out.replace(wsRegex, "_").lowercase()
                NormalizeStep.Camel -> {
                    val parts = out.split(wsRegex).filter { it.isNotEmpty() }
                    if (parts.isEmpty()) {
                        ""
                    } else {
                        val first = parts.first()
                        val rest = parts.drop(1)
                        first.lowercase() +
                            rest.joinToString("") { it[0].uppercaseChar() + it.substring(1).lowercase() }
                    }
                }
            }
        }
        return out
    }

    /**
     * Compute Levenshtein distance between two strings.
     */
    fun levenshtein(a: String, b: String): Int {
        val m = a.length
        val n = b.length
        val dp = Array(m + 1) { IntArray(n + 1) }

        for (i in 0..m) dp[i][0] = i
        for (j in 0..n) dp[0][j] = j

        for (i in 1..m) {
            for (j in 1..n) {
                val cost = if (a[i - 1] == b[j - 1]) 0 else 1
                dp[i][j] = minOf(
                    dp[i - 1][j] + 1,
                    dp[i][j - 1] + 1,
                    dp[i - 1][j - 1] + cost,
                )
            }
        }

        return dp[m][n]
    }

    /**
     * Find the closest typo suggestion for an unmatched trigger.
     * Threshold: <=5 char triggers use distance 1, >5 use distance 2.
     */
    private fun findTypoSuggestion(
        input: String,
        triggerMap: Map<String, Command>,
        ignoreList: List<String>,
    ): Pair<String, Command>? {
        val lowerInput = input.lowercase()

        // Check if this input is in the ignore list
        if (ignoreList.any { it.lowercase() == lowerInput }) {
            return null
        }

        // Skip common words to avoid false positives
        if (commonWords.contains(lowerInput)) {
            return null
        }

        val threshold = if (lowerInput.length <= 5) 1 else 2
        var bestTrigger: String? = null
        var bestCommand: Command? = null
        var bestDistance = Int.MAX_VALUE

        for ((trigger, command) in triggerMap) {
            // Skip prefix commands for typo detection (they work on substrings, not exact triggers)
            if (command.type == CommandType.Prefix) continue

            val distance = levenshtein(lowerInput, trigger)
            if (distance in 1..threshold && (bestTrigger == null || distance < bestDistance)) {
                bestTrigger = trigger
                bestCommand = command
                bestDistance = distance
            }
        }
        // Note: Redirect-type typo suggestions are handled at the callsite — they only
        // apply when the input has no args (hard match behavior).

        return if (bestTrigger != null && bestCommand != null) {
            Pair(bestTrigger, bestCommand)
        } else {
            null
        }
    }

    /**
     * Substitute {query} in a URL template with the encoded value.
     */
    private fun substituteQuery(urlTemplate: String, query: String): String {
        return urlTemplate.replace("{query}", encodeURIComponent(query))
    }

    /**
     * Substitute {term} and optionally {query} in prefix command URLs.
     */
    private fun substitutePrefixUrl(urlTemplate: String, term: String, query: String? = null): String {
        var url = urlTemplate.replace("{term}", encodeURIComponent(term))
        if (query != null) {
            url = url.replace("{query}", encodeURIComponent(query))
        }
        return url
    }

    private fun encodeURIComponent(value: String): String = UrlEncoding.component(value)

    /**
     * Parse a raw query string and return a redirect URL or typo suggestion.
     */
    fun parseCommand(input: ParseInput): ParseOutput {
        val query = input.rawQuery.trim()

        if (query.isEmpty()) {
            return makeDefaultRedirect(input.config, input.device)
        }

        val triggerMap = buildTriggerMap(input.config)

        // 1. Check prefix commands first
        val prefixResult = tryPrefixCommands(query, triggerMap, input.device)
        if (prefixResult != null) return prefixResult

        // 2. Try standard command
        val parts = query.split(Regex("\\s+"))
        val trigger = parts[0].lowercase()
        val args = parts.drop(1)
        val argsStr = args.joinToString(" ")

        val command = triggerMap[trigger]

        // 2a. Redirect-type: hard match ONLY (no args). With args -> fall through to default search.
        if (command != null && command.type == CommandType.Redirect && args.isEmpty()) {
            val route = findRoute(command.routes, input.device)
                ?: return makeDefaultSearch(input.config, input.device, query)
            return ParseOutput.RedirectResult(
                url = route.defaultUrl,
                commandId = command.id,
                matchType = MatchType.Exact,
            )
        }
        if (command != null && command.type == CommandType.Redirect && args.isNotEmpty()) {
            // Redirect with args — ignore the command, fall through to default search.
            return makeDefaultSearch(input.config, input.device, query)
        }

        if (command != null && command.type == CommandType.Standard) {
            val route = findRoute(command.routes, input.device)
                ?: return makeDefaultSearch(input.config, input.device, query)

            // No args -> defaultUrl
            if (args.isEmpty()) {
                return ParseOutput.RedirectResult(
                    url = route.defaultUrl,
                    commandId = command.id,
                    matchType = MatchType.Exact,
                )
            }

            val normalizedArgs = normalizeArgs(argsStr, command.normalize)

            // Try pattern match
            val patternUrl = tryPatternMatch(route, normalizedArgs)
            if (patternUrl != null) {
                return ParseOutput.RedirectResult(
                    url = patternUrl,
                    commandId = command.id,
                    matchType = MatchType.Pattern,
                )
            }

            // Fall back to searchUrl
            if (route.searchUrl != null) {
                return ParseOutput.RedirectResult(
                    url = substituteQuery(route.searchUrl, normalizedArgs),
                    commandId = command.id,
                    matchType = MatchType.Search,
                )
            }

            // No searchUrl, use defaultUrl
            return ParseOutput.RedirectResult(
                url = route.defaultUrl,
                commandId = command.id,
                matchType = MatchType.Exact,
            )
        }

        // 2b. Single-token URL? Navigate directly. Runs after command matching so a
        // configured trigger always wins, and before typo detection so domain-like
        // tokens are never "corrected" into a command.
        val urlResult = tryUrlDetection(query)
        if (urlResult != null) return urlResult

        // 3. No command match - check for typo.
        // Redirect-type typo only applies on hard match (no args). With args, skip typo
        // detection so "fof in sf" goes straight to default search, not "Did you mean fog?".
        val mergedIgnoreList = input.config.ignoreList + input.ignoreList
        val typo = findTypoSuggestion(trigger, triggerMap, mergedIgnoreList)
            ?.takeUnless { (_, suggested) -> suggested.type == CommandType.Redirect && args.isNotEmpty() }
        if (typo != null) {
            val (suggestedTrigger, suggestedCommand) = typo
            // Build the corrected URL using the suggested command
            val correctedQuery = if (args.isNotEmpty()) "$suggestedTrigger $argsStr" else suggestedTrigger
            val correctedResult = parseCommand(
                ParseInput(
                    rawQuery = correctedQuery,
                    device = input.device,
                    config = input.config,
                    ignoreList = input.ignoreList,
                )
            )

            val correctedUrl = when (correctedResult) {
                is ParseOutput.RedirectResult -> correctedResult.url
                is ParseOutput.TypoResult -> correctedResult.correctedUrl
            }

            return ParseOutput.TypoResult(
                originalQuery = query,
                suggestedTrigger = suggestedTrigger,
                suggestedCommand = suggestedCommand,
                correctedUrl = correctedUrl,
            )
        }

        // 4. Fall through to default command
        return makeDefaultSearch(input.config, input.device, query)
    }

    /**
     * Detect a single-token URL: an explicit http(s) URL, or a bare
     * hostname[:port][/path...] whose host is "localhost", an IPv4 address, or
     * a domain whose final label is a known TLD (shared/config/tlds.json).
     *
     * Line-for-line port of tryUrlDetection in extension/src/core/parser.ts.
     * Returns null when the query is not a URL.
     */
    fun tryUrlDetection(query: String): ParseOutput.RedirectResult? {
        if (query.isEmpty() || query.contains(URL_WS_RE)) return null

        fun asUrl(url: String) = ParseOutput.RedirectResult(
            url = url,
            commandId = null,
            matchType = MatchType.Url,
        )

        // Explicit scheme: pass through verbatim (must have something after //).
        if (Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(query)) {
            return if (Regex("^https?://.", RegexOption.IGNORE_CASE).containsMatchIn(query)) {
                asUrl(query)
            } else {
                null
            }
        }

        // Split authority from path/query/hash.
        val cutIdx = query.indexOfFirst { it == '/' || it == '?' || it == '#' }
        val authority = if (cutIdx == -1) query else query.substring(0, cutIdx)

        // Split optional :port.
        var host = authority
        val colonIdx = authority.indexOf(':')
        if (colonIdx != -1) {
            host = authority.substring(0, colonIdx)
            if (!PORT_RE.matches(authority.substring(colonIdx + 1))) return null
        }
        if (host.isEmpty()) return null

        val hostLower = host.lowercase()
        if (hostLower == "localhost" || isIPv4(hostLower)) {
            return asUrl("https://$query")
        }

        val labels = hostLower.split(".")
        if (labels.size < 2) return null
        if (!labels.all { LABEL_RE.matches(it) }) return null
        if (labels.last() !in tlds) return null

        return asUrl("https://$query")
    }

    private val LABEL_RE = Regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?$")
    private val PORT_RE = Regex("^\\d{1,5}$")
    private val OCTET_RE = Regex("^\\d{1,3}$")

    // Mirrors URL_WS_RE in extension/src/core/parser.ts: JS \s spelled out
    // explicitly because Kotlin's \s is ASCII-only. Keep the two in sync.
    private val URL_WS_RE = Regex(
        "[ \\t\\n\\r\\u000C\\u000B\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]"
    )

    private fun isIPv4(host: String): Boolean {
        val octets = host.split(".")
        if (octets.size != 4) return false
        return octets.all { OCTET_RE.matches(it) && it.toInt() <= 255 }
    }

    /**
     * Try all prefix commands against the query.
     */
    private fun tryPrefixCommands(
        query: String,
        triggerMap: Map<String, Command>,
        device: DeviceType,
    ): ParseOutput.RedirectResult? {
        // Collect prefix commands and sort by trigger length (longest first)
        val prefixCommands = triggerMap.entries
            .filter { it.value.type == CommandType.Prefix }
            .map { it.key to it.value }
            .sortedByDescending { it.first.length }

        for ((trigger, command) in prefixCommands) {
            val lowerQuery = query.lowercase()
            if (!lowerQuery.startsWith(trigger)) continue

            val rest = query.substring(trigger.length).trim()
            val route = findRoute(command.routes, device) ?: continue

            if (rest.isEmpty()) {
                // Prefix with no term - go to defaultUrl (without substitution)
                return ParseOutput.RedirectResult(
                    url = route.defaultUrl,
                    commandId = command.id,
                    matchType = MatchType.Prefix,
                )
            }

            // Split rest into term and optional extra args
            val restParts = rest.split(Regex("\\s+"))
            val term = restParts[0]
            val extraArgs = restParts.drop(1).joinToString(" ")

            if (extraArgs.isNotEmpty()) {
                // Has extra args -> use searchUrl with {term} and {query}
                if (route.searchUrl != null) {
                    return ParseOutput.RedirectResult(
                        url = substitutePrefixUrl(route.searchUrl, term, extraArgs),
                        commandId = command.id,
                        matchType = MatchType.Prefix,
                    )
                }
            }

            // No extra args -> use defaultUrl with {term}
            return ParseOutput.RedirectResult(
                url = substitutePrefixUrl(route.defaultUrl, term),
                commandId = command.id,
                matchType = MatchType.Prefix,
            )
        }

        return null
    }

    /**
     * Build a default redirect (empty query -> default command's defaultUrl).
     */
    private fun makeDefaultRedirect(
        config: FastTravelConfig,
        device: DeviceType,
    ): ParseOutput.RedirectResult {
        val triggerMap = buildTriggerMap(config)
        val defaultCmd = triggerMap[config.defaultCommand.lowercase()]
        if (defaultCmd != null) {
            val route = findRoute(defaultCmd.routes, device)
            if (route != null) {
                return ParseOutput.RedirectResult(
                    url = route.defaultUrl,
                    commandId = defaultCmd.id,
                    matchType = MatchType.Exact,
                )
            }
        }
        // Unreachable with a valid config: defaultCommand could not be resolved.
        return ParseOutput.RedirectResult(
            url = "https://www.google.com",
            commandId = null,
            matchType = MatchType.DefaultSearch,
        )
    }

    /**
     * Build a default search redirect (no matching command -> search with default command).
     */
    private fun makeDefaultSearch(
        config: FastTravelConfig,
        device: DeviceType,
        query: String,
    ): ParseOutput.RedirectResult {
        val triggerMap = buildTriggerMap(config)
        val defaultCmd = triggerMap[config.defaultCommand.lowercase()]
        if (defaultCmd != null) {
            val route = findRoute(defaultCmd.routes, device)
            if (route?.searchUrl != null) {
                return ParseOutput.RedirectResult(
                    url = substituteQuery(route.searchUrl, query),
                    commandId = defaultCmd.id,
                    matchType = MatchType.DefaultSearch,
                )
            }
            // Default command resolves but has no searchUrl for this device —
            // land on its home page rather than assuming a specific engine.
            if (route != null) {
                return ParseOutput.RedirectResult(
                    url = route.defaultUrl,
                    commandId = defaultCmd.id,
                    matchType = MatchType.DefaultSearch,
                )
            }
        }
        // Unreachable with a valid config: defaultCommand could not be resolved.
        return ParseOutput.RedirectResult(
            url = "https://www.google.com/search?q=${encodeURIComponent(query)}",
            commandId = null,
            matchType = MatchType.DefaultSearch,
        )
    }
}
