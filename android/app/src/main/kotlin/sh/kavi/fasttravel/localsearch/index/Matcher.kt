package sh.kavi.fasttravel.localsearch.index

import sh.kavi.fasttravel.localsearch.query.Node
import sh.kavi.fasttravel.localsearch.query.QueryMode
import java.util.Locale

/**
 * Returns whether [result] satisfies the AST [node].
 * Mirrors companion/internal/index/match.go Matches exactly:
 *   - and  → all children must match
 *   - or   → at least one child must match
 *   - not  → negate the single child
 *   - term (wildcard=false) → case-insensitive substring of name|path
 *   - term (wildcard=true)  → anchored glob match (see [globMatch])
 *   - phrase → case-insensitive substring of the exact value
 *   - regex  → partial regex match (no forced anchoring); compile failure → false
 */
fun matches(result: FileResult, node: Node, @Suppress("UNUSED_PARAMETER") mode: QueryMode): Boolean =
    when (node.op) {
        "and"    -> node.nodes?.all { matches(result, it, mode) } ?: true
        "or"     -> node.nodes?.any { matches(result, it, mode) } ?: false
        "not"    -> if (node.node == null) true else !matches(result, node.node, mode)
        "term"   -> {
            val field = resolveField(result, node.field)
            if (node.wildcard == true) {
                globMatch(node.value ?: "", field)
            } else {
                field.lowercase(Locale.ROOT).contains((node.value ?: "").lowercase(Locale.ROOT))
            }
        }
        "phrase" -> {
            val field = resolveField(result, node.field)
            field.lowercase(Locale.ROOT).contains((node.value ?: "").lowercase(Locale.ROOT))
        }
        "regex"  -> {
            val field = resolveField(result, node.field)
            try {
                Regex(node.value ?: "").containsMatchIn(field)
            } catch (_: Exception) {
                false
            }
        }
        else -> false
    }

/**
 * Returns the [FileResult] field value for a given field name.
 * "path" maps to [FileResult.path]; all other values default to [FileResult.name].
 */
private fun resolveField(result: FileResult, field: String?): String =
    if (field == "path") result.path else result.name

/**
 * Performs an anchored case-insensitive glob match of [pattern] against [s].
 * Only `*` (match any sequence) and `?` (match any single character) are wildcards;
 * all other regex metacharacters in the pattern are escaped.
 * Mirrors companion/internal/index/match.go globMatch.
 */
private fun globMatch(pattern: String, s: String): Boolean {
    val sb = StringBuilder("(?i)^")
    for (ch in pattern) {
        when (ch) {
            '*'  -> sb.append(".*")
            '?'  -> sb.append(".")
            else -> sb.append(Regex.escape(ch.toString()))
        }
    }
    sb.append("$")
    return try {
        Regex(sb.toString()).containsMatchIn(s)
    } catch (_: Exception) {
        false
    }
}
