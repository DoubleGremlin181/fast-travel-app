// Package pairing implements the companion daemon's security boundary.
//
// It mints and persists a 256-bit bearer token, enforces an Origin allowlist
// for auto-pairing, and manages a time-bounded pairing window that the user
// must explicitly open before an unknown extension can pair. All data endpoints
// must call Authorize; arbitrary local pages that never paired cannot obtain
// a token and therefore cannot read the user's files.
package pairing

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// ErrPairingClosed is returned by Pair when the pairing window is closed and
// the caller's origin is not on the configured allowlist.
var ErrPairingClosed = errors.New("pairing closed")

// persistedState is the JSON representation written to pairing.json.
type persistedState struct {
	Token          string   `json:"token"`
	AllowedOrigins []string `json:"allowedOrigins"`
	ClientName     string   `json:"clientName"`
}

// Manager holds the pairing state for a companion daemon instance.
// All exported methods are safe for concurrent use.
type Manager struct {
	mu              sync.Mutex
	configDir       string
	configAllowlist []string // origins from New args (never changes)
	now             func() time.Time

	// Fields below are guarded by mu.
	token         string
	pairedOrigins []string // origins that have been granted this token
	clientName    string
	windowExpiry  time.Time // zero → closed
}

// New loads any persisted pairing state from configDir and returns a Manager.
// allowedOrigins is the Origin allowlist for auto-pair (e.g.
// []string{"chrome-extension://<id>"}); may be nil. A missing pairing.json is
// treated as unpaired; a malformed file is also treated as unpaired (no crash).
func New(configDir string, allowedOrigins []string) (*Manager, error) {
	return NewWithClock(configDir, allowedOrigins, time.Now)
}

// NewWithClock is like New but accepts an injectable clock so that
// pairing-window-expiry tests are deterministic and fast.
func NewWithClock(configDir string, allowedOrigins []string, now func() time.Time) (*Manager, error) {
	m := &Manager{
		configDir:       configDir,
		configAllowlist: allowedOrigins,
		now:             now,
	}
	if err := m.load(); err != nil {
		return nil, err
	}
	return m, nil
}

// Paired reports whether a token has been issued (i.e. at least one origin has
// successfully paired).
func (m *Manager) Paired() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.token != ""
}

// PairingOpen reports whether the pairing window is currently open.
func (m *Manager) PairingOpen() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.windowOpenLocked()
}

// OpenPairingWindow opens the pairing window for duration d from now. Used on
// first run (when unpaired) and when the user clicks "Open pairing" on the
// setup page.
func (m *Manager) OpenPairingWindow(d time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.windowExpiry = m.now().Add(d)
}

// ClosePairingWindow closes the pairing window immediately.
func (m *Manager) ClosePairingWindow() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.windowExpiry = time.Time{}
}

// Authorize reports whether a data request bearing token from origin is
// permitted. Both conditions must hold: the token must exactly match the stored
// token (constant-time comparison) AND origin must be a previously paired
// origin. Returns false immediately when unpaired.
func (m *Manager) Authorize(origin, token string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.token == "" {
		return false
	}
	// Constant-time compare — length mismatch safely returns 0.
	if subtle.ConstantTimeCompare([]byte(token), []byte(m.token)) != 1 {
		return false
	}
	return m.hasPairedOrigin(origin)
}

// Pair grants a token to a caller. It succeeds only when PairingOpen() == true
// OR origin is on the configured allowlist. On success it:
//   - generates a 256-bit token if one does not already exist (re-pairing the
//     same origin is idempotent: the existing token is reused),
//   - records origin in the set of paired origins (deduplicated),
//   - persists state to disk,
//   - closes the pairing window, and
//   - returns the token.
//
// On failure it returns ("", ErrPairingClosed). No token is leaked in error
// messages.
func (m *Manager) Pair(origin, clientName string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.windowOpenLocked() && !m.isAllowlisted(origin) {
		return "", ErrPairingClosed
	}

	// Mint a token on first pair; reuse the existing one thereafter so that
	// multiple browsers share the same token and re-pairing is idempotent.
	if m.token == "" {
		tok, err := generateToken()
		if err != nil {
			return "", err
		}
		m.token = tok
		m.clientName = clientName
	}

	// Record origin (deduplicated).
	if !m.hasPairedOrigin(origin) {
		m.pairedOrigins = append(m.pairedOrigins, origin)
	}

	// Close the window — a deliberate user action is consumed on success.
	m.windowExpiry = time.Time{}

	if err := m.save(); err != nil {
		return "", err
	}
	return m.token, nil
}

// Unpair clears the token, paired origins, and removes the persisted file.
// Calling Unpair on an already-unpaired Manager is a no-op (no error).
func (m *Manager) Unpair() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.token = ""
	m.pairedOrigins = nil
	m.clientName = ""
	m.windowExpiry = time.Time{}

	path := filepath.Join(m.configDir, "pairing.json")
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// ---------------------------------------------------------------------------
// Internal helpers (all called with m.mu held unless noted)
// ---------------------------------------------------------------------------

func (m *Manager) windowOpenLocked() bool {
	return !m.windowExpiry.IsZero() && m.now().Before(m.windowExpiry)
}

func (m *Manager) isAllowlisted(origin string) bool {
	for _, o := range m.configAllowlist {
		if o == origin {
			return true
		}
	}
	return false
}

func (m *Manager) hasPairedOrigin(origin string) bool {
	for _, o := range m.pairedOrigins {
		if o == origin {
			return true
		}
	}
	return false
}

// load reads pairing.json from configDir. Missing → unpaired (no error).
// Malformed → unpaired (no error, no crash).
func (m *Manager) load() error {
	path := filepath.Join(m.configDir, "pairing.json")
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	var s persistedState
	if err := json.Unmarshal(data, &s); err != nil {
		// Malformed file: treat as unpaired.
		return nil
	}
	if s.Token != "" {
		m.token = s.Token
		m.pairedOrigins = s.AllowedOrigins
		m.clientName = s.ClientName
	}
	return nil
}

// save writes current state to pairing.json with 0600 permissions.
// Must be called with m.mu held.
func (m *Manager) save() error {
	if err := os.MkdirAll(m.configDir, 0700); err != nil {
		return err
	}
	s := persistedState{
		Token:          m.token,
		AllowedOrigins: m.pairedOrigins,
		ClientName:     m.clientName,
	}
	data, err := json.Marshal(s)
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(m.configDir, "pairing.json"), data, 0600)
}

// generateToken returns a cryptographically random 256-bit token encoded as
// lowercase hex (64 characters).
func generateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
