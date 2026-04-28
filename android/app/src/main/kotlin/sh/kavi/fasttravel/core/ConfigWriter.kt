package sh.kavi.fasttravel.core

import org.json.JSONArray
import org.json.JSONObject

/**
 * Inverse of [ConfigParser]. Produces JSON matching shared/config/config.schema.json.
 */
object ConfigWriter {

    fun writeConfig(cfg: FastTravelConfig): String {
        val obj = JSONObject()
        obj.put("\$schema", "https://raw.githubusercontent.com/DoubleGremlin181/fast-travel-app/main/shared/config/config.schema.json")
        obj.put("version", cfg.version)
        obj.put("defaultCommand", cfg.defaultCommand)
        if (!cfg.defaultSuggestionsApi.isNullOrBlank()) {
            obj.put("defaultSuggestionsApi", cfg.defaultSuggestionsApi)
        }
        obj.put("groups", writeGroups(cfg.groups))
        obj.put("ignoreList", writeStringList(cfg.ignoreList))
        return obj.toString(2)
    }

    private fun writeGroups(groups: List<Group>): JSONArray {
        val arr = JSONArray()
        for (g in groups) arr.put(writeGroup(g))
        return arr
    }

    private fun writeGroup(g: Group): JSONObject {
        val obj = JSONObject()
        obj.put("id", g.id)
        obj.put("name", g.name)
        if (!g.color.isNullOrBlank()) obj.put("color", g.color)
        if (g.commands.isNotEmpty()) {
            obj.put("commands", writeCommands(g.commands))
        }
        return obj
    }

    private fun writeCommands(commands: List<Command>): JSONArray {
        val arr = JSONArray()
        for (c in commands) arr.put(writeCommand(c))
        return arr
    }

    private fun writeCommand(c: Command): JSONObject {
        val obj = JSONObject()
        obj.put("id", c.id)
        obj.put("triggers", writeStringList(c.triggers))
        obj.put("name", c.name)
        obj.put("type", c.type.toSerializedString())
        if (!c.iconUrl.isNullOrBlank()) obj.put("iconUrl", c.iconUrl)
        if (c.iconOverrides.isNotEmpty()) {
            val arr = JSONArray()
            for (ov in c.iconOverrides) {
                val ovObj = JSONObject()
                val devicesArr = JSONArray()
                for (d in ov.devices) devicesArr.put(d.name)
                ovObj.put("devices", devicesArr)
                ovObj.put("iconUrl", ov.iconUrl)
                arr.put(ovObj)
            }
            obj.put("iconOverrides", arr)
        }
        if (!c.suggestionsApi.isNullOrBlank()) obj.put("suggestionsApi", c.suggestionsApi)
        if (c.normalize.isNotEmpty()) {
            val nArr = JSONArray()
            for (step in c.normalize) nArr.put(step.value)
            obj.put("normalize", nArr)
        }
        obj.put("routes", writeRoutes(c.routes))
        return obj
    }

    private fun writeRoutes(routes: List<Route>): JSONArray {
        val arr = JSONArray()
        for (r in routes) arr.put(writeRoute(r))
        return arr
    }

    private fun writeRoute(r: Route): JSONObject {
        val obj = JSONObject()
        val devicesVal: Any = when (val d = r.devices) {
            is RouteDevices.Wildcard -> "*"
            is RouteDevices.DeviceList -> JSONArray().also { a ->
                d.devices.forEach { a.put(it.name) }
            }
        }
        obj.put("devices", devicesVal)
        obj.put("defaultUrl", r.defaultUrl)
        if (!r.searchUrl.isNullOrBlank()) obj.put("searchUrl", r.searchUrl)
        if (r.patterns.isNotEmpty()) {
            val pArr = JSONArray()
            for (p in r.patterns) {
                pArr.put(
                    JSONObject().apply {
                        put("match", p.match)
                        put("url", p.url)
                    },
                )
            }
            obj.put("patterns", pArr)
        }
        if (r.browsers.isNotEmpty()) {
            obj.put("browsers", writeStringList(r.browsers))
        }
        return obj
    }

    private fun writeStringList(list: List<String>): JSONArray {
        val arr = JSONArray()
        for (s in list) arr.put(s)
        return arr
    }
}
