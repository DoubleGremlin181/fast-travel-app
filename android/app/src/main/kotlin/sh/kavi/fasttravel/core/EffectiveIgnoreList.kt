package sh.kavi.fasttravel.core

import sh.kavi.fasttravel.data.AutoIgnoreStore

/**
 * Compute the effective ignore list: the union of [permanent] entries (always
 * ignored) and "active" auto-ignore [candidates] — those whose dismissal count
 * has reached [threshold] and that the user has not pinned via
 * [AutoIgnoreStore.Candidate.doNotIgnore].
 *
 * All output triggers are lowercased and deduplicated while preserving insertion
 * order: permanent entries come first, followed by any candidates not already
 * listed permanently.
 */
fun effectiveIgnoreList(
    permanent: List<String>,
    candidates: Map<String, AutoIgnoreStore.Candidate>,
    threshold: Int,
): List<String> {
    val out = LinkedHashSet<String>()
    for (p in permanent) out.add(p.lowercase())
    for ((trigger, cand) in candidates) {
        if (!cand.doNotIgnore && cand.count >= threshold) {
            out.add(trigger.lowercase())
        }
    }
    return out.toList()
}
