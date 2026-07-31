package sh.kavi.fasttravel.data

import sh.kavi.fasttravel.core.Command
import sh.kavi.fasttravel.core.DeviceType
import sh.kavi.fasttravel.core.FastTravelConfig
import sh.kavi.fasttravel.core.Group
import sh.kavi.fasttravel.core.Pattern
import sh.kavi.fasttravel.core.Route

/**
 * Schema-shaped validation for the editable config. Returns a flat list of
 * human-readable errors. Empty list means the config is valid.
 */
object ConfigValidator {

    private val ID_REGEX = Regex("^[a-z0-9-]+$")
    // Scheme-only URIs like `mailto:` or `tel:` are valid per RFC 3986, so the
    // suffix is optional.
    private val SCHEME_REGEX = Regex("^[a-zA-Z][a-zA-Z0-9+.-]*:.*")
    private val PLACEHOLDER_REGEX =
        Regex("\\{([a-zA-Z0-9_]+)(?::(\\d+)(?:-(\\d+))?)?\\}")
    private val QUERY_URL_REGEX = Regex("^https?://.*\\{query\\}.*$")
    private const val MAX_PATTERN_LENGTH = 64

    fun validate(cfg: FastTravelConfig): List<String> {
        val errors = mutableListOf<String>()

        val commandIds = mutableSetOf<String>()
        val triggers = mutableMapOf<String, String>() // trigger -> commandId

        for (g in cfg.groups) {
            if (!ID_REGEX.matches(g.id)) {
                errors += "Group id '${g.id}' must be lowercase letters, digits, or hyphens."
            }
            for (cmd in g.commands) {
                validateCommand(cmd, commandIds, triggers, errors)
            }
        }

        if (cfg.defaultCommand.isBlank()) {
            errors += "Default command is required."
        } else if (!triggers.containsKey(cfg.defaultCommand.lowercase())) {
            errors += "Default command '${cfg.defaultCommand}' does not match any command trigger."
        }

        if (!cfg.defaultLuckyUrl.isNullOrBlank() && !QUERY_URL_REGEX.matches(cfg.defaultLuckyUrl)) {
            errors += "Default lucky URL must be an http(s) URL containing {query}."
        }

        return errors
    }

    /** Validate a single command in isolation; useful for the editor pre-save check. */
    fun validateCommand(
        cmd: Command,
        existingIds: Set<String> = emptySet(),
        existingTriggers: Map<String, String> = emptyMap(),
    ): List<String> {
        val errors = mutableListOf<String>()
        val ids = existingIds.toMutableSet()
        val trigs = existingTriggers.toMutableMap()
        validateCommand(cmd, ids, trigs, errors)
        return errors
    }

    private fun validateCommand(
        cmd: Command,
        commandIds: MutableSet<String>,
        triggers: MutableMap<String, String>,
        errors: MutableList<String>,
    ) {
        if (cmd.id.isBlank() || !ID_REGEX.matches(cmd.id)) {
            errors += "Command id '${cmd.id}' must be lowercase letters, digits, or hyphens."
        }
        if (!commandIds.add(cmd.id)) {
            errors += "Duplicate command id '${cmd.id}'."
        }
        if (cmd.triggers.isEmpty()) {
            errors += "Command '${cmd.id}' must have at least one trigger."
        }
        for (t in cmd.triggers) {
            if (t.isBlank()) {
                errors += "Command '${cmd.id}' has a blank trigger."
                continue
            }
            if (t.any { it.isWhitespace() }) {
                errors += "Trigger '$t' must not contain whitespace."
                continue
            }
            val key = t.lowercase()
            val existingOwner = triggers[key]
            if (existingOwner != null && existingOwner != cmd.id) {
                errors += "Trigger '$t' is used by multiple commands ('$existingOwner' and '${cmd.id}')."
            } else {
                triggers[key] = cmd.id
            }
        }
        if (cmd.name.isBlank()) {
            errors += "Command '${cmd.id}' must have a name."
        }
        if (!cmd.iconUrl.isNullOrBlank()) {
            validateUrl(cmd.iconUrl, "Command '${cmd.id}' iconUrl", errors)
        }
        // Each device may appear in at most one iconOverride across the list.
        val seenDevices = mutableMapOf<DeviceType, Int>()
        cmd.iconOverrides.forEachIndexed { i, ov ->
            if (ov.devices.isEmpty()) {
                errors += "Command '${cmd.id}' iconOverrides[$i]: devices must be non-empty."
            }
            for (d in ov.devices) {
                val prev = seenDevices[d]
                if (prev != null) {
                    errors += "Command '${cmd.id}' iconOverrides: device '${d.name}' appears in entries [$prev] and [$i]."
                } else {
                    seenDevices[d] = i
                }
            }
            if (ov.iconUrl.isBlank()) {
                errors += "Command '${cmd.id}' iconOverrides[$i]: iconUrl must not be blank."
            } else {
                validateUrl(ov.iconUrl, "Command '${cmd.id}' iconOverrides[$i] iconUrl", errors)
            }
        }
        if (!cmd.suggestionsApi.isNullOrBlank()) {
            validateUrl(cmd.suggestionsApi, "Command '${cmd.id}' suggestionsApi", errors)
        }
        if (cmd.routes.isEmpty()) {
            errors += "Command '${cmd.id}' must have at least one route."
        }
        for (route in cmd.routes) {
            validateRoute(cmd.id, route, errors)
        }
    }

    private fun validateLengthBounds(
        commandId: String,
        matchStr: String,
        errors: MutableList<String>,
    ) {
        for (m in PLACEHOLDER_REGEX.findAll(matchStr)) {
            val lo = m.groupValues[2].takeIf { it.isNotEmpty() }?.toInt() ?: continue
            val hi = m.groupValues[3].takeIf { it.isNotEmpty() }?.toInt()
            if (lo < 1 || lo > MAX_PATTERN_LENGTH) {
                errors += "Command '$commandId' pattern length '{${m.groupValues[1]}:$lo" +
                    (hi?.let { "-$it" } ?: "") + "}' out of bounds (must be 1..$MAX_PATTERN_LENGTH)."
            }
            if (hi != null && (hi < lo || hi > MAX_PATTERN_LENGTH)) {
                errors += "Command '$commandId' pattern range '{${m.groupValues[1]}:$lo-$hi}' invalid " +
                    "(must satisfy N ≤ M ≤ $MAX_PATTERN_LENGTH)."
            }
        }
    }

    private fun validateRoute(
        commandId: String,
        route: Route,
        errors: MutableList<String>,
    ) {
        validateUrl(route.defaultUrl, "Command '$commandId' defaultUrl", errors)
        if (!route.searchUrl.isNullOrBlank()) {
            validateUrl(route.searchUrl, "Command '$commandId' searchUrl", errors)
        }
        for (pattern in route.patterns) {
            validatePattern(commandId, pattern, errors)
        }
    }

    private fun validatePattern(
        commandId: String,
        pattern: Pattern,
        errors: MutableList<String>,
    ) {
        if (pattern.match.isBlank()) {
            errors += "Command '$commandId' has a pattern with an empty match."
            return
        }
        if (pattern.url.isBlank()) {
            errors += "Command '$commandId' has a pattern with an empty URL."
            return
        }
        val matchPlaceholders = PLACEHOLDER_REGEX.findAll(pattern.match)
            .map { it.groupValues[1] }
            .toSet()
        val urlPlaceholders = PLACEHOLDER_REGEX.findAll(pattern.url)
            .map { it.groupValues[1] }
            .toSet()
        val missing = urlPlaceholders - matchPlaceholders
        if (missing.isNotEmpty()) {
            errors += "Pattern URL in command '$commandId' references placeholder(s) " +
                missing.joinToString(", ") { "{$it}" } + " that are not in the match."
        }
        validateLengthBounds(commandId, pattern.match, errors)
    }

    private fun validateUrl(url: String, label: String, errors: MutableList<String>) {
        val trimmed = url.trim()
        if (trimmed.isEmpty()) {
            errors += "$label must not be empty."
            return
        }
        if (trimmed.any { it.isWhitespace() }) {
            errors += "$label must not contain whitespace."
            return
        }
        // Accept absolute URLs (any scheme) or relative paths.
        if (SCHEME_REGEX.matches(trimmed)) return
        if (trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) return
        // Allow bare `{placeholder}`-style URLs (will expand to something valid at runtime).
        if (trimmed.contains("{") && trimmed.contains("}")) return
        errors += "$label '$trimmed' is not a valid URL."
    }
}
