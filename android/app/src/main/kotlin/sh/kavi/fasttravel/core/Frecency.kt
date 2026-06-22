package sh.kavi.fasttravel.core

import kotlin.math.pow

/**
 * Frecency ranking for the empty-input "top commands" suggestions, shared in
 * behaviour with the extension (extension/src/core/frecency.ts) via
 * shared/test-fixtures/frecency.fixtures.json.
 *
 * Each past use of a command contributes an exponentially-decaying weight
 * (1-week half-life), so a command's score rewards both how often and how
 * recently it was used. Never-used commands score 0 and keep config order,
 * which also gives a sensible cold-start (no history -> config order).
 */
object Frecency {

    private const val HALF_LIFE_DAYS = 7.0
    private const val DAY_MS = 86_400_000.0

    data class HistoryEntry(val commandId: String?, val timestamp: Long)

    /**
     * Rank [commandIds] (already in config order) by frecency, most relevant
     * first. Ties — including the all-zero cold-start case — fall back to
     * config order.
     */
    fun rank(commandIds: List<String>, history: List<HistoryEntry>, now: Long): List<String> {
        val score = HashMap<String, Double>()
        for (id in commandIds) score[id] = 0.0

        for (entry in history) {
            val id = entry.commandId ?: continue
            if (!score.containsKey(id)) continue
            val ageDays = maxOf(0.0, (now - entry.timestamp) / DAY_MS)
            score[id] = score.getValue(id) + 0.5.pow(ageDays / HALF_LIFE_DAYS)
        }

        return commandIds.withIndex()
            .sortedWith(
                compareByDescending<IndexedValue<String>> { score.getValue(it.value) }
                    .thenBy { it.index },
            )
            .map { it.value }
    }
}
