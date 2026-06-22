package sh.kavi.fasttravel.core

/**
 * Builds the ordered list of ids that fill the empty-input shortcut grid, mixing
 * real command ids with installed-app ids ([installedAppId]).
 *
 * An app only becomes a chip candidate once it has been launched — i.e. it appears in
 * [history] — and only when [includeApps] is on. Final ordering is delegated to
 * [Frecency], so a recently/often used app naturally outranks never-used commands while
 * a cold start (no history) preserves command config order.
 *
 * Kept free of Android types so the candidate-set + gating logic is unit-testable.
 */
object ChipRanking {
    fun rankedIds(
        commandIds: List<String>,
        history: List<Frecency.HistoryEntry>,
        now: Long,
        includeApps: Boolean,
        limit: Int,
    ): List<String> {
        val appIds = if (includeApps) {
            history.asSequence()
                .mapNotNull { it.commandId }
                .filter { isInstalledAppId(it) }
                .distinct()
                .toList()
        } else {
            emptyList()
        }
        val candidates = commandIds + appIds
        return Frecency.rank(candidates, history, now).take(limit.coerceAtLeast(0))
    }
}
