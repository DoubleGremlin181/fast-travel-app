package sh.kavi.fasttravel.core

enum class DeviceType {
    Windows, MacOS, Linux, Android, iOS, Unknown;

    companion object {
        fun fromString(value: String): DeviceType =
            entries.firstOrNull { it.name.equals(value, ignoreCase = true) } ?: Unknown
    }
}

data class Pattern(
    val match: String,
    val url: String,
)

data class Route(
    val devices: RouteDevices,
    val defaultUrl: String,
    val searchUrl: String? = null,
    val patterns: List<Pattern> = emptyList(),
    val browsers: List<String> = emptyList(),
)

sealed class RouteDevices {
    data object Wildcard : RouteDevices()
    data class DeviceList(val devices: List<DeviceType>) : RouteDevices()
}

data class IconOverride(
    val devices: List<DeviceType>,
    val iconUrl: String,
)

data class Command(
    val id: String,
    val triggers: List<String>,
    val name: String,
    val type: CommandType,
    val iconUrl: String? = null,
    val iconOverrides: List<IconOverride> = emptyList(),
    val suggestionsApi: String? = null,
    val normalize: List<NormalizeStep> = emptyList(),
    val routes: List<Route>,
)

enum class NormalizeStep(val value: String) {
    Trim("trim"),
    CollapseSpaces("collapseSpaces"),
    StripSpaces("stripSpaces"),
    Lower("lower"),
    Upper("upper"),
    Snake("snake"),
    Camel("camel");

    companion object {
        fun fromString(value: String): NormalizeStep? =
            entries.firstOrNull { it.value == value }
    }
}

enum class CommandType {
    Standard, Prefix, Redirect;

    companion object {
        fun fromString(value: String): CommandType = when (value.lowercase()) {
            "prefix" -> Prefix
            "redirect" -> Redirect
            else -> Standard
        }
    }

    fun toSerializedString(): String = when (this) {
        Standard -> "standard"
        Prefix -> "prefix"
        Redirect -> "redirect"
    }
}

data class Group(
    val id: String,
    val name: String,
    val color: String? = null,
    val commands: List<Command> = emptyList(),
)

data class FastTravelConfig(
    val version: Int,
    val defaultCommand: String,
    val defaultSuggestionsApi: String? = null,
    val groups: List<Group>,
    val ignoreList: List<String>,
)

data class ParseInput(
    val rawQuery: String,
    val device: DeviceType,
    val config: FastTravelConfig,
    val ignoreList: List<String> = emptyList(),
)

enum class MatchType(val value: String) {
    Exact("exact"),
    Prefix("prefix"),
    Pattern("pattern"),
    Search("search"),
    Url("url"),
    DefaultSearch("default-search");

    companion object {
        fun fromString(value: String): MatchType = when (value) {
            "exact" -> Exact
            "prefix" -> Prefix
            "pattern" -> Pattern
            "search" -> Search
            "url" -> Url
            "default-search" -> DefaultSearch
            else -> throw IllegalArgumentException("Unknown match type: $value")
        }
    }
}

sealed class ParseOutput {
    data class RedirectResult(
        val url: String,
        val commandId: String?,
        val matchType: MatchType,
    ) : ParseOutput()

    data class TypoResult(
        val originalQuery: String,
        val suggestedTrigger: String,
        val suggestedCommand: Command,
        val correctedUrl: String,
    ) : ParseOutput()
}
