package sh.kavi.fasttravel.localsearch.index

import sh.kavi.fasttravel.localsearch.query.Node
import sh.kavi.fasttravel.localsearch.query.QueryMode
import java.util.Locale

/**
 * Returns whether [result] satisfies the AST [node].
 * [caseSensitive] controls whether term and phrase comparisons are case-sensitive.
 * Regex nodes are unaffected by [caseSensitive] — the pattern's own flags control case.
 * Mirrors companion/internal/index/match.go Matches exactly.
 */
fun matches(
    result: FileResult,
    node: Node,
    @Suppress("UNUSED_PARAMETER") mode: QueryMode,
    caseSensitive: Boolean = false,
): Boolean = when (node.op) {
    "and"    -> node.nodes?.all { matches(result, it, mode, caseSensitive) } ?: true
    "or"     -> node.nodes?.any { matches(result, it, mode, caseSensitive) } ?: false
    "not"    -> if (node.node == null) true else !matches(result, node.node, mode, caseSensitive)
    "term"   -> {
        val field = resolveField(result, node.field)
        if (node.wildcard == true) {
            globMatch(node.value ?: "", field, caseSensitive)
        } else if (caseSensitive) {
            field.contains(node.value ?: "")
        } else {
            field.lowercase(Locale.ROOT).contains((node.value ?: "").lowercase(Locale.ROOT))
        }
    }
    "phrase" -> {
        val field = resolveField(result, node.field)
        if (caseSensitive) {
            field.contains(node.value ?: "")
        } else {
            field.lowercase(Locale.ROOT).contains((node.value ?: "").lowercase(Locale.ROOT))
        }
    }
    "regex"  -> {
        // Regex is unaffected by caseSensitive; the pattern controls its own flags.
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
 * Performs an anchored glob match of [pattern] against [s].
 * Only `*` (match any sequence) and `?` (match any single character) are wildcards;
 * all other regex metacharacters in the pattern are escaped.
 * When [caseSensitive] is false (default) the match uses the `(?i)` prefix.
 * Mirrors companion/internal/index/match.go globMatch.
 */
private fun globMatch(pattern: String, s: String, caseSensitive: Boolean = false): Boolean {
    val sb = StringBuilder(if (caseSensitive) "^" else "(?i)^")
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
