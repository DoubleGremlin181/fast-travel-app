package index

import "github.com/DoubleGremlin181/fast-travel-app/companion/internal/protocol"

// extCategory maps lowercase file extensions to FileType categories.
var extCategory = map[string]protocol.FileType{
	// image
	"jpg": protocol.FileTypeImage, "jpeg": protocol.FileTypeImage,
	"png": protocol.FileTypeImage, "gif": protocol.FileTypeImage,
	"webp": protocol.FileTypeImage, "bmp": protocol.FileTypeImage,
	"svg": protocol.FileTypeImage, "heic": protocol.FileTypeImage,
	"tiff": protocol.FileTypeImage, "ico": protocol.FileTypeImage,

	// video
	"mp4": protocol.FileTypeVideo, "mkv": protocol.FileTypeVideo,
	"mov": protocol.FileTypeVideo, "avi": protocol.FileTypeVideo,
	"webm": protocol.FileTypeVideo, "flv": protocol.FileTypeVideo,
	"wmv": protocol.FileTypeVideo, "m4v": protocol.FileTypeVideo,

	// audio
	"mp3": protocol.FileTypeAudio, "flac": protocol.FileTypeAudio,
	"wav": protocol.FileTypeAudio, "ogg": protocol.FileTypeAudio,
	"m4a": protocol.FileTypeAudio, "aac": protocol.FileTypeAudio,
	"opus": protocol.FileTypeAudio,

	// archive
	"zip": protocol.FileTypeArchive, "tar": protocol.FileTypeArchive,
	"gz": protocol.FileTypeArchive, "bz2": protocol.FileTypeArchive,
	"xz": protocol.FileTypeArchive, "7z": protocol.FileTypeArchive,
	"rar": protocol.FileTypeArchive, "zst": protocol.FileTypeArchive,

	// code
	"go": protocol.FileTypeCode, "js": protocol.FileTypeCode,
	"ts": protocol.FileTypeCode, "tsx": protocol.FileTypeCode,
	"jsx": protocol.FileTypeCode, "py": protocol.FileTypeCode,
	"rs": protocol.FileTypeCode, "java": protocol.FileTypeCode,
	"kt": protocol.FileTypeCode, "c": protocol.FileTypeCode,
	"h": protocol.FileTypeCode, "cpp": protocol.FileTypeCode,
	"hpp": protocol.FileTypeCode, "cs": protocol.FileTypeCode,
	"rb": protocol.FileTypeCode, "php": protocol.FileTypeCode,
	"sh": protocol.FileTypeCode, "json": protocol.FileTypeCode,
	"yaml": protocol.FileTypeCode, "yml": protocol.FileTypeCode,
	"toml": protocol.FileTypeCode, "xml": protocol.FileTypeCode,
	"html": protocol.FileTypeCode, "css": protocol.FileTypeCode,
	"sql": protocol.FileTypeCode,

	// document
	"pdf": protocol.FileTypeDocument, "doc": protocol.FileTypeDocument,
	"docx": protocol.FileTypeDocument, "xls": protocol.FileTypeDocument,
	"xlsx": protocol.FileTypeDocument, "ppt": protocol.FileTypeDocument,
	"pptx": protocol.FileTypeDocument, "odt": protocol.FileTypeDocument,
	"ods": protocol.FileTypeDocument, "odp": protocol.FileTypeDocument,
	"txt": protocol.FileTypeDocument, "md": protocol.FileTypeDocument,
	"rtf": protocol.FileTypeDocument, "csv": protocol.FileTypeDocument,
	"epub": protocol.FileTypeDocument,
}

// ClassifyType returns the FileType category for a given lowercase extension.
// If the extension is unknown, it returns FileTypeOther.
func ClassifyType(ext string) protocol.FileType {
	if t, ok := extCategory[ext]; ok {
		return t
	}
	return protocol.FileTypeOther
}
