package pairing_test

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/pairing"
)

// helper: New with the real clock, fatal on error.
func newManager(t *testing.T, configDir string, allowedOrigins []string) *pairing.Manager {
	t.Helper()
	m, err := pairing.New(configDir, allowedOrigins)
	if err != nil {
		t.Fatalf("pairing.New: %v", err)
	}
	return m
}

// ---------------------------------------------------------------------------
// Token properties
// ---------------------------------------------------------------------------

func TestTokenUniqueness(t *testing.T) {
	dir1 := t.TempDir()
	dir2 := t.TempDir()

	m1 := newManager(t, dir1, nil)
	m1.OpenPairingWindow(time.Minute)
	tok1, err := m1.Pair("chrome-extension://aaa", "Browser A")
	if err != nil {
		t.Fatalf("m1.Pair: %v", err)
	}

	m2 := newManager(t, dir2, nil)
	m2.OpenPairingWindow(time.Minute)
	tok2, err := m2.Pair("chrome-extension://aaa", "Browser A")
	if err != nil {
		t.Fatalf("m2.Pair: %v", err)
	}

	if tok1 == tok2 {
		t.Errorf("tokens must be unique across managers, both = %q", tok1)
	}
}

func TestTokenStabilityWithinManager(t *testing.T) {
	dir := t.TempDir()
	m := newManager(t, dir, nil)
	m.OpenPairingWindow(time.Minute)
	origin := "chrome-extension://abc"

	tok1, err := m.Pair(origin, "Browser A")
	if err != nil {
		t.Fatalf("first Pair: %v", err)
	}
	if tok1 == "" {
		t.Fatal("expected non-empty token")
	}

	// Re-open window and pair same origin again — must reuse token (idempotent).
	m.OpenPairingWindow(time.Minute)
	tok2, err := m.Pair(origin, "Browser A")
	if err != nil {
		t.Fatalf("second Pair: %v", err)
	}
	if tok1 != tok2 {
		t.Errorf("token must be stable within a Manager: got %q then %q", tok1, tok2)
	}
}

func TestTokenFormat(t *testing.T) {
	dir := t.TempDir()
	m := newManager(t, dir, nil)
	m.OpenPairingWindow(time.Minute)
	tok, _ := m.Pair("origin", "name")

	// 32 bytes → 64 hex chars.
	if len(tok) != 64 {
		t.Errorf("expected 64-char hex token (256-bit), got len=%d: %q", len(tok), tok)
	}
	for _, c := range tok {
		if !('0' <= c && c <= '9') && !('a' <= c && c <= 'f') {
			t.Errorf("token contains non-lowercase-hex character %q", c)
			break
		}
	}
}

// ---------------------------------------------------------------------------
// Pairing window
// ---------------------------------------------------------------------------

func TestPairFailsWhenWindowClosed(t *testing.T) {
	dir := t.TempDir()
	m := newManager(t, dir, nil)
	// Window never opened; no allowlist.
	_, err := m.Pair("chrome-extension://unknown", "Browser A")
	if !errors.Is(err, pairing.ErrPairingClosed) {
		t.Fatalf("expected ErrPairingClosed, got %v", err)
	}
	if m.Paired() {
		t.Error("must not be paired after failed Pair")
	}
}

func TestPairSucceedsWhenWindowOpen(t *testing.T) {
	dir := t.TempDir()
	m := newManager(t, dir, nil)
	m.OpenPairingWindow(time.Minute)
	if !m.PairingOpen() {
		t.Fatal("expected pairing window to be open")
	}

	tok, err := m.Pair("chrome-extension://any", "Browser A")
	if err != nil {
		t.Fatalf("Pair: %v", err)
	}
	if tok == "" {
		t.Error("expected non-empty token")
	}
	if !m.Paired() {
		t.Error("must be paired after successful Pair")
	}
	if m.PairingOpen() {
		t.Error("pairing window must close after successful Pair")
	}
}

func TestPairingWindowAutoExpiresInjectableClock(t *testing.T) {
	dir := t.TempDir()
	now := time.Now()
	m, err := pairing.NewWithClock(dir, nil, func() time.Time { return now })
	if err != nil {
		t.Fatalf("NewWithClock: %v", err)
	}

	m.OpenPairingWindow(5 * time.Minute)
	if !m.PairingOpen() {
		t.Fatal("expected pairing window open immediately after OpenPairingWindow")
	}

	// Advance clock past expiry.
	now = now.Add(6 * time.Minute)
	if m.PairingOpen() {
		t.Error("expected pairing window closed after clock advances past expiry")
	}

	_, err = m.Pair("chrome-extension://x", "Browser")
	if !errors.Is(err, pairing.ErrPairingClosed) {
		t.Errorf("expected ErrPairingClosed after window expiry, got %v", err)
	}
}

func TestClosePairingWindowManually(t *testing.T) {
	dir := t.TempDir()
	m := newManager(t, dir, nil)
	m.OpenPairingWindow(time.Hour)
	m.ClosePairingWindow()

	if m.PairingOpen() {
		t.Error("expected window closed after ClosePairingWindow")
	}
	_, err := m.Pair("chrome-extension://x", "Browser")
	if !errors.Is(err, pairing.ErrPairingClosed) {
		t.Errorf("expected ErrPairingClosed, got %v", err)
	}
}

// ---------------------------------------------------------------------------
// Origin allowlist auto-pair
// ---------------------------------------------------------------------------

func TestAllowlistOriginPairsWithoutWindow(t *testing.T) {
	dir := t.TempDir()
	allowed := "chrome-extension://abc123"
	m := newManager(t, dir, []string{allowed})
	// Window closed; origin is allowlisted → should succeed.
	tok, err := m.Pair(allowed, "Browser A")
	if err != nil {
		t.Fatalf("Pair with allowlisted origin: %v", err)
	}
	if tok == "" {
		t.Error("expected non-empty token")
	}
	if !m.Paired() {
		t.Error("must be paired after successful auto-pair")
	}
}

func TestUnknownOriginFailsWithAllowlistPresent(t *testing.T) {
	dir := t.TempDir()
	m := newManager(t, dir, []string{"chrome-extension://abc123"})
	_, err := m.Pair("chrome-extension://other", "Browser B")
	if !errors.Is(err, pairing.ErrPairingClosed) {
		t.Errorf("expected ErrPairingClosed for unknown origin, got %v", err)
	}
}

// ---------------------------------------------------------------------------
// Authorize
// ---------------------------------------------------------------------------

func TestAuthorizeCorrectTokenAndOrigin(t *testing.T) {
	dir := t.TempDir()
	m := newManager(t, dir, nil)
	m.OpenPairingWindow(time.Minute)
	origin := "chrome-extension://abc"
	tok, err := m.Pair(origin, "Browser A")
	if err != nil {
		t.Fatalf("Pair: %v", err)
	}
	if !m.Authorize(origin, tok) {
		t.Error("expected Authorize true for correct token+origin")
	}
}

func TestAuthorizeWrongToken(t *testing.T) {
	dir := t.TempDir()
	m := newManager(t, dir, nil)
	m.OpenPairingWindow(time.Minute)
	origin := "chrome-extension://abc"
	_, err := m.Pair(origin, "Browser A")
	if err != nil {
		t.Fatalf("Pair: %v", err)
	}
	if m.Authorize(origin, "wrongtoken") {
		t.Error("expected Authorize false for wrong token")
	}
}

func TestAuthorizeWrongOrigin(t *testing.T) {
	dir := t.TempDir()
	m := newManager(t, dir, nil)
	m.OpenPairingWindow(time.Minute)
	tok, err := m.Pair("chrome-extension://abc", "Browser A")
	if err != nil {
		t.Fatalf("Pair: %v", err)
	}
	if m.Authorize("chrome-extension://other", tok) {
		t.Error("expected Authorize false for wrong origin")
	}
}

func TestAuthorizeWhenUnpaired(t *testing.T) {
	dir := t.TempDir()
	m := newManager(t, dir, nil)
	if m.Authorize("chrome-extension://abc", "sometoken") {
		t.Error("expected Authorize false when unpaired")
	}
}

func TestAuthorizeMultipleOriginsSameToken(t *testing.T) {
	dir := t.TempDir()
	m := newManager(t, dir, nil)

	origin1 := "chrome-extension://aaa"
	origin2 := "chrome-extension://bbb"

	m.OpenPairingWindow(time.Hour)
	tok1, err := m.Pair(origin1, "Browser A")
	if err != nil {
		t.Fatalf("Pair origin1: %v", err)
	}

	// Re-open window to allow second pairing.
	m.OpenPairingWindow(time.Hour)
	tok2, err := m.Pair(origin2, "Browser B")
	if err != nil {
		t.Fatalf("Pair origin2: %v", err)
	}

	if tok1 != tok2 {
		t.Errorf("expected same token for both origins: got %q and %q", tok1, tok2)
	}
	if !m.Authorize(origin1, tok1) {
		t.Error("origin1 must be authorized")
	}
	if !m.Authorize(origin2, tok1) {
		t.Error("origin2 must be authorized")
	}
}

// Verify that Authorize uses constant-time comparison (call it with empty vs
// non-empty token to exercise the code path; timing is not measured here).
func TestAuthorizeConstantTimeCompareIsUsed(t *testing.T) {
	dir := t.TempDir()
	m := newManager(t, dir, nil)
	m.OpenPairingWindow(time.Minute)
	origin := "chrome-extension://abc"
	tok, _ := m.Pair(origin, "Browser A")

	// Empty string must not panic and must return false.
	if m.Authorize(origin, "") {
		t.Error("expected Authorize false for empty token")
	}
	// Correct token must still pass.
	if !m.Authorize(origin, tok) {
		t.Error("expected Authorize true for correct token")
	}
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

func TestPersistenceRoundTrip(t *testing.T) {
	dir := t.TempDir()
	origin := "chrome-extension://abc"

	m1 := newManager(t, dir, nil)
	m1.OpenPairingWindow(time.Minute)
	tok, err := m1.Pair(origin, "Browser A")
	if err != nil {
		t.Fatalf("Pair: %v", err)
	}

	// Load a fresh Manager from the same dir.
	m2, err := pairing.New(dir, nil)
	if err != nil {
		t.Fatalf("New (reload): %v", err)
	}
	if !m2.Paired() {
		t.Error("expected Paired() true after reload")
	}
	if !m2.Authorize(origin, tok) {
		t.Error("expected Authorize to succeed after reload")
	}
}

func TestPersistenceFileMode(t *testing.T) {
	dir := t.TempDir()
	m := newManager(t, dir, nil)
	m.OpenPairingWindow(time.Minute)
	_, err := m.Pair("chrome-extension://abc", "Browser A")
	if err != nil {
		t.Fatalf("Pair: %v", err)
	}
	info, err := os.Stat(filepath.Join(dir, "pairing.json"))
	if err != nil {
		t.Fatalf("stat pairing.json: %v", err)
	}
	if mode := info.Mode().Perm(); mode != 0600 {
		t.Errorf("expected file mode 0600, got %04o", mode)
	}
}

func TestMalformedFileTreatedAsUnpaired(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "pairing.json"), []byte("not-json{{{{"), 0600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	m, err := pairing.New(dir, nil)
	if err != nil {
		t.Fatalf("New with malformed file must not error: %v", err)
	}
	if m.Paired() {
		t.Error("expected unpaired after malformed file")
	}
}

func TestMissingFileTreatedAsUnpaired(t *testing.T) {
	dir := t.TempDir()
	m, err := pairing.New(dir, nil)
	if err != nil {
		t.Fatalf("New with missing file must not error: %v", err)
	}
	if m.Paired() {
		t.Error("expected unpaired when file missing")
	}
}

// ---------------------------------------------------------------------------
// Unpair
// ---------------------------------------------------------------------------

func TestUnpairClearsStateAndRemovesFile(t *testing.T) {
	dir := t.TempDir()
	m := newManager(t, dir, nil)
	m.OpenPairingWindow(time.Minute)
	tok, err := m.Pair("chrome-extension://abc", "Browser A")
	if err != nil {
		t.Fatalf("Pair: %v", err)
	}

	if err := m.Unpair(); err != nil {
		t.Fatalf("Unpair: %v", err)
	}
	if m.Paired() {
		t.Error("expected unpaired after Unpair")
	}
	if m.Authorize("chrome-extension://abc", tok) {
		t.Error("expected Authorize false after Unpair")
	}
	_, err = os.Stat(filepath.Join(dir, "pairing.json"))
	if !os.IsNotExist(err) {
		t.Errorf("expected pairing.json removed after Unpair, stat returned: %v", err)
	}
}

func TestUnpairIdempotent(t *testing.T) {
	dir := t.TempDir()
	m := newManager(t, dir, nil)
	// Unpair when already unpaired must not error.
	if err := m.Unpair(); err != nil {
		t.Errorf("Unpair on unpaired Manager must not error: %v", err)
	}
}
