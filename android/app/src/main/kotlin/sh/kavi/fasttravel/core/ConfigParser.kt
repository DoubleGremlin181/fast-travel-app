package sh.kavi.fasttravel.core

import org.json.JSONArray
import org.json.JSONObject

class ConfigParseException(message: String, cause: Throwable? = null) : RuntimeException(message, cause)

object ConfigParser {

    /** Get an optional string field, returning null if absent (not the empty string). */
    private fun JSONObject.optStringOrNull(key: String): String? =
        if (has(key) && !isNull(key)) getString(key) else null

    /**
     * Parse the JSON, returning null on any failure. Use this for cache/remote
     * loads where falling through to the next source is preferable to crashing.
     * The Settings editor uses [parseConfig] directly so it surfaces errors.
     */
    fun safeParseConfig(json: String): FastTravelConfig? = try {
        parseConfig(json)
    } catch (_: Exception) {
        null
    }

    fun parseConfig(json: String): FastTravelConfig {
        val obj = JSONObject(json)
        return FastTravelConfig(
            version = obj.getInt("version"),
            defaultCommand = obj.getString("defaultCommand"),
            defaultSuggestionsApi = obj.optStringOrNull("defaultSuggestionsApi"),
            groups = parseGroups(obj.getJSONArray("groups")),
            ignoreList = if (obj.has("ignoreList")) parseStringList(obj.getJSONArray("ignoreList")) else emptyList(),
        )
    }

    private fun parseGroups(arr: JSONArray): List<Group> {
        val groups = mutableListOf<Group>()
        for (i in 0 until arr.length()) {
            groups.add(parseGroup(arr.getJSONObject(i)))
        }
        return groups
    }

    private fun parseGroup(obj: JSONObject): Group {
        return Group(
            id = obj.getString("id"),
            name = obj.getString("name"),
            color = obj.optStringOrNull("color"),
            commands = if (obj.has("commands")) parseCommands(obj.getJSONArray("commands")) else emptyList(),
        )
    }

    private fun parseCommands(arr: JSONArray): List<Command> {
        val commands = mutableListOf<Command>()
        for (i in 0 until arr.length()) {
            commands.add(parseCommand(arr.getJSONObject(i)))
        }
        return commands
    }

    private fun parseCommand(obj: JSONObject): Command {
        return Command(
            id = obj.getString("id"),
            triggers = parseStringList(obj.getJSONArray("triggers")),
            name = obj.getString("name"),
            type = CommandType.fromString(obj.getString("type")),
            iconUrl = obj.optStringOrNull("iconUrl"),
            iconOverrides = parseIconOverrides(obj.optJSONArray("iconOverrides")),
            suggestionsApi = obj.optStringOrNull("suggestionsApi"),
            luckyUrl = obj.optStringOrNull("luckyUrl"),
            normalize = parseNormalize(obj.optJSONArray("normalize")),
            routes = parseRoutes(obj.getJSONArray("routes")),
        )
    }

    private fun parseIconOverrides(arr: JSONArray?): List<IconOverride> {
        if (arr == null) return emptyList()
        val out = mutableListOf<IconOverride>()
        for (i in 0 until arr.length()) {
            val obj = arr.getJSONObject(i)
            val devicesArr = obj.getJSONArray("devices")
            val devices = mutableListOf<DeviceType>()
            for (j in 0 until devicesArr.length()) {
                devices.add(DeviceType.fromString(devicesArr.getString(j)))
            }
            out.add(IconOverride(devices = devices, iconUrl = obj.getString("iconUrl")))
        }
        return out
    }

    private fun parseNormalize(arr: JSONArray?): List<NormalizeStep> {
        if (arr == null) return emptyList()
        val steps = mutableListOf<NormalizeStep>()
        for (i in 0 until arr.length()) {
            val raw = arr.getString(i)
            val step = NormalizeStep.fromString(raw)
                ?: throw IllegalArgumentException("Unknown normalize step: '$raw'")
            steps.add(step)
        }
        return steps
    }

    private fun parseRoutes(arr: JSONArray): List<Route> {
        val routes = mutableListOf<Route>()
        for (i in 0 until arr.length()) {
            routes.add(parseRoute(arr.getJSONObject(i)))
        }
        return routes
    }

    private fun parseRoute(obj: JSONObject): Route {
        val devicesRaw = obj.get("devices")
        val devices: RouteDevices = when (devicesRaw) {
            is String -> {
                if (devicesRaw == "*") RouteDevices.Wildcard
                else throw ConfigParseException("route.devices: unknown wildcard \"$devicesRaw\" (only \"*\" is allowed)")
            }
            is JSONArray -> {
                if (devicesRaw.length() == 0) {
                    throw ConfigParseException("route.devices: array must contain at least one device")
                }
                val list = mutableListOf<DeviceType>()
                for (i in 0 until devicesRaw.length()) {
                    list.add(DeviceType.fromString(devicesRaw.getString(i)))
                }
                RouteDevices.DeviceList(list)
            }
            else -> throw ConfigParseException("route.devices: must be \"*\" or an array — got ${devicesRaw::class.simpleName}")
        }

        return Route(
            devices = devices,
            defaultUrl = obj.getString("defaultUrl"),
            searchUrl = obj.optStringOrNull("searchUrl"),
            patterns = if (obj.has("patterns")) parsePatterns(obj.getJSONArray("patterns")) else emptyList(),
            browsers = if (obj.has("browsers")) parseStringList(obj.getJSONArray("browsers")) else emptyList(),
        )
    }

    private fun parsePatterns(arr: JSONArray): List<Pattern> {
        val patterns = mutableListOf<Pattern>()
        for (i in 0 until arr.length()) {
            val obj = arr.getJSONObject(i)
            patterns.add(
                Pattern(
                    match = obj.getString("match"),
                    url = obj.getString("url"),
                )
            )
        }
        return patterns
    }

    private fun parseStringList(arr: JSONArray): List<String> {
        val list = mutableListOf<String>()
        for (i in 0 until arr.length()) {
            list.add(arr.getString(i))
        }
        return list
    }
}
