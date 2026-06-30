package sh.kavi.fasttravel.localsearch.index

import android.content.ContentResolver
import android.os.Build
import android.provider.MediaStore
import sh.kavi.fasttravel.localsearch.query.Node
import sh.kavi.fasttravel.localsearch.query.QueryMode
import sh.kavi.fasttravel.localsearch.query.parse

// ── Column name literals ───────────────────────────────────────────────────────
//
// These are the actual string values of the MediaStore.MediaColumns constants.
// Declared here as literals so that [buildSelection] has no android.* dependency at
// runtime and can be exercised from plain JVM unit tests without Robolectric.
// The values match the compile-time constants:
//   DISPLAY_NAME  = MediaStore.MediaColumns.DISPLAY_NAME  = "_display_name"
//   DATA          = MediaStore.MediaColumns.DATA           = "_data"

private const val COL_DISPLAY_NAME = "_display_name"   // MediaStore.MediaColumns.DISPLAY_NAME
private const val COL_DATA         = "_data"            // MediaStore.MediaColumns.DATA

private const val CANDIDATE_LIMIT = 1000

// ── Selection ─────────────────────────────────────────────────────────────────

/**
 * A parameterized SQLite WHERE clause ready for [ContentResolver.query].
 * [selection] and [selectionArgs] are null when no name filter is applicable
 * (broad fallback: returns up to [CANDIDATE_LIMIT] rows ordered by recency).
 */
data class Selection(
    val selection: String?,
    val selectionArgs: Array<String>?,
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is Selection) return false
        return selection == other.selection &&
                selectionArgs.contentEquals(other.selectionArgs)
    }

    override fun hashCode(): Int =
        31 * (selection?.hashCode() ?: 0) + (selectionArgs?.contentHashCode() ?: 0)
}

private fun Array<String>?.contentEquals(other: Array<String>?): Boolean {
    if (this == null && other == null) return true
    if (this == null || other == null) return false
    return this.contentEquals(other)
}

// ── buildSelection ────────────────────────────────────────────────────────────

/**
 * Builds a recall-safe MediaStore WHERE clause (selection + args) from the query AST.
 *
 * Pure — no android.* runtime dependency; testable on the JVM.
 *
 * Recall-safety contract: the generated WHERE clause may over-return rows (the 5a
 * pipeline's [matches] function filters precisely) but must never under-return for
 * the guaranteed subset.
 *
 * Seeds containing '%' or '_' are NOT escaped for LIKE, which broadens (rather
 * than narrows) recall. This is intentionally recall-safe; the pipeline enforces
 * exact query semantics over the candidate set.
 *
 * Regex mode:
 *   Uses [regexSeeds] to extract required literal fragments. If any alternative
 *   has no usable seed (broad=true), no name filter is applied. Otherwise,
 *   generates: `DISPLAY_NAME LIKE ? [OR DISPLAY_NAME LIKE ?]…`
 *
 * Simple / Wildcard mode:
 *   Iterates [orBranches]; for each branch, [positiveSeed] extracts the longest
 *   literal fragment. Branches with no seed are skipped (not AND'd away — recall-safe).
 *   Each seeded branch contributes: `(DISPLAY_NAME LIKE ? OR DATA LIKE ?)`.
 *   Multiple branches are joined with ` OR `.
 *
 * Mirrors the Go seed-narrowing logic in companion/internal/index/compile.go.
 */
fun buildSelection(node: Node, mode: QueryMode): Selection {
    if (mode == QueryMode.REGEX) {
        val pattern = node.value ?: ""
        val (seeds, broad) = regexSeeds(pattern)
        if (broad) return Selection(null, null)
        val clauses = seeds.map { "$COL_DISPLAY_NAME LIKE ?" }
        val args    = seeds.map { "%$it%" }.toTypedArray()
        return Selection(clauses.joinToString(" OR "), args)
    }

    // Simple / Wildcard mode: one branch per OR clause.
    val branches     = orBranches(node)
    val clauses      = mutableListOf<String>()
    val args         = mutableListOf<String>()
    for (branch in branches) {
        val (seed, ok) = positiveSeed(branch)
        if (!ok) continue  // no positive literal seed; skip branch (recall-safe)
        clauses.add("($COL_DISPLAY_NAME LIKE ? OR $COL_DATA LIKE ?)")
        args.add("%$seed%")
        args.add("%$seed%")
    }
    // No branch produced a positive seed → all branches are negation-only.
    // Return a match-nothing selection so MediaStore yields 0 candidates, which
    // matches the Go companion's 0-result behaviour for all-no-seed queries.
    // (Contrast: regex broad-case keeps Selection(null,null) because the regex
    //  matcher provides precision over the full candidate set.)
    if (clauses.isEmpty()) return Selection("0", emptyArray())
    return Selection(clauses.joinToString(" OR "), args.toTypedArray())
}

// ── MediaStoreSearcher ────────────────────────────────────────────────────────

/**
 * Queries [MediaStore.Files] for local-file candidates narrowed by the query AST,
 * then runs the 5a pipeline ([search]) to produce final [SearchResult].
 *
 * Date mapping: MediaStore DATE_MODIFIED / DATE_ADDED are stored in SECONDS;
 * they are multiplied by 1 000 to yield epoch MILLISECONDS for [FileResult].
 *
 * API-level notes:
 *   - [MediaStore.MediaColumns.RELATIVE_PATH] (API 29+) is included in the
 *     projection only when available; [MediaStore.MediaColumns.DATA] is always
 *     projected and used as the canonical path (deprecated on API 29+ but still
 *     populated on all supported devices in the minSdk-26 target range).
 *   - LIMIT is appended to the sortOrder string (SQLite extension supported by
 *     MediaStore on API 26+, matching the app's minSdk).
 *
 * Pure-function coverage: [buildSelection] is unit-tested; this class is verified
 * on-device (ContentResolver is not available in JVM unit tests).
 */
class MediaStoreSearcher(private val contentResolver: ContentResolver) {

    fun search(req: SearchRequest): SearchResult {
        val node = parse(req.query, req.queryMode)
        val sel  = buildSelection(node, req.queryMode)

        // Build projection; RELATIVE_PATH only available on API 29+.
        val projection = buildList {
            add(MediaStore.MediaColumns.DISPLAY_NAME)
            add(MediaStore.MediaColumns.DATA)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                add(MediaStore.MediaColumns.RELATIVE_PATH)
            }
            add(MediaStore.MediaColumns.SIZE)
            add(MediaStore.MediaColumns.DATE_MODIFIED)
            add(MediaStore.MediaColumns.DATE_ADDED)
            add(MediaStore.MediaColumns.MIME_TYPE)
        }.toTypedArray()

        val uri       = MediaStore.Files.getContentUri("external")
        val sortOrder = "${MediaStore.MediaColumns.DATE_MODIFIED} DESC LIMIT $CANDIDATE_LIMIT"

        val candidates = mutableListOf<FileResult>()

        contentResolver.query(uri, projection, sel.selection, sel.selectionArgs, sortOrder)
            ?.use { cursor ->
                val idxName     = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME)
                val idxData     = cursor.getColumnIndex(MediaStore.MediaColumns.DATA)
                val idxRelPath  = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    cursor.getColumnIndex(MediaStore.MediaColumns.RELATIVE_PATH)
                } else {
                    -1
                }
                val idxSize     = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.SIZE)
                val idxModified = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_MODIFIED)
                val idxAdded    = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_ADDED)
                val idxMime     = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.MIME_TYPE)

                while (cursor.moveToNext()) {
                    val name     = cursor.getString(idxName) ?: continue
                    val dataPath = if (idxData >= 0) cursor.getString(idxData) else null
                    val relPath  = if (idxRelPath >= 0) cursor.getString(idxRelPath) else null

                    // Build the absolute path: prefer DATA (full path, always available);
                    // fall back to /storage/emulated/0/<RELATIVE_PATH><DISPLAY_NAME>.
                    val path: String = when {
                        !dataPath.isNullOrEmpty() -> dataPath
                        !relPath.isNullOrEmpty()  -> "/storage/emulated/0/$relPath$name"
                        else -> continue  // no usable path; skip row
                    }

                    val dir  = path.substringBeforeLast('/', "")
                    val ext  = name.substringAfterLast('.', "").lowercase()
                    val mime = cursor.getString(idxMime) ?: ""
                    val size = cursor.getLong(idxSize)

                    // MediaStore stores dates in SECONDS; convert to epoch MILLISECONDS.
                    val modifiedAt = cursor.getLong(idxModified) * 1_000L
                    val createdAt  = cursor.getLong(idxAdded)    * 1_000L

                    candidates.add(
                        FileResult(
                            id         = path,
                            name       = name,
                            path       = path,
                            dir        = dir,
                            ext        = ext,
                            mime       = mime,
                            type       = classifyType(ext),
                            size       = size,
                            createdAt  = createdAt,
                            modifiedAt = modifiedAt,
                        )
                    )
                }
            }

        return search(candidates, req)
    }
}
