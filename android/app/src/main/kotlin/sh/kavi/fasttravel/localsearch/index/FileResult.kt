package sh.kavi.fasttravel.localsearch.index

import sh.kavi.fasttravel.localsearch.query.QueryMode

/**
 * FileType is a broad file-type category.
 * Mirrors companion/internal/protocol/types.go FileType constants.
 */
enum class FileType(val value: String) {
    DOCUMENT("document"),
    IMAGE("image"),
    VIDEO("video"),
    AUDIO("audio"),
    ARCHIVE("archive"),
    CODE("code"),
    FOLDER("folder"),
    OTHER("other");

    companion object {
        fun fromString(value: String): FileType =
            entries.firstOrNull { it.value == value } ?: OTHER
    }
}

/**
 * DateRange is an inclusive range in epoch milliseconds.
 * A bound of 0 means unbounded on that side (matches Go's zero-value semantics).
 */
data class DateRange(
    val from: Long = 0L,
    val to: Long = 0L,
)

/**
 * Filters are optional filters applied before pagination.
 * Mirrors companion/internal/protocol/types.go Filters.
 */
data class Filters(
    val types: List<FileType> = emptyList(),
    val createdRange: DateRange? = null,
    val modifiedRange: DateRange? = null,
    val pathPrefix: String = "",
    val titleOnly: Boolean = false,
)

/**
 * Sort describes the sort order for search results.
 * Mirrors companion/internal/protocol/types.go Sort.
 */
data class Sort(
    val field: String = "",  // "" defaults to "relevance" in sortResults
    val dir: String = "",    // "" defaults to "desc" in sortResults
)

/**
 * SearchRequest is the parameter object for [search].
 * Mirrors the fields of companion/internal/protocol/types.go SearchRequest that the
 * engine-agnostic pipeline uses (MediaStore wiring and Indexer abstraction are 5b).
 */
data class SearchRequest(
    val query: String,
    val queryMode: QueryMode = QueryMode.SIMPLE,
    val sort: Sort = Sort(),
    val filters: Filters = Filters(),
    val page: Int = 0,
    val pageSize: Int = 100,
    val history: List<String> = emptyList(),
    /** When true, term/phrase comparisons are case-sensitive; regex is unaffected.
     *  Mirrors companion/internal/protocol/types.go SearchRequest.CaseSensitive. */
    val caseSensitive: Boolean = false,
    /** When true and queryMode != REGEX, treat the whole query as one ordered phrase.
     *  Mirrors companion/internal/protocol/types.go SearchRequest.ExactPhrase. */
    val exactPhrase: Boolean = false,
)

/**
 * FileResult is a single file match.
 * Mirrors companion/internal/protocol/types.go FileResult.
 */
data class FileResult(
    val id: String,
    val name: String,
    val path: String,
    val dir: String = "",
    val ext: String = "",
    val mime: String = "",
    val type: FileType = FileType.OTHER,
    val size: Long = 0L,
    val createdAt: Long = 0L,
    val modifiedAt: Long = 0L,
    val score: Double = 0.0,
    val iconHint: String = "",
)

/**
 * SearchResult is the return type of [search].
 */
data class SearchResult(
    val results: List<FileResult>,
    val total: Int,
    val page: Int,
    /** True when the MediaStore candidate query was capped at CANDIDATE_LIMIT, meaning
     *  actual matches may exceed [total] (lower-bound count).
     *  Mirrors companion/internal/protocol/types.go SearchResponse.Degraded. */
    val degraded: Boolean = false,
)
