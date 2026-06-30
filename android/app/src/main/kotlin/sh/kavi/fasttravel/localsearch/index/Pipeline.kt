package sh.kavi.fasttravel.localsearch.index

import sh.kavi.fasttravel.localsearch.query.Node
import sh.kavi.fasttravel.localsearch.query.QueryMode
import sh.kavi.fasttravel.localsearch.query.parse
import java.util.Locale

/**
 * Runs the full search pipeline against [candidates]:
 *  1. Parse the query (throws [QueryParseException] on empty input).
 *  2. Build the match AST:
 *     - TitleOnly=false → broaden each name-scoped leaf to OR(name, path)
 *     - TitleOnly=true  → coerce all leaves to name
 *  3. Post-filter with the matcher.
 *  4. Apply request filters (types, modifiedRange, createdRange, pathPrefix).
 *  5. Score each result.
 *  6. Stable-sort with a deterministic Name-then-Path tiebreak.
 *  7. Paginate and return (results is always a non-null list).
 *
 * Mirrors companion/internal/index/pipeline.go Search.
 * MediaStore wiring (slice 5b) supplies [candidates]; tests use an in-memory list.
 */
fun search(candidates: List<FileResult>, req: SearchRequest): SearchResult {
    var ast = parse(req.query, req.queryMode)

    // ExactPhrase: treat the whole query as one ordered phrase (non-regex only).
    // Regex mode ignores ExactPhrase; the pattern is already the entire query.
    // Mirrors companion/internal/index/pipeline.go Search ExactPhrase block.
    if (req.exactPhrase && req.queryMode != QueryMode.REGEX) {
        ast = Node(op = "phrase", field = "name", value = req.query.trim())
    }

    val matchAst = if (req.filters.titleOnly) coerceFieldsToName(ast) else broadenToPath(ast)

    // Post-filter: guarantee correctness via the matcher.
    var filtered = candidates.filter { matches(it, matchAst, req.queryMode, req.caseSensitive) }

    // Apply request filters.
    filtered = applyFilters(filtered, req.filters)

    // Score each surviving result.
    val terms = collectTerms(ast)
    filtered = filtered.map { it.copy(score = scoreResult(it, terms, req.history)) }

    // Stable sort.
    filtered = sortResults(filtered, req.sort)

    val total = filtered.size

    // Paginate.
    val page = maxOf(req.page, 0)
    val size = req.pageSize
    val pageSlice: List<FileResult> = if (size <= 0) {
        filtered
    } else {
        val lo = page * size
        if (lo >= total) emptyList()
        else filtered.subList(lo, minOf(lo + size, total))
    }

    return SearchResult(results = pageSlice, total = total, page = page)
}

// ── AST transforms ────────────────────────────────────────────────────────────

/**
 * Expands every leaf node with field="name" into OR(name-leaf, path-leaf).
 * Default (TitleOnly=false) behaviour: a plain term like "report" matches
 * both filenames and directory path components.
 * Leaves that already carry field="path" are unchanged.
 * Mirrors companion/internal/index/pipeline.go broadenToPath.
 */
internal fun broadenToPath(n: Node): Node = when (n.op) {
    "and", "or" -> n.copy(nodes = n.nodes?.map { broadenToPath(it) })
    "not"       -> n.copy(node = n.node?.let { broadenToPath(it) })
    "term", "phrase", "regex" -> {
        if (n.field != "name") n
        else Node(op = "or", nodes = listOf(n, n.copy(field = "path")))
    }
    else -> n
}

/**
 * Returns a copy of the AST with every leaf's field set to "name".
 * Used when TitleOnly=true so path-scoped queries also match only filenames.
 * Mirrors companion/internal/index/pipeline.go coerceFieldsToName.
 */
internal fun coerceFieldsToName(n: Node): Node = when (n.op) {
    "and", "or" -> n.copy(nodes = n.nodes?.map { coerceFieldsToName(it) })
    "not"       -> n.copy(node = n.node?.let { coerceFieldsToName(it) })
    "term", "phrase", "regex" -> n.copy(field = "name")
    else -> n
}

// ── Term collection ───────────────────────────────────────────────────────────

/**
 * Recursively collects the Value of every positive term/phrase leaf in [node].
 * NOT subtrees are skipped (negative terms must not inflate scores).
 * Regex nodes are excluded (they don't contribute to name-bucket scoring).
 * Mirrors companion/internal/index/pipeline.go collectTerms.
 */
internal fun collectTerms(node: Node): List<String> {
    val terms = mutableListOf<String>()
    fun walk(n: Node) {
        when (n.op) {
            "and", "or"      -> n.nodes?.forEach { walk(it) }
            // "not": intentionally skipped — negative terms must not influence scoring.
            "term", "phrase" -> n.value?.let { terms.add(it) }
            // "regex": intentionally excluded from scoring.
        }
    }
    walk(node)
    return terms
}

// ── Filters ───────────────────────────────────────────────────────────────────

/**
 * Applies each request filter independently.
 * CreatedRange: if any bound is set and r.createdAt==0 (birth-time unknown),
 * the result is excluded — we cannot prove it falls in range.
 * Mirrors companion/internal/index/pipeline.go applyFilters.
 */
internal fun applyFilters(results: List<FileResult>, f: Filters): List<FileResult> =
    results.filter { r ->
        // Types filter.
        if (f.types.isNotEmpty() && r.type !in f.types) return@filter false

        // ModifiedRange filter: a bound of 0 means unbounded on that side.
        val mr = f.modifiedRange
        if (mr != null) {
            if (mr.from != 0L && r.modifiedAt < mr.from) return@filter false
            if (mr.to != 0L && r.modifiedAt > mr.to) return@filter false
        }

        // CreatedRange filter: if any bound is set and createdAt is 0 (unknown), exclude.
        val cr = f.createdRange
        if (cr != null) {
            val hasBound = cr.from != 0L || cr.to != 0L
            if (hasBound && r.createdAt == 0L) return@filter false
            if (cr.from != 0L && r.createdAt < cr.from) return@filter false
            if (cr.to != 0L && r.createdAt > cr.to) return@filter false
        }

        // PathPrefix filter.
        if (f.pathPrefix.isNotEmpty() && !r.path.startsWith(f.pathPrefix)) return@filter false

        true
    }

// ── Scoring ───────────────────────────────────────────────────────────────────

/**
 * Scores a single result.
 *
 * Weights (mirrors companion/internal/index/pipeline.go scoreResult):
 *   nameBucket × 10:
 *     3 = name-prefix match     → 30
 *     2 = name-substring match  → 20
 *     1 = path-only match       → 10
 *     0 = no literal term match → 0
 *   historyBoost = 5 when result.id is in history.
 *   recency = modifiedAt / 2e13  (small tiebreaker in [0, 1) for reasonable timestamps).
 */
internal fun scoreResult(r: FileResult, terms: List<String>, history: List<String>): Double {
    val nameLower = r.name.lowercase(Locale.ROOT)
    val pathLower = r.path.lowercase(Locale.ROOT)

    var nameBucket = 0
    for (t in terms) {
        if (nameLower.startsWith(t.lowercase(Locale.ROOT))) { nameBucket = 3; break }
    }
    if (nameBucket == 0) {
        for (t in terms) {
            if (nameLower.contains(t.lowercase(Locale.ROOT))) { nameBucket = 2; break }
        }
    }
    if (nameBucket == 0) {
        for (t in terms) {
            if (pathLower.contains(t.lowercase(Locale.ROOT))) { nameBucket = 1; break }
        }
    }

    val historyBoost = if (r.id in history) 5.0 else 0.0
    val recency = if (r.modifiedAt != 0L) r.modifiedAt.toDouble() / 2e13 else 0.0

    return nameBucket * 10.0 + historyBoost + recency
}

// ── Sorting ───────────────────────────────────────────────────────────────────

/**
 * Stable-sorts results in place according to [s].
 * Missing field defaults to "relevance"; missing dir defaults to "desc".
 * Deterministic tiebreak on Name (asc) then Path (asc).
 * Mirrors companion/internal/index/pipeline.go sortResults (sort.SliceStable).
 */
internal fun sortResults(results: List<FileResult>, s: Sort): List<FileResult> {
    val field = s.field.ifEmpty { "relevance" }
    val asc = s.dir.ifEmpty { "desc" } == "asc"

    return results.sortedWith(Comparator { a, b ->
        val primaryCmp = when (field) {
            "created"  -> if (asc) a.createdAt.compareTo(b.createdAt) else b.createdAt.compareTo(a.createdAt)
            "modified" -> if (asc) a.modifiedAt.compareTo(b.modifiedAt) else b.modifiedAt.compareTo(a.modifiedAt)
            else       -> if (asc) a.score.compareTo(b.score) else b.score.compareTo(a.score) // relevance
        }
        if (primaryCmp != 0) return@Comparator primaryCmp
        // Deterministic tiebreak: Name asc, then Path asc.
        val nameCmp = a.name.compareTo(b.name)
        if (nameCmp != 0) return@Comparator nameCmp
        a.path.compareTo(b.path)
    })
}
