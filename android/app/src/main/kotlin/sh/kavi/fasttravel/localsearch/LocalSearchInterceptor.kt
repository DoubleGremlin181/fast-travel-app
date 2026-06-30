package sh.kavi.fasttravel.localsearch

import sh.kavi.fasttravel.localsearch.index.FileType
import sh.kavi.fasttravel.localsearch.index.Filters
import sh.kavi.fasttravel.localsearch.index.SearchRequest
import sh.kavi.fasttravel.localsearch.index.Sort
import sh.kavi.fasttravel.localsearch.query.QueryMode
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.Calendar

/** Result of [shouldInterceptLocalSearch]. */
data class InterceptResult(val intercept: Boolean, val query: String)

// Matches "s" (bare) or "s <query>" — anchored so "search", "sm", "so" etc. don't fire.
private val S_PATTERN = Regex("""^s(\s+(.*))?$""")

/**
 * Returns true (with the extracted query) when the `s` command intercept should fire.
 *
 * Intercepts only when ALL of:
 *   (a) [enabled] is true (local search feature is on), AND
 *   (b) [configHasS] is false (the active config does not claim the `s` trigger), AND
 *   (c) [input] (trimmed) matches `^s(\s+(.*))?$`.
 *
 * Pure — no android.* imports; JVM-testable.
 */
fun shouldInterceptLocalSearch(
    input: String,
    enabled: Boolean,
    configHasS: Boolean,
): InterceptResult {
    if (!enabled || configHasS) return InterceptResult(intercept = false, query = "")
    val trimmed = input.trim()
    val match = S_PATTERN.matchEntire(trimmed) ?: return InterceptResult(intercept = false, query = "")
    val query = match.groupValues[2].trim()
    return InterceptResult(intercept = true, query = query)
}

/**
 * Builds a [SearchRequest] from user preference strings + the extracted query.
 *
 * Defaults: page=0, pageSize=[pageSize] (50), empty filters.
 * Unknown [queryMode] strings fall back to SIMPLE rather than throwing.
 *
 * Pure — no android.* imports; JVM-testable.
 */
fun buildLocalSearchRequest(
    query: String,
    queryMode: String,
    sortField: String,
    sortDir: String,
    history: List<String>,
    pageSize: Int = 50,
): SearchRequest = SearchRequest(
    query = query,
    queryMode = runCatching { QueryMode.fromString(queryMode) }.getOrDefault(QueryMode.SIMPLE),
    sort = Sort(field = sortField, dir = sortDir),
    filters = Filters(),
    page = 0,
    pageSize = pageSize,
    history = history,
)

/**
 * Broad file-type category for icon selection.
 * One entry per [FileType], named identically for easy mapping.
 */
enum class LocalFileIcon {
    FOLDER, IMAGE, VIDEO, AUDIO, ARCHIVE, CODE, DOCUMENT, OTHER
}

/**
 * Maps a [FileType] to a [LocalFileIcon] category used by the Compose layer to select
 * the correct Material icon and tint.
 *
 * Pure — no android.* or Compose imports; JVM-testable.
 */
fun fileTypeIcon(type: FileType): LocalFileIcon = when (type) {
    FileType.FOLDER   -> LocalFileIcon.FOLDER
    FileType.IMAGE    -> LocalFileIcon.IMAGE
    FileType.VIDEO    -> LocalFileIcon.VIDEO
    FileType.AUDIO    -> LocalFileIcon.AUDIO
    FileType.ARCHIVE  -> LocalFileIcon.ARCHIVE
    FileType.CODE     -> LocalFileIcon.CODE
    FileType.DOCUMENT -> LocalFileIcon.DOCUMENT
    FileType.OTHER    -> LocalFileIcon.OTHER
}

/** Compact human-readable file size (e.g. "1.2 MB"). Pure — JVM-testable. */
fun formatFileSize(bytes: Long): String = when {
    bytes <= 0 -> ""
    bytes < 1_024L -> "$bytes B"
    bytes < 1_048_576L -> "%.1f KB".format(bytes / 1_024.0)
    bytes < 1_073_741_824L -> "%.1f MB".format(bytes / 1_048_576.0)
    else -> "%.1f GB".format(bytes / 1_073_741_824.0)
}

/**
 * Compact date representation: "Jun 28" for current-year files, "2023" for older ones.
 * Returns empty string for epoch 0 (unknown date).
 * Pure — JVM-testable.
 */
fun formatModifiedDate(epochMs: Long): String {
    if (epochMs == 0L) return ""
    val fileYear = Calendar.getInstance().also { it.timeInMillis = epochMs }
        .get(Calendar.YEAR)
    val thisYear = Calendar.getInstance().get(Calendar.YEAR)
    return if (fileYear == thisYear) {
        SimpleDateFormat("MMM d", Locale.getDefault()).format(Date(epochMs))
    } else {
        fileYear.toString()
    }
}
