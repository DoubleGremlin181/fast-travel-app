package autostart_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/autostart"
)

const desktopFilename = "fast-travel-companion.desktop"

// TestInstall_WritesFile verifies Install creates the .desktop file containing
// the exec path.
func TestInstall_WritesFile(t *testing.T) {
	dir := t.TempDir()
	execPath := "/usr/local/bin/fast-travel-companion"

	if err := autostart.Install(dir, execPath); err != nil {
		t.Fatalf("Install: %v", err)
	}

	path := filepath.Join(dir, desktopFilename)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	content := string(data)

	if !strings.Contains(content, "[Desktop Entry]") {
		t.Error("missing [Desktop Entry] header")
	}
	if !strings.Contains(content, "Exec="+execPath) {
		t.Errorf("missing Exec line with %q", execPath)
	}
	if !strings.Contains(content, "Type=Application") {
		t.Error("missing Type=Application")
	}
	if !strings.Contains(content, "Name=Fast Travel Companion") {
		t.Error("missing Name=Fast Travel Companion")
	}
	if !strings.Contains(content, "NoDisplay=true") {
		t.Error("missing NoDisplay=true")
	}
	if !strings.Contains(content, "Terminal=false") {
		t.Error("missing Terminal=false")
	}
	if !strings.Contains(content, "X-GNOME-Autostart-enabled=true") {
		t.Error("missing X-GNOME-Autostart-enabled=true")
	}
}

// TestInstall_FilePermissions checks that the .desktop file is 0644.
func TestInstall_FilePermissions(t *testing.T) {
	dir := t.TempDir()
	if err := autostart.Install(dir, "/bin/ftc"); err != nil {
		t.Fatalf("Install: %v", err)
	}
	info, err := os.Stat(filepath.Join(dir, desktopFilename))
	if err != nil {
		t.Fatalf("Stat: %v", err)
	}
	got := info.Mode().Perm()
	if got != 0644 {
		t.Errorf("file permissions: got %o, want 0644", got)
	}
}

// TestInstall_Idempotent verifies that calling Install twice does not error
// and the file still reflects the latest exec path.
func TestInstall_Idempotent(t *testing.T) {
	dir := t.TempDir()
	first := "/usr/bin/ftc-old"
	second := "/usr/bin/ftc-new"

	if err := autostart.Install(dir, first); err != nil {
		t.Fatalf("first Install: %v", err)
	}
	if err := autostart.Install(dir, second); err != nil {
		t.Fatalf("second Install: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(dir, desktopFilename))
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if !strings.Contains(string(data), "Exec="+second) {
		t.Errorf("expected Exec=%q after second Install; got:\n%s", second, data)
	}
}

// TestIsInstalled_TrueAfterInstall verifies IsInstalled returns true after Install.
func TestIsInstalled_TrueAfterInstall(t *testing.T) {
	dir := t.TempDir()
	if autostart.IsInstalled(dir) {
		t.Fatal("IsInstalled: expected false before Install")
	}
	if err := autostart.Install(dir, "/bin/ftc"); err != nil {
		t.Fatalf("Install: %v", err)
	}
	if !autostart.IsInstalled(dir) {
		t.Error("IsInstalled: expected true after Install")
	}
}

// TestUninstall_RemovesFile verifies Uninstall removes the .desktop file.
func TestUninstall_RemovesFile(t *testing.T) {
	dir := t.TempDir()
	if err := autostart.Install(dir, "/bin/ftc"); err != nil {
		t.Fatalf("Install: %v", err)
	}
	if err := autostart.Uninstall(dir); err != nil {
		t.Fatalf("Uninstall: %v", err)
	}
	if autostart.IsInstalled(dir) {
		t.Error("IsInstalled: expected false after Uninstall")
	}
}

// TestUninstall_NotInstalled verifies Uninstall is a no-op (no error) when
// the file does not exist.
func TestUninstall_NotInstalled(t *testing.T) {
	dir := t.TempDir()
	if err := autostart.Uninstall(dir); err != nil {
		t.Fatalf("Uninstall on missing file: unexpected error: %v", err)
	}
}
