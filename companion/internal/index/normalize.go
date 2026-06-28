package index

import (
	"mime"
	"os"
	"path/filepath"
	"strings"

	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/protocol"
)

// Normalize converts an absolute filesystem path into a FileResult.
// It stats the path and returns an error if the path does not exist.
//
// CreatedAt is always set to 0: retrieving birth-time on Linux requires
// statx(STATX_BTIME), which is a deliberate later, platform-specific
// enhancement. This normalizer intentionally stays cross-platform/stdlib.
func Normalize(path string) (protocol.FileResult, error) {
	info, err := os.Stat(path)
	if err != nil {
		return protocol.FileResult{}, err
	}

	r := protocol.FileResult{
		ID:         path,
		Name:       filepath.Base(path),
		Path:       path,
		Dir:        filepath.Dir(path),
		ModifiedAt: info.ModTime().UnixMilli(),
		// Score and IconHint are filled in later by the pipeline.
	}

	if info.IsDir() {
		r.Type = protocol.FileTypeFolder
		// Size, Ext, and Mime remain zero values for directories.
	} else {
		r.Size = info.Size()
		r.Ext = strings.ToLower(strings.TrimPrefix(filepath.Ext(path), "."))
		r.Type = ClassifyType(r.Ext)
		if r.Ext != "" {
			full := mime.TypeByExtension("." + r.Ext)
			// Strip any "; param=value" suffix — callers only need the type.
			if idx := strings.Index(full, ";"); idx >= 0 {
				full = strings.TrimSpace(full[:idx])
			}
			r.Mime = full
		}
	}

	return r, nil
}
