package sh.kavi.fasttravel.data

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

data class HistoryEntry(
    val query: String,
    val commandId: String?,
    val timestamp: Long,
)

class SearchHistory(private val prefs: SharedPreferences) {

    constructor(context: Context) : this(
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    )

    companion object {
        private const val PREFS_NAME = "fast_travel_history"
        private const val KEY_HISTORY = "search_history"
        private const val MAX_ENTRIES = 50
    }

    fun addEntry(query: String, commandId: String?) {
        val trimmed = query.trim()
        if (trimmed.isEmpty()) return
        val history = getHistoryMutable()

        // Remove any existing entry with the same query before prepending
        history.removeAll { it.query == trimmed }

        // Add new entry at the beginning
        history.add(0, HistoryEntry(trimmed, commandId, System.currentTimeMillis()))

        // Trim to max size
        while (history.size > MAX_ENTRIES) {
            history.removeAt(history.size - 1)
        }

        saveHistory(history)
    }

    fun getHistory(): List<HistoryEntry> = getHistoryMutable()

    fun clearHistory() {
        prefs.edit().remove(KEY_HISTORY).apply()
    }

    fun remove(query: String) {
        val history = getHistoryMutable()
        if (history.removeAll { it.query == query }) {
            saveHistory(history)
        }
    }

    private fun getHistoryMutable(): MutableList<HistoryEntry> {
        val json = prefs.getString(KEY_HISTORY, null) ?: return mutableListOf()
        return try {
            val arr = JSONArray(json)
            val list = mutableListOf<HistoryEntry>()
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                list.add(
                    HistoryEntry(
                        query = obj.getString("query"),
                        commandId = if (obj.has("commandId") && !obj.isNull("commandId"))
                            obj.getString("commandId") else null,
                        timestamp = obj.getLong("timestamp"),
                    )
                )
            }
            list
        } catch (_: Exception) {
            mutableListOf()
        }
    }

    private fun saveHistory(history: List<HistoryEntry>) {
        val arr = JSONArray()
        for (entry in history) {
            val obj = JSONObject()
            obj.put("query", entry.query)
            obj.put("commandId", entry.commandId ?: JSONObject.NULL)
            obj.put("timestamp", entry.timestamp)
            arr.put(obj)
        }
        prefs.edit().putString(KEY_HISTORY, arr.toString()).apply()
    }
}
