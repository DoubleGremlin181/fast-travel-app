package sh.kavi.fasttravel.localsearch.index

import sh.kavi.fasttravel.localsearch.query.Node

/**
 * Compile helpers that drive recall-safe MediaStore candidate narrowing.
 * Mirrors companion/internal/index/compile.go ORBranches / PositiveSeed / RegexSeeds.
 *
 * All functions are pure (no android.* imports) so they can be JVM-unit-tested directly.
 */

/**
 * Returns the immediate child nodes when [node] is an "or" node, or a single-element
 * list containing [node] for any other op.
 *
 * Flat-OR invariant: the query grammar emits only a single flat top-level "or" —
 * branches never contain a nested "or" node. [positiveSeed] relies on this.
 *
 * Mirrors companion/internal/index/compile.go ORBranches.
 */
fun orBranches(node: Node): List<Node> =
    if (node.op == "or") node.nodes ?: emptyList() else listOf(node)

/**
 * Returns the longest contiguous literal fragment from positive (not under a "not")
 * term and phrase nodes in [branch]. Wildcard characters ('*' and '?') split a term
 * value into fragments; the longest fragment wins.
 * Regex nodes are always skipped — their values are not safe as literal seeds.
 *
 * Recall safety: using any literal substring as the native query seed means the
 * index returns a superset of true matches. The pipeline matcher enforces the full
 * query semantics over that superset.
 *
 * Returns ("", false) if no fragment of length ≥ 1 exists.
 * Mirrors companion/internal/index/compile.go PositiveSeed.
 */
fun positiveSeed(branch: Node): Pair<String, Boolean> {
    var best = ""

    fun walk(n: Node, negated: Boolean) {
        when (n.op) {
            "and", "or" -> n.nodes?.forEach { walk(it, negated) }
            "not"       -> n.node?.let { walk(it, true) }
            "term", "phrase" -> {
                if (negated) return
                for (frag in wildcardFragments(n.value ?: "")) {
                    if (frag.length > best.length) best = frag
                }
                // "regex": intentionally skipped — not safe as literal seed.
            }
        }
    }

    walk(branch, false)
    return if (best.isEmpty()) Pair("", false) else Pair(best, true)
}

/**
 * Splits [s] on '*' and '?' and returns the non-empty pieces.
 * A value with no wildcards returns a single-element list [s].
 */
internal fun wildcardFragments(s: String): List<String> =
    s.split('*', '?').filter { it.isNotEmpty() }

/**
 * Derives MediaStore LIKE substring seeds from an RE2 [pattern] that are recall-safe.
 * Every string the pattern matches contains at least one of the returned seeds.
 *
 * Splits the pattern on top-level alternation and extracts the longest required
 * literal run from each alternative. If any alternative has no usable literal
 * (length ≥ 2), returns broad=true, signalling the caller to fall back to a
 * broad (unfiltered-by-name) MediaStore query.
 *
 * Seeds are deduplicated before return.
 *
 * Mirrors companion/internal/index/compile.go RegexSeeds.
 */
fun regexSeeds(pattern: String): Pair<List<String>, Boolean> {
    val alternatives = splitTopLevelAlternation(pattern)
    val seen = mutableSetOf<String>()
    val result = mutableListOf<String>()
    for (alt in alternatives) {
        val seed = longestRequiredLiteralRun(alt)
        if (seed.length < 2) return Pair(emptyList(), true)
        if (seen.add(seed)) result.add(seed)
    }
    return Pair(result, false)
}

/**
 * Splits [pattern] on top-level '|' characters — those not escaped (\|), not inside
 * a char class ([...]), and not inside a group (...). Returns at least one element.
 * Mirrors companion/internal/index/compile.go splitTopLevelAlternation.
 */
internal fun splitTopLevelAlternation(pattern: String): List<String> {
    val alternatives = mutableListOf<String>()
    var depth = 0
    var inClass = false
    var start = 0
    var i = 0
    while (i < pattern.length) {
        val ch = pattern[i]
        when {
            ch == '\\' && i + 1 < pattern.length -> i += 2   // skip escaped char
            inClass -> {
                if (ch == ']') inClass = false
                i++
            }
            ch == '[' -> { inClass = true; i++ }
            ch == '(' -> { depth++; i++ }
            ch == ')' -> { if (depth > 0) depth--; i++ }
            ch == '|' && depth == 0 -> {
                alternatives.add(pattern.substring(start, i))
                start = i + 1
                i++
            }
            else -> i++
        }
    }
    alternatives.add(pattern.substring(start))
    return alternatives
}

/**
 * Finds the longest contiguous run of characters that MUST appear in every string
 * matched by the RE2 alternative [alt].
 *
 * Rules (left-to-right scan):
 *   - Ordinary literal chars and escaped non-letter metacharacters (\.  \*  \\  etc.)
 *     extend the current run.
 *   - Quantifiers after a run char: '*' or '?' → drop the last char (may be zero),
 *     break the run; '+' → keep the char (at least one), break the run;
 *     '{' (any interval) → drop the last char (conservative), skip to '}', break.
 *   - Run-breakers: '.', '[…]', '(', ')', '^', '$', any '\<letter>' escape (\d \w…).
 *   - Only depth-0 literals are collected (chars inside groups are never required).
 *
 * Mirrors companion/internal/index/compile.go longestRequiredLiteralRun.
 */
internal fun longestRequiredLiteralRun(alt: String): String {
    var best = ""
    val cur = StringBuilder()

    fun endRun() {
        if (cur.length > best.length) best = cur.toString()
        cur.clear()
    }
    fun dropLastAndEndRun() {
        if (cur.isNotEmpty()) cur.deleteCharAt(cur.length - 1)
        endRun()
    }
    fun consumeQuantifier(start: Int): Int {
        var j = start
        if (j >= alt.length) return j
        when (alt[j]) {
            '*', '?', '+' -> return j + 1
            '{' -> {
                j++
                while (j < alt.length && alt[j] != '}') j++
                if (j < alt.length) j++ // skip '}'
            }
        }
        return j
    }

    var depth = 0
    var i = 0
    while (i < alt.length) {
        val ch = alt[i]

        if (ch == '\\' && i + 1 < alt.length) {
            val next = alt[i + 1]
            i += 2
            if ((next in 'a'..'z') || (next in 'A'..'Z')) {
                // \d \w \s \D \W \S \b \B etc. → class shorthand / zero-width → break run.
                endRun()
                i = consumeQuantifier(i)
            } else if (depth == 0) {
                // \. \* \( \) \\ \{ \} \+ \? \^ \$ etc. → literal symbol.
                cur.append(next)
                if (i < alt.length) {
                    when (alt[i]) {
                        '*', '?' -> { dropLastAndEndRun(); i++ }
                        '+'      -> { endRun(); i++ }
                        '{'      -> { dropLastAndEndRun(); i = consumeQuantifier(i) }
                    }
                }
            }
            continue
        }

        when (ch) {
            '.' -> { endRun(); i++; i = consumeQuantifier(i) }

            '[' -> {
                endRun()
                i++ // skip '['
                if (i < alt.length && alt[i] == '^') i++      // negation
                if (i < alt.length && alt[i] == ']') i++      // leading ']' is literal
                while (i < alt.length && alt[i] != ']') {
                    if (alt[i] == '\\') i++                    // skip escaped char inside class
                    i++
                }
                if (i < alt.length) i++                        // skip closing ']'
                i = consumeQuantifier(i)
            }

            '(' -> { depth++; endRun(); i++ }
            ')' -> { if (depth > 0) depth--; endRun(); i++ }

            '^', '$' -> { endRun(); i++ }

            // Stray quantifiers (no preceding literal in current run).
            '*', '?', '+' -> { endRun(); i++ }
            '{' -> { endRun(); i = consumeQuantifier(i) }

            else -> {
                // Regular literal — only at depth 0 (chars inside groups are never required).
                i++
                if (depth == 0) {
                    cur.append(ch)
                    if (i < alt.length) {
                        when (alt[i]) {
                            '*', '?' -> { dropLastAndEndRun(); i++ }
                            '+'      -> { endRun(); i++ }
                            '{'      -> { dropLastAndEndRun(); i = consumeQuantifier(i) }
                        }
                    }
                }
            }
        }
    }
    endRun()
    return best
}
