package server_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/index"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/pairing"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/protocol"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/server"
)

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

// fakeSearch implements server.SearchProvider.
type fakeSearch struct {
	resp  protocol.SearchResponse
	err   error
	infos []protocol.IndexerInfo
	dflt  index.Indexer // returned by Default(); nil = no default
}

func (f *fakeSearch) Search(_ context.Context, _ protocol.SearchRequest) (protocol.SearchResponse, error) {
	return f.resp, f.err
}

func (f *fakeSearch) Infos() []protocol.IndexerInfo {
	if f.infos == nil {
		return []protocol.IndexerInfo{}
	}
	return f.infos
}

func (f *fakeSearch) Default() index.Indexer { return f.dflt }

// fakeOpener implements server.Opener and records calls.
// If err is non-nil, Open and Reveal return it instead of succeeding.
type fakeOpener struct {
	openCalled   string
	revealCalled string
	err          error
}

func (f *fakeOpener) Open(path string) error   { f.openCalled = path; return f.err }
func (f *fakeOpener) Reveal(path string) error { f.revealCalled = path; return f.err }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// newTestServer creates a server with a real pairing.Manager (backed by TempDir)
// and the supplied fake Search/Opener. Returns the handler and the manager so
// tests can drive the pairing state directly.
func newTestServer(t *testing.T, fs *fakeSearch, fo *fakeOpener) (http.Handler, *pairing.Manager) {
	t.Helper()
	m, err := pairing.New(t.TempDir(), nil)
	if err != nil {
		t.Fatalf("pairing.New: %v", err)
	}
	s := server.New(server.Deps{
		Registry: fs,
		Pairing:  m,
		Opener:   fo,
		Name:     "fast-travel-companion",
		Version:  "test",
		OS:       "linux",
		Port:     7333,
	})
	return s.Handler(), m
}

// doRequest fires a request against h and returns the recorder.
func doRequest(h http.Handler, method, path string, body []byte, headers map[string]string) *httptest.ResponseRecorder {
	var r *http.Request
	if body != nil {
		r = httptest.NewRequest(method, path, bytes.NewReader(body))
	} else {
		r = httptest.NewRequest(method, path, nil)
	}
	for k, v := range headers {
		r.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	return rec
}

// pairAndGetToken opens the pairing window on m, then POSTs /v1/pair to h and
// returns the token. Panics the test on failure.
func pairAndGetToken(t *testing.T, h http.Handler, m *pairing.Manager) (token, origin string) {
	t.Helper()
	origin = "chrome-extension://testtest"
	m.OpenPairingWindow(5 * time.Minute)

	body := mustMarshal(t, protocol.PairRequest{ClientName: "test-browser"})
	rec := doRequest(h, "POST", "/v1/pair", body, map[string]string{
		"Content-Type": "application/json",
		"Origin":       origin,
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("pairAndGetToken: got %d, body: %s", rec.Code, rec.Body.String())
	}
	var resp protocol.PairResponse
	mustUnmarshal(t, rec.Body.Bytes(), &resp)
	if resp.Token == "" {
		t.Fatal("pairAndGetToken: empty token")
	}
	return resp.Token, origin
}

// authHeaders returns headers with Bearer auth and the given origin.
func authHeaders(token, origin string) map[string]string {
	return map[string]string{
		"Content-Type":  "application/json",
		"Authorization": "Bearer " + token,
		"Origin":        origin,
	}
}

func mustMarshal(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func mustUnmarshal(t *testing.T, data []byte, v any) {
	t.Helper()
	if err := json.Unmarshal(data, v); err != nil {
		t.Fatalf("unmarshal: %v (raw: %s)", err, data)
	}
}

// ---------------------------------------------------------------------------
// GET /v1/ping
// ---------------------------------------------------------------------------

func TestPing_Shape(t *testing.T) {
	fs := &fakeSearch{
		infos: []protocol.IndexerInfo{
			{ID: "mem", Name: "In-memory", Available: true},
		},
	}
	h, _ := newTestServer(t, fs, &fakeOpener{})

	rec := doRequest(h, "GET", "/v1/ping", nil, nil)

	if rec.Code != http.StatusOK {
		t.Fatalf("ping: got %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type: %q, want application/json", ct)
	}

	var resp protocol.PingResponse
	mustUnmarshal(t, rec.Body.Bytes(), &resp)

	if resp.ProtocolVersion != protocol.ProtocolVersion {
		t.Errorf("ProtocolVersion: got %d, want %d", resp.ProtocolVersion, protocol.ProtocolVersion)
	}
	if len(resp.Indexers) != 1 || resp.Indexers[0].ID != "mem" {
		t.Errorf("Indexers: got %v", resp.Indexers)
	}
	if resp.Paired {
		t.Error("Paired: want false initially")
	}
	if resp.PairingOpen {
		t.Error("PairingOpen: want false initially")
	}
	if resp.Name != "fast-travel-companion" {
		t.Errorf("Name: %q", resp.Name)
	}
}

func TestPing_ReflectsPairedState(t *testing.T) {
	h, m := newTestServer(t, &fakeSearch{}, &fakeOpener{})
	pairAndGetToken(t, h, m) // side-effect: m is now paired

	rec := doRequest(h, "GET", "/v1/ping", nil, nil)
	var resp protocol.PingResponse
	mustUnmarshal(t, rec.Body.Bytes(), &resp)

	if !resp.Paired {
		t.Error("Paired: want true after pairing")
	}
}

// ---------------------------------------------------------------------------
// POST /v1/pair
// ---------------------------------------------------------------------------

func TestPair_WindowOpen_ReturnsToken(t *testing.T) {
	h, m := newTestServer(t, &fakeSearch{}, &fakeOpener{})
	m.OpenPairingWindow(5 * time.Minute)

	body := mustMarshal(t, protocol.PairRequest{ClientName: "my-browser"})
	rec := doRequest(h, "POST", "/v1/pair", body, map[string]string{
		"Content-Type": "application/json",
		"Origin":       "chrome-extension://abc",
	})

	if rec.Code != http.StatusOK {
		t.Fatalf("pair: got %d, body: %s", rec.Code, rec.Body.String())
	}
	var resp protocol.PairResponse
	mustUnmarshal(t, rec.Body.Bytes(), &resp)
	if resp.Token == "" {
		t.Error("pair: token is empty")
	}
}

func TestPair_WindowClosed_Returns403(t *testing.T) {
	h, _ := newTestServer(t, &fakeSearch{}, &fakeOpener{}) // window never opened

	body := mustMarshal(t, protocol.PairRequest{ClientName: "my-browser"})
	rec := doRequest(h, "POST", "/v1/pair", body, map[string]string{
		"Content-Type": "application/json",
		"Origin":       "chrome-extension://xyz",
	})

	if rec.Code != http.StatusForbidden {
		t.Fatalf("pair closed: got %d, want 403", rec.Code)
	}
	var errResp protocol.ErrorResponse
	mustUnmarshal(t, rec.Body.Bytes(), &errResp)
	if errResp.Error != protocol.ErrPairingClosed {
		t.Errorf("pair closed error code: got %q, want %q", errResp.Error, protocol.ErrPairingClosed)
	}
}

func TestPair_BadJSON_Returns400(t *testing.T) {
	h, _ := newTestServer(t, &fakeSearch{}, &fakeOpener{})

	rec := doRequest(h, "POST", "/v1/pair", []byte("{not-json"), map[string]string{
		"Content-Type": "application/json",
	})

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("pair bad json: got %d, want 400", rec.Code)
	}
	var errResp protocol.ErrorResponse
	mustUnmarshal(t, rec.Body.Bytes(), &errResp)
	if errResp.Error != protocol.ErrBadRequest {
		t.Errorf("pair bad json error: got %q, want %q", errResp.Error, protocol.ErrBadRequest)
	}
}

// ---------------------------------------------------------------------------
// POST /v1/search
// ---------------------------------------------------------------------------

func TestSearch_NoToken_Returns401(t *testing.T) {
	h, _ := newTestServer(t, &fakeSearch{}, &fakeOpener{})

	body := mustMarshal(t, protocol.SearchRequest{Query: "hello"})
	rec := doRequest(h, "POST", "/v1/search", body, map[string]string{
		"Content-Type": "application/json",
	})

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("search no auth: got %d, want 401", rec.Code)
	}
	var errResp protocol.ErrorResponse
	mustUnmarshal(t, rec.Body.Bytes(), &errResp)
	if errResp.Error != protocol.ErrUnauthorized {
		t.Errorf("error code: got %q, want %q", errResp.Error, protocol.ErrUnauthorized)
	}
}

func TestSearch_InvalidToken_Returns401(t *testing.T) {
	h, _ := newTestServer(t, &fakeSearch{}, &fakeOpener{})

	body := mustMarshal(t, protocol.SearchRequest{Query: "hello"})
	rec := doRequest(h, "POST", "/v1/search", body, map[string]string{
		"Content-Type":  "application/json",
		"Authorization": "Bearer totallyinvalidtoken",
		"Origin":        "chrome-extension://fake",
	})

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("search invalid token: got %d, want 401", rec.Code)
	}
}

func TestSearch_ValidToken_ReturnsCannedResults(t *testing.T) {
	canned := protocol.SearchResponse{
		Results: []protocol.FileResult{
			{ID: "1", Name: "report.pdf", Path: "/home/user/report.pdf"},
		},
		Total:   1,
		Indexer: "mem",
	}
	fs := &fakeSearch{resp: canned}
	h, m := newTestServer(t, fs, &fakeOpener{})
	token, origin := pairAndGetToken(t, h, m)

	body := mustMarshal(t, protocol.SearchRequest{Query: "report", QueryMode: "simple"})
	rec := doRequest(h, "POST", "/v1/search", body, authHeaders(token, origin))

	if rec.Code != http.StatusOK {
		t.Fatalf("search valid: got %d, body: %s", rec.Code, rec.Body.String())
	}
	var resp protocol.SearchResponse
	mustUnmarshal(t, rec.Body.Bytes(), &resp)
	if len(resp.Results) != 1 || resp.Results[0].ID != "1" {
		t.Errorf("results: got %v", resp.Results)
	}
}

func TestSearch_ErrNoIndexer_Returns503(t *testing.T) {
	fs := &fakeSearch{err: index.ErrNoIndexer}
	h, m := newTestServer(t, fs, &fakeOpener{})
	token, origin := pairAndGetToken(t, h, m)

	body := mustMarshal(t, protocol.SearchRequest{Query: "anything", QueryMode: "simple"})
	rec := doRequest(h, "POST", "/v1/search", body, authHeaders(token, origin))

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("search no indexer: got %d, want 503", rec.Code)
	}
	var errResp protocol.ErrorResponse
	mustUnmarshal(t, rec.Body.Bytes(), &errResp)
	if errResp.Error != protocol.ErrIndexerUnavailable {
		t.Errorf("error code: got %q, want %q", errResp.Error, protocol.ErrIndexerUnavailable)
	}
}

func TestSearch_EmptyQuery_Returns400(t *testing.T) {
	h, m := newTestServer(t, &fakeSearch{}, &fakeOpener{})
	token, origin := pairAndGetToken(t, h, m)

	// Empty query triggers query.Parse failure → bad_request.
	body := mustMarshal(t, protocol.SearchRequest{Query: "", QueryMode: "simple"})
	rec := doRequest(h, "POST", "/v1/search", body, authHeaders(token, origin))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("search empty query: got %d, want 400", rec.Code)
	}
	var errResp protocol.ErrorResponse
	mustUnmarshal(t, rec.Body.Bytes(), &errResp)
	if errResp.Error != protocol.ErrBadRequest {
		t.Errorf("error code: got %q, want %q", errResp.Error, protocol.ErrBadRequest)
	}
}

// ---------------------------------------------------------------------------
// POST /v1/open
// ---------------------------------------------------------------------------

func TestOpen_NoAuth_Returns401(t *testing.T) {
	h, _ := newTestServer(t, &fakeSearch{}, &fakeOpener{})

	body := mustMarshal(t, protocol.OpenRequest{Path: "/tmp/x"})
	rec := doRequest(h, "POST", "/v1/open", body, map[string]string{
		"Content-Type": "application/json",
	})

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("open no auth: got %d, want 401", rec.Code)
	}
}

func TestOpen_EmptyPath_Returns400(t *testing.T) {
	h, m := newTestServer(t, &fakeSearch{}, &fakeOpener{})
	token, origin := pairAndGetToken(t, h, m)

	body := mustMarshal(t, protocol.OpenRequest{Path: ""})
	rec := doRequest(h, "POST", "/v1/open", body, authHeaders(token, origin))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("open empty path: got %d, want 400", rec.Code)
	}
	var errResp protocol.ErrorResponse
	mustUnmarshal(t, rec.Body.Bytes(), &errResp)
	if errResp.Error != protocol.ErrBadRequest {
		t.Errorf("error code: got %q, want %q", errResp.Error, protocol.ErrBadRequest)
	}
}

func TestOpen_NonexistentPath_Returns400(t *testing.T) {
	h, m := newTestServer(t, &fakeSearch{}, &fakeOpener{})
	token, origin := pairAndGetToken(t, h, m)

	body := mustMarshal(t, protocol.OpenRequest{Path: "/absolutely/no/such/file/exists/here.txt"})
	rec := doRequest(h, "POST", "/v1/open", body, authHeaders(token, origin))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("open nonexistent: got %d, want 400", rec.Code)
	}
}

func TestOpen_ValidPath_CallsOpener(t *testing.T) {
	f, err := os.CreateTemp(t.TempDir(), "ftc-test-*.txt")
	if err != nil {
		t.Fatal(err)
	}
	f.Close()

	fo := &fakeOpener{}
	h, m := newTestServer(t, &fakeSearch{}, fo)
	token, origin := pairAndGetToken(t, h, m)

	body := mustMarshal(t, protocol.OpenRequest{Path: f.Name(), Reveal: false})
	rec := doRequest(h, "POST", "/v1/open", body, authHeaders(token, origin))

	if rec.Code != http.StatusOK {
		t.Fatalf("open valid: got %d, body: %s", rec.Code, rec.Body.String())
	}
	var resp protocol.OpenResponse
	mustUnmarshal(t, rec.Body.Bytes(), &resp)
	if !resp.OK {
		t.Error("open: OK should be true")
	}
	if fo.openCalled != f.Name() {
		t.Errorf("Open called with %q, want %q", fo.openCalled, f.Name())
	}
	if fo.revealCalled != "" {
		t.Errorf("Reveal should not have been called, got %q", fo.revealCalled)
	}
}

func TestOpen_ValidPath_Reveal(t *testing.T) {
	f, err := os.CreateTemp(t.TempDir(), "ftc-test-*.txt")
	if err != nil {
		t.Fatal(err)
	}
	f.Close()

	fo := &fakeOpener{}
	h, m := newTestServer(t, &fakeSearch{}, fo)
	token, origin := pairAndGetToken(t, h, m)

	body := mustMarshal(t, protocol.OpenRequest{Path: f.Name(), Reveal: true})
	rec := doRequest(h, "POST", "/v1/open", body, authHeaders(token, origin))

	if rec.Code != http.StatusOK {
		t.Fatalf("open reveal: got %d, body: %s", rec.Code, rec.Body.String())
	}
	if fo.revealCalled != f.Name() {
		t.Errorf("Reveal called with %q, want %q", fo.revealCalled, f.Name())
	}
	if fo.openCalled != "" {
		t.Errorf("Open should not have been called, got %q", fo.openCalled)
	}
}

// ---------------------------------------------------------------------------
// POST /v1/pairing/open
// ---------------------------------------------------------------------------

func TestPairingOpen_SetsWindowOpen(t *testing.T) {
	h, m := newTestServer(t, &fakeSearch{}, &fakeOpener{})

	if m.PairingOpen() {
		t.Error("PairingOpen: should be false initially")
	}

	rec := doRequest(h, "POST", "/v1/pairing/open", nil, nil)

	if rec.Code != http.StatusOK {
		t.Fatalf("pairing/open: got %d, want 200", rec.Code)
	}
	var body map[string]bool
	mustUnmarshal(t, rec.Body.Bytes(), &body)
	if !body["ok"] {
		t.Error("pairing/open response: ok should be true")
	}
	if !m.PairingOpen() {
		t.Error("PairingOpen: should be true after POST /v1/pairing/open")
	}
}

func TestPairingOpen_CrossSite_Returns403(t *testing.T) {
	h, m := newTestServer(t, &fakeSearch{}, &fakeOpener{})

	rec := doRequest(h, "POST", "/v1/pairing/open", nil, map[string]string{
		"Sec-Fetch-Site": "cross-site",
	})

	if rec.Code != http.StatusForbidden {
		t.Fatalf("pairing/open cross-site: got %d, want 403", rec.Code)
	}
	var errResp protocol.ErrorResponse
	mustUnmarshal(t, rec.Body.Bytes(), &errResp)
	if errResp.Error != protocol.ErrUnauthorized {
		t.Errorf("error code: got %q, want %q", errResp.Error, protocol.ErrUnauthorized)
	}
	// Window must NOT have been opened.
	if m.PairingOpen() {
		t.Error("PairingOpen: must remain closed when request is cross-site")
	}
}

func TestPairingOpen_SameOrigin_Returns200(t *testing.T) {
	h, m := newTestServer(t, &fakeSearch{}, &fakeOpener{})

	rec := doRequest(h, "POST", "/v1/pairing/open", nil, map[string]string{
		"Sec-Fetch-Site": "same-origin",
	})

	if rec.Code != http.StatusOK {
		t.Fatalf("pairing/open same-origin: got %d, want 200", rec.Code)
	}
	if !m.PairingOpen() {
		t.Error("PairingOpen: should be true after same-origin POST")
	}
}

// ---------------------------------------------------------------------------
// GET /setup
// ---------------------------------------------------------------------------

func TestSetup_Returns200HTML(t *testing.T) {
	h, _ := newTestServer(t, &fakeSearch{}, &fakeOpener{})

	rec := doRequest(h, "GET", "/setup", nil, nil)

	if rec.Code != http.StatusOK {
		t.Fatalf("setup: got %d, want 200", rec.Code)
	}
	ct := rec.Header().Get("Content-Type")
	if !strings.HasPrefix(ct, "text/html") {
		t.Errorf("Content-Type: got %q, want prefix text/html", ct)
	}
	if !strings.Contains(rec.Body.String(), "<html") {
		t.Error("setup: response body does not contain <html>")
	}
}

// ---------------------------------------------------------------------------
// POST /v1/search — generic provider error
// ---------------------------------------------------------------------------

func TestSearch_GenericError_Returns500(t *testing.T) {
	fs := &fakeSearch{err: errors.New("boom")}
	h, m := newTestServer(t, fs, &fakeOpener{})
	token, origin := pairAndGetToken(t, h, m)

	body := mustMarshal(t, protocol.SearchRequest{Query: "anything", QueryMode: "simple"})
	rec := doRequest(h, "POST", "/v1/search", body, authHeaders(token, origin))

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("search generic error: got %d, want 500", rec.Code)
	}
	var errResp protocol.ErrorResponse
	mustUnmarshal(t, rec.Body.Bytes(), &errResp)
	if errResp.Error != protocol.ErrInternal {
		t.Errorf("error code: got %q, want %q", errResp.Error, protocol.ErrInternal)
	}
}

// ---------------------------------------------------------------------------
// POST /v1/open — opener failure
// ---------------------------------------------------------------------------

func TestOpen_OpenerError_Returns500(t *testing.T) {
	f, err := os.CreateTemp(t.TempDir(), "ftc-test-*.txt")
	if err != nil {
		t.Fatal(err)
	}
	f.Close()

	fo := &fakeOpener{err: errors.New("xdg-open: no application found")}
	h, m := newTestServer(t, &fakeSearch{}, fo)
	token, origin := pairAndGetToken(t, h, m)

	body := mustMarshal(t, protocol.OpenRequest{Path: f.Name(), Reveal: false})
	rec := doRequest(h, "POST", "/v1/open", body, authHeaders(token, origin))

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("open opener error: got %d, want 500", rec.Code)
	}
	var errResp protocol.ErrorResponse
	mustUnmarshal(t, rec.Body.Bytes(), &errResp)
	if errResp.Error != protocol.ErrInternal {
		t.Errorf("error code: got %q, want %q", errResp.Error, protocol.ErrInternal)
	}
}
