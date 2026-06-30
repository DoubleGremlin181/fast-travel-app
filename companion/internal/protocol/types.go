// Package protocol defines the Go structs that mirror the Fast Travel companion
// wire contract (shared/companion-protocol/protocol.schema.json).
// JSON field names match the schema exactly.
package protocol

import "github.com/DoubleGremlin181/fast-travel-app/companion/internal/query"

// ProtocolVersion is the current protocol schema version.
const ProtocolVersion = 1

// FileType is a broad file-type category.
type FileType string

const (
	FileTypeDocument FileType = "document"
	FileTypeImage    FileType = "image"
	FileTypeVideo    FileType = "video"
	FileTypeAudio    FileType = "audio"
	FileTypeArchive  FileType = "archive"
	FileTypeCode     FileType = "code"
	FileTypeFolder   FileType = "folder"
	FileTypeOther    FileType = "other"
)

// OS identifies the operating system running the companion daemon.
type OS string

const (
	OSLinux   OS = "linux"
	OSWindows OS = "windows"
	OSMacOS   OS = "macos"
	OSAndroid OS = "android"
)

// FileResult is a single file match returned by /v1/search.
type FileResult struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	Path       string   `json:"path"`
	Dir        string   `json:"dir"`
	Ext        string   `json:"ext"`
	Mime       string   `json:"mime"`
	Type       FileType `json:"type"`
	Size       int64    `json:"size"`
	CreatedAt  int64    `json:"createdAt"`
	ModifiedAt int64    `json:"modifiedAt"`
	Score      float64  `json:"score"`
	IconHint   string   `json:"iconHint,omitempty"`
}

// Sort describes the sort order for search results.
type Sort struct {
	Field string `json:"field"`
	Dir   string `json:"dir"`
}

// DateRange is an inclusive range in epoch milliseconds. Either bound may be omitted.
type DateRange struct {
	From int64 `json:"from,omitempty"`
	To   int64 `json:"to,omitempty"`
}

// Filters are optional server-side filters applied before pagination.
type Filters struct {
	Types         []FileType  `json:"types,omitempty"`
	CreatedRange  *DateRange  `json:"createdRange,omitempty"`
	ModifiedRange *DateRange  `json:"modifiedRange,omitempty"`
	PathPrefix    string      `json:"pathPrefix,omitempty"`
	TitleOnly     bool        `json:"titleOnly,omitempty"`
	Content       bool        `json:"content,omitempty"`
}

// SearchRequest is the body of POST /v1/search.
type SearchRequest struct {
	Query         string      `json:"query"`
	QueryMode     query.Mode  `json:"queryMode"`
	Sort          Sort        `json:"sort"`
	Filters       Filters     `json:"filters"`
	Page          int         `json:"page"`
	PageSize      int         `json:"pageSize"`
	History       []string    `json:"history,omitempty"`
	CaseSensitive bool        `json:"caseSensitive,omitempty"`
	ExactPhrase   bool        `json:"exactPhrase,omitempty"`
}

// SearchResponse is the successful response from POST /v1/search.
type SearchResponse struct {
	Results  []FileResult `json:"results"`
	Total    int          `json:"total"`
	Page     int          `json:"page"`
	TookMs   int64        `json:"tookMs"`
	Indexer  string       `json:"indexer"`
	Degraded bool         `json:"degraded,omitempty"`
}

// Capabilities describes what an indexer supports natively.
type Capabilities struct {
	BooleanOps      bool `json:"booleanOps"`
	PrefixWildcard  bool `json:"prefixWildcard"`
	InfixWildcard   bool `json:"infixWildcard"`
	Regex           bool `json:"regex"`
	PathScope       bool `json:"pathScope"`
	Content         bool `json:"content"`
}

// IndexerInfo describes one search indexer available on the host.
type IndexerInfo struct {
	ID           string       `json:"id"`
	Name         string       `json:"name"`
	Available    bool         `json:"available"`
	Capabilities Capabilities `json:"capabilities"`
}

// PingResponse is the response from GET /v1/ping.
type PingResponse struct {
	Name           string        `json:"name"`
	Version        string        `json:"version"`
	ProtocolVersion int          `json:"protocolVersion"`
	OS             OS            `json:"os"`
	Paired         bool          `json:"paired"`
	PairingOpen    bool          `json:"pairingOpen"`
	DefaultIndexer string        `json:"defaultIndexer"`
	Indexers       []IndexerInfo `json:"indexers"`
}

// PairRequest is the body of POST /v1/pair.
type PairRequest struct {
	ClientName string `json:"clientName"`
}

// PairResponse is the successful response from POST /v1/pair.
type PairResponse struct {
	Token string `json:"token"`
}

// OpenRequest is the body of POST /v1/open.
type OpenRequest struct {
	Path   string `json:"path"`
	Reveal bool   `json:"reveal,omitempty"`
}

// OpenResponse is the successful response from POST /v1/open.
type OpenResponse struct {
	OK bool `json:"ok"`
}

// Error code constants matching the schema enum.
const (
	ErrUnauthorized       = "unauthorized"
	ErrPairingClosed      = "pairing_closed"
	ErrBadRequest         = "bad_request"
	ErrIndexerUnavailable = "indexer_unavailable"
	ErrUnsupportedMode    = "unsupported_mode"
	ErrInternal           = "internal"
)

// ErrorResponse is returned by any endpoint on failure.
type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message"`
}
