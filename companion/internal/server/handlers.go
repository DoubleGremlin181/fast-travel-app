package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"time"

	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/index"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/pairing"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/protocol"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/query"
)

// handlePing serves GET /v1/ping.
// No authentication required. Returns companion metadata and indexer/pairing
// state so the extension can decide whether setup is needed.
func (s *Server) handlePing(w http.ResponseWriter, r *http.Request) {
	defaultID := ""
	if d := s.deps.Registry.Default(); d != nil {
		defaultID = d.ID()
	}

	indexers := s.deps.Registry.Infos()
	if indexers == nil {
		indexers = []protocol.IndexerInfo{}
	}

	writeJSON(w, http.StatusOK, protocol.PingResponse{
		Name:            s.deps.Name,
		Version:         s.deps.Version,
		ProtocolVersion: protocol.ProtocolVersion,
		OS:              s.deps.OS,
		Paired:          s.deps.Pairing.Paired(),
		PairingOpen:     s.deps.Pairing.PairingOpen(),
		DefaultIndexer:  defaultID,
		Indexers:        indexers,
	})
}

// handlePair serves POST /v1/pair.
// No bearer token is required — pairing IS how the extension obtains one.
// Reads the Origin header and a PairRequest body.
// Success → 200 PairResponse{Token}.
// ErrPairingClosed → 403 pairing_closed.
// Bad JSON → 400 bad_request.
func (s *Server) handlePair(w http.ResponseWriter, r *http.Request) {
	var req protocol.PairRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, protocol.ErrBadRequest, "invalid JSON body")
		return
	}

	origin := r.Header.Get("Origin")
	token, err := s.deps.Pairing.Pair(origin, req.ClientName)
	if err != nil {
		if errors.Is(err, pairing.ErrPairingClosed) {
			writeErr(w, http.StatusForbidden, protocol.ErrPairingClosed, "pairing window is closed")
			return
		}
		writeErr(w, http.StatusInternalServerError, protocol.ErrInternal, "pairing failed")
		return
	}
	// Token is returned only in the response body — never written to a log.
	writeJSON(w, http.StatusOK, protocol.PairResponse{Token: token})
}

// handlePairingOpen serves POST /v1/pairing/open.
// No authentication required — this endpoint is triggered from the localhost
// /setup page only. It opens the pairing window for 5 minutes.
//
// Security note: opening the window alone grants nothing. A deliberate POST
// /v1/pair from the browser extension (with its Origin) is still required to
// obtain a token.
func (s *Server) handlePairingOpen(w http.ResponseWriter, r *http.Request) {
	s.deps.Pairing.OpenPairingWindow(5 * time.Minute)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// handleSearch serves POST /v1/search.
// Auth required: Authorization: Bearer <token> + matching Origin header.
//
// The query is pre-validated with query.Parse before calling the provider so
// that parse failures surface as 400 bad_request rather than 500 internal.
// Error mapping:
//
//	parse error      → 400 bad_request
//	ErrNoIndexer     → 503 indexer_unavailable
//	other errors     → 500 internal
func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request) {
	if !s.requireAuth(w, r) {
		return
	}

	var req protocol.SearchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, protocol.ErrBadRequest, "invalid JSON body")
		return
	}

	// Pre-validate the query to catch parse errors before calling the provider.
	if _, err := query.Parse(req.Query, req.QueryMode); err != nil {
		writeErr(w, http.StatusBadRequest, protocol.ErrBadRequest, err.Error())
		return
	}

	resp, err := s.deps.Registry.Search(r.Context(), req)
	if err != nil {
		switch {
		case errors.Is(err, index.ErrNoIndexer):
			writeErr(w, http.StatusServiceUnavailable, protocol.ErrIndexerUnavailable, "no file indexer available")
		default:
			writeErr(w, http.StatusInternalServerError, protocol.ErrInternal, "search failed")
		}
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

// handleOpen serves POST /v1/open.
// Auth required. Rejects with 400 if Path is empty or does not exist on disk.
// Calls Opener.Open or Opener.Reveal according to the Reveal field.
// Success → 200 OpenResponse{OK: true}.
// Opener error → 500 internal.
func (s *Server) handleOpen(w http.ResponseWriter, r *http.Request) {
	if !s.requireAuth(w, r) {
		return
	}

	var req protocol.OpenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, protocol.ErrBadRequest, "invalid JSON body")
		return
	}

	if req.Path == "" {
		writeErr(w, http.StatusBadRequest, protocol.ErrBadRequest, "path is required")
		return
	}

	if _, err := os.Stat(req.Path); err != nil {
		writeErr(w, http.StatusBadRequest, protocol.ErrBadRequest, "path does not exist or is not accessible")
		return
	}

	var err error
	if req.Reveal {
		err = s.deps.Opener.Reveal(req.Path)
	} else {
		err = s.deps.Opener.Open(req.Path)
	}

	if err != nil {
		writeErr(w, http.StatusInternalServerError, protocol.ErrInternal, "open failed")
		return
	}

	writeJSON(w, http.StatusOK, protocol.OpenResponse{OK: true})
}
