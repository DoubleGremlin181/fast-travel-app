// Package server implements the Fast Travel companion daemon's loopback HTTP
// server. It wires the indexer Registry and the pairing Manager into a set of
// JSON REST endpoints served on 127.0.0.1 only.
//
// WebSocket /v1/stream is planned but not yet implemented. Go's stdlib has no
// WebSocket server and we want a dependency-free static binary for v1. A fast
// synchronous POST /v1/search is provided instead.
package server

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/index"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/protocol"
)

// SearchProvider is the interface the server calls on the file-indexer registry.
// The real *index.Registry satisfies this structurally without any changes to
// that package.
type SearchProvider interface {
	Search(ctx context.Context, req protocol.SearchRequest) (protocol.SearchResponse, error)
	Infos() []protocol.IndexerInfo
	Default() index.Indexer // nil when no indexer is available
}

// Authorizer is the interface the server calls on the pairing manager.
// The real *pairing.Manager satisfies this structurally without any changes to
// that package.
type Authorizer interface {
	Paired() bool
	PairingOpen() bool
	OpenPairingWindow(d time.Duration)
	Pair(origin, clientName string) (string, error)
	Authorize(origin, token string) bool
}

// Deps groups all injectable dependencies for the server. Using Deps means
// tests can supply fakes for every dependency without touching real backends.
type Deps struct {
	Registry SearchProvider
	Pairing  Authorizer
	Opener   Opener
	Name     string      // e.g. "fast-travel-companion"
	Version  string
	OS       protocol.OS // e.g. "linux"
	Port     int         // chosen listen port, shown on /setup page (0 = unknown)
}

// Server is the companion HTTP server.
type Server struct {
	deps Deps
}

// New creates a Server with the given dependencies.
func New(d Deps) *Server {
	return &Server{deps: d}
}

// Handler builds and returns the HTTP mux with all companion routes registered.
// Uses Go 1.22+ method-prefixed pattern syntax.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/ping", s.handlePing)
	mux.HandleFunc("POST /v1/pair", s.handlePair)
	mux.HandleFunc("POST /v1/pairing/open", s.handlePairingOpen)
	mux.HandleFunc("POST /v1/search", s.handleSearch)
	mux.HandleFunc("POST /v1/open", s.handleOpen)
	mux.HandleFunc("GET /setup", s.handleSetup)
	return mux
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// writeJSON writes v encoded as JSON with the given HTTP status code.
// Sets Content-Type: application/json.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// writeErr writes an ErrorResponse JSON body with the given HTTP status.
func writeErr(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, protocol.ErrorResponse{Error: code, Message: msg})
}

// bearerToken extracts the token from "Authorization: Bearer <token>".
// Returns "" if the header is absent or has an unexpected format.
// The token value is never logged.
func bearerToken(r *http.Request) string {
	const prefix = "Bearer "
	auth := r.Header.Get("Authorization")
	if !strings.HasPrefix(auth, prefix) {
		return ""
	}
	return auth[len(prefix):]
}

// requireAuth checks that the request carries a valid bearer token for the
// request's Origin. It writes a 401 response and returns false on failure.
// Tokens are never logged.
func (s *Server) requireAuth(w http.ResponseWriter, r *http.Request) bool {
	origin := r.Header.Get("Origin")
	token := bearerToken(r)
	if !s.deps.Pairing.Authorize(origin, token) {
		writeErr(w, http.StatusUnauthorized, protocol.ErrUnauthorized, "invalid or missing credentials")
		return false
	}
	return true
}
