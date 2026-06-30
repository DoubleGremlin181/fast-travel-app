package sh.kavi.fasttravel.localsearch.query

/**
 * QueryMode controls how the query string is parsed.
 * Mirrors companion/internal/query/ast.go Mode constants.
 */
enum class QueryMode(val value: String) {
    SIMPLE("simple"),
    WILDCARD("wildcard"),
    REGEX("regex");

    companion object {
        fun fromString(value: String): QueryMode = when (value.lowercase()) {
            "simple"   -> SIMPLE
            "wildcard" -> WILDCARD
            "regex"    -> REGEX
            else       -> throw IllegalArgumentException("Unknown query mode: $value")
        }
    }
}

/**
 * Node is a single AST node. Its shape mirrors companion/internal/query/ast.go Node exactly:
 *
 *   op "and"/"or"   → nodes holds the children; node/field/value/wildcard are null.
 *   op "not"        → node holds the single child; nodes/field/value/wildcard are null.
 *   op "term"       → field, value, wildcard set; nodes/node are null.
 *   op "phrase"     → field, value set; wildcard is null; nodes/node are null.
 *   op "regex"      → field, value set; wildcard is null; nodes/node are null.
 */
data class Node(
    val op: String,
    val nodes: List<Node>? = null,   // and / or
    val node: Node? = null,          // not
    val field: String? = null,       // term / phrase / regex
    val value: String? = null,       // term / phrase / regex
    val wildcard: Boolean? = null,   // term only (null = absent for phrase/regex)
)

/** Thrown by [parse] when the query is empty or blank. */
class QueryParseException(message: String) : RuntimeException(message)

/**
 * Parse turns a raw query string and a [QueryMode] into the canonical AST [Node].
 * Throws [QueryParseException] for empty or whitespace-only input.
 * Mirrors companion/internal/query/parse.go Parse.
 */
fun parse(query: String, mode: QueryMode): Node {
    if (query.isBlank()) throw QueryParseException("query: empty input")

    if (mode == QueryMode.REGEX) return parseRegex(query)

    val tokens = tokenize(query, mode)
    return buildAst(tokens)
}

// ── regex mode ────────────────────────────────────────────────────────────────

private fun parseRegex(query: String): Node {
    var field = "name"
    var value = query
    if (query.startsWith("path:")) {
        field = "path"
        value = query.removePrefix("path:")
    }
    return Node(op = "regex", field = field, value = value)
}

// ── tokenizer ─────────────────────────────────────────────────────────────────

/** Internal token produced by [tokenize]. */
private data class Tok(
    val isOR: Boolean = false,
    val negate: Boolean = false,
    val leaf: Node? = null,       // null when isOR == true
)

private fun tokenize(query: String, mode: QueryMode): List<Tok> {
    val toks = mutableListOf<Tok>()
    var i = 0
    val n = query.length

    while (i < n) {
        // skip whitespace
        if (query[i] == ' ' || query[i] == '\t') { i++; continue }

        // bare pipe → OR separator
        if (query[i] == '|') { toks.add(Tok(isOR = true)); i++; continue }

        // negation prefix: only when followed by a non-whitespace character
        var negate = false
        if (i < n && (query[i] == '-' || query[i] == '!')) {
            if (i + 1 < n && query[i + 1] != ' ' && query[i + 1] != '\t') {
                negate = true
                i++
            }
        }

        // path: prefix
        var field = "name"
        if (i < n && query.startsWith("path:", i)) {
            field = "path"
            i += "path:".length
        }

        if (i >= n) continue

        // quoted phrase
        if (query[i] == '"') {
            i++ // skip opening quote
            val start = i
            while (i < n && query[i] != '"') i++
            val value = query.substring(start, i)
            if (i < n) i++ // skip closing quote
            toks.add(Tok(negate = negate, leaf = Node(op = "phrase", field = field, value = value)))
            continue
        }

        // regular term: read until whitespace or pipe
        val start = i
        while (i < n && query[i] != ' ' && query[i] != '\t' && query[i] != '|') i++
        val value = query.substring(start, i)
        if (value.isEmpty()) continue

        // standalone OR keyword (only when no negate and no field scope)
        if (!negate && field == "name" && value.equals("or", ignoreCase = true)) {
            toks.add(Tok(isOR = true))
            continue
        }

        val wildcard = mode == QueryMode.WILDCARD && (value.contains('*') || value.contains('?'))
        toks.add(Tok(negate = negate, leaf = Node(op = "term", field = field, value = value, wildcard = wildcard)))
    }

    return toks
}

// ── AST builder ───────────────────────────────────────────────────────────────

/**
 * buildAst turns a flat token list into the canonical AST Node.
 * Top-level precedence: OR binds looser than AND.
 */
private fun buildAst(toks: List<Tok>): Node {
    val segments = splitByOR(toks)
    val segNodes = segments.filter { it.isNotEmpty() }.map { buildSegment(it) }

    return when (segNodes.size) {
        0    -> Node(op = "") // shouldn't reach here after empty-input guard
        1    -> segNodes[0]
        else -> Node(op = "or", nodes = segNodes)
    }
}

private fun splitByOR(toks: List<Tok>): List<List<Tok>> {
    val segments = mutableListOf<List<Tok>>()
    val current = mutableListOf<Tok>()
    for (t in toks) {
        if (t.isOR) { segments.add(current.toList()); current.clear() }
        else current.add(t)
    }
    segments.add(current.toList())
    return segments
}

private fun buildSegment(toks: List<Tok>): Node {
    val nodes = toks.map { t ->
        val leaf = t.leaf!!
        if (t.negate) Node(op = "not", node = leaf) else leaf
    }
    return if (nodes.size == 1) nodes[0] else Node(op = "and", nodes = nodes)
}
