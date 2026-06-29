package sh.kavi.fasttravel.core

import sh.kavi.fasttravel.data.AutoIgnoreStore

/**
 * Compute the effective ignore list merged from three sources:
 *  - [permanent]: the config's baseline ignoreList (shared, ships in the config).
 *  - [local]: the user's device-local ignore additions. Kept OUT of the config
 *    on purpose so editing it never marks the config dirty / pauses remote
 *    auto-refresh — it's merged here at parse time instead.
 *  - [candidates]: "active" auto-ignore entries — those whose dismissal count has
 *    reached [threshold] and that the user has not pinned via
 *    [AutoIgnoreStore.Candidate.doNotIgnore].
 *
 * All output triggers are lowercased and deduplicated while preserving insertion
 * order: baseline first, then local additions, then active candidates.
 */
fun effectiveIgnoreList(
    permanent: List<String>,
    local: Set<String>,
    candidates: Map<String, AutoIgnoreStore.Candidate>,
    threshold: Int,
): List<String> {
    val out = LinkedHashSet<String>()
    for (p in permanent) out.add(p.lowercase())
    for (l in local) out.add(l.lowercase())
    for ((trigger, cand) in candidates) {
        if (!cand.doNotIgnore && cand.count >= threshold) {
            out.add(trigger.lowercase())
        }
    }
    return out.toList()
}
