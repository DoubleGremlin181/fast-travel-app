package config_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/config"
)

// TestLoad_MissingFile returns zero Config + nil error when the file is absent.
func TestLoad_MissingFile(t *testing.T) {
	dir := t.TempDir()
	cfg, err := config.Load(dir)
	if err != nil {
		t.Fatalf("Load on missing file: unexpected error: %v", err)
	}
	// Zero value — no port, no indexer, no origins.
	if cfg.Port != 0 {
		t.Errorf("Port: got %d, want 0", cfg.Port)
	}
	if cfg.PreferredIndexer != "" {
		t.Errorf("PreferredIndexer: got %q, want empty", cfg.PreferredIndexer)
	}
	if len(cfg.AllowedOrigins) != 0 {
		t.Errorf("AllowedOrigins: got %v, want nil/empty", cfg.AllowedOrigins)
	}
}

// TestLoad_Malformed returns an error for invalid JSON.
func TestLoad_Malformed(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "companion.json")
	if err := os.WriteFile(path, []byte("{not-valid-json"), 0600); err != nil {
		t.Fatal(err)
	}
	_, err := config.Load(dir)
	if err == nil {
		t.Fatal("Load on malformed JSON: expected error, got nil")
	}
}

// TestLoad_RoundTrip saves a Config, loads it back, and verifies all fields.
func TestLoad_RoundTrip(t *testing.T) {
	dir := t.TempDir()
	original := config.Config{
		Port:             8080,
		PreferredIndexer: "plocate",
		AllowedOrigins:   []string{"chrome-extension://abc", "moz-extension://xyz"},
	}
	if err := config.Save(dir, original); err != nil {
		t.Fatalf("Save: %v", err)
	}
	loaded, err := config.Load(dir)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if loaded.Port != original.Port {
		t.Errorf("Port: got %d, want %d", loaded.Port, original.Port)
	}
	if loaded.PreferredIndexer != original.PreferredIndexer {
		t.Errorf("PreferredIndexer: got %q, want %q", loaded.PreferredIndexer, original.PreferredIndexer)
	}
	if len(loaded.AllowedOrigins) != len(original.AllowedOrigins) {
		t.Errorf("AllowedOrigins length: got %d, want %d", len(loaded.AllowedOrigins), len(original.AllowedOrigins))
	} else {
		for i, o := range original.AllowedOrigins {
			if loaded.AllowedOrigins[i] != o {
				t.Errorf("AllowedOrigins[%d]: got %q, want %q", i, loaded.AllowedOrigins[i], o)
			}
		}
	}
}

// TestWithDefaults_Port applies the default port when Port is zero.
func TestWithDefaults_Port(t *testing.T) {
	cfg := config.Config{}.WithDefaults()
	if cfg.Port != 7333 {
		t.Errorf("WithDefaults Port: got %d, want 7333", cfg.Port)
	}
}

// TestWithDefaults_PortPreserved does not override a non-zero port.
func TestWithDefaults_PortPreserved(t *testing.T) {
	cfg := config.Config{Port: 9090}.WithDefaults()
	if cfg.Port != 9090 {
		t.Errorf("WithDefaults Port preserved: got %d, want 9090", cfg.Port)
	}
}

// TestSave_FilePermissions verifies 0600 file permissions.
func TestSave_FilePermissions(t *testing.T) {
	dir := t.TempDir()
	if err := config.Save(dir, config.Config{Port: 7333}); err != nil {
		t.Fatalf("Save: %v", err)
	}
	info, err := os.Stat(filepath.Join(dir, "companion.json"))
	if err != nil {
		t.Fatalf("Stat: %v", err)
	}
	got := info.Mode().Perm()
	if got != 0600 {
		t.Errorf("file permissions: got %o, want 0600", got)
	}
}

// TestSave_DirPermissions verifies that Save creates the config directory with
// mode 0700 when it does not already exist.
func TestSave_DirPermissions(t *testing.T) {
	// Use a non-existent subdir so MkdirAll must create it.
	dir := filepath.Join(t.TempDir(), "new-config-subdir")
	if err := config.Save(dir, config.Config{Port: 7333}); err != nil {
		t.Fatalf("Save: %v", err)
	}
	info, err := os.Stat(dir)
	if err != nil {
		t.Fatalf("Stat dir: %v", err)
	}
	got := info.Mode().Perm()
	if got != 0700 {
		t.Errorf("dir permissions: got %o, want 0700", got)
	}
}

// TestSave_ValidJSON verifies the written file is valid JSON.
func TestSave_ValidJSON(t *testing.T) {
	dir := t.TempDir()
	if err := config.Save(dir, config.Config{Port: 7333, PreferredIndexer: "baloo"}); err != nil {
		t.Fatalf("Save: %v", err)
	}
	data, err := os.ReadFile(filepath.Join(dir, "companion.json"))
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	var m map[string]any
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatalf("Unmarshal: %v (raw: %s)", err, data)
	}
}
