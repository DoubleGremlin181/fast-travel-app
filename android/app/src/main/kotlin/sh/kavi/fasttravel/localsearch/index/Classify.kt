package sh.kavi.fasttravel.localsearch.index

/**
 * Maps lowercase file extensions to [FileType] categories.
 * Mirrors companion/internal/index/classify.go extCategory exactly.
 */
private val extCategory: Map<String, FileType> = mapOf(
    // image
    "jpg"  to FileType.IMAGE, "jpeg" to FileType.IMAGE,
    "png"  to FileType.IMAGE, "gif"  to FileType.IMAGE,
    "webp" to FileType.IMAGE, "bmp"  to FileType.IMAGE,
    "svg"  to FileType.IMAGE, "heic" to FileType.IMAGE,
    "tiff" to FileType.IMAGE, "ico"  to FileType.IMAGE,

    // video
    "mp4"  to FileType.VIDEO, "mkv"  to FileType.VIDEO,
    "mov"  to FileType.VIDEO, "avi"  to FileType.VIDEO,
    "webm" to FileType.VIDEO, "flv"  to FileType.VIDEO,
    "wmv"  to FileType.VIDEO, "m4v"  to FileType.VIDEO,

    // audio
    "mp3"  to FileType.AUDIO, "flac" to FileType.AUDIO,
    "wav"  to FileType.AUDIO, "ogg"  to FileType.AUDIO,
    "m4a"  to FileType.AUDIO, "aac"  to FileType.AUDIO,
    "opus" to FileType.AUDIO,

    // archive
    "zip"  to FileType.ARCHIVE, "tar" to FileType.ARCHIVE,
    "gz"   to FileType.ARCHIVE, "bz2" to FileType.ARCHIVE,
    "xz"   to FileType.ARCHIVE, "7z"  to FileType.ARCHIVE,
    "rar"  to FileType.ARCHIVE, "zst" to FileType.ARCHIVE,

    // code
    "go"   to FileType.CODE, "js"   to FileType.CODE,
    "ts"   to FileType.CODE, "tsx"  to FileType.CODE,
    "jsx"  to FileType.CODE, "py"   to FileType.CODE,
    "rs"   to FileType.CODE, "java" to FileType.CODE,
    "kt"   to FileType.CODE, "c"    to FileType.CODE,
    "h"    to FileType.CODE, "cpp"  to FileType.CODE,
    "hpp"  to FileType.CODE, "cs"   to FileType.CODE,
    "rb"   to FileType.CODE, "php"  to FileType.CODE,
    "sh"   to FileType.CODE, "json" to FileType.CODE,
    "yaml" to FileType.CODE, "yml"  to FileType.CODE,
    "toml" to FileType.CODE, "xml"  to FileType.CODE,
    "html" to FileType.CODE, "css"  to FileType.CODE,
    "sql"  to FileType.CODE,

    // document
    "pdf"  to FileType.DOCUMENT, "doc"  to FileType.DOCUMENT,
    "docx" to FileType.DOCUMENT, "xls"  to FileType.DOCUMENT,
    "xlsx" to FileType.DOCUMENT, "ppt"  to FileType.DOCUMENT,
    "pptx" to FileType.DOCUMENT, "odt"  to FileType.DOCUMENT,
    "ods"  to FileType.DOCUMENT, "odp"  to FileType.DOCUMENT,
    "txt"  to FileType.DOCUMENT, "md"   to FileType.DOCUMENT,
    "rtf"  to FileType.DOCUMENT, "csv"  to FileType.DOCUMENT,
    "epub" to FileType.DOCUMENT,
)

/**
 * Returns the [FileType] category for a given lowercase extension.
 * If the extension is unknown, returns [FileType.OTHER].
 * Mirrors companion/internal/index/classify.go ClassifyType.
 */
fun classifyType(ext: String): FileType = extCategory[ext] ?: FileType.OTHER
