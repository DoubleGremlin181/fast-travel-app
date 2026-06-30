// Tests are in package autostart (not autostart_test) so they can exercise
// the unexported installLinux / uninstallLinux / isInstalledLinux helpers
// and the pure builders (buildRegAddArgs, buildLaunchAgentPlist, etc.) that
// are testable on any platform without spawning real processes.
package autostart

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// Linux installLinux / isInstalledLinux / uninstallLinux (via t.TempDir)
// ---------------------------------------------------------------------------

// TestInstallLinux_WritesFile verifies installLinux creates the .desktop file
// containing the exec path and all required fields.
func TestInstallLinux_WritesFile(t *testing.T) {
	dir := t.TempDir()
	execPath := "/usr/local/bin/fast-travel-companion"

	if err := installLinux(dir, execPath); err != nil {
		t.Fatalf("installLinux: %v", err)
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

// TestInstallLinux_FilePermissions checks that the .desktop file is 0644.
func TestInstallLinux_FilePermissions(t *testing.T) {
	dir := t.TempDir()
	if err := installLinux(dir, "/bin/ftc"); err != nil {
		t.Fatalf("installLinux: %v", err)
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

// TestInstallLinux_DirPermissions verifies that installLinux creates
// autostartDir with mode 0700 when it does not already exist.
func TestInstallLinux_DirPermissions(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "new-autostart-subdir")
	if err := installLinux(dir, "/usr/local/bin/fast-travel-companion"); err != nil {
		t.Fatalf("installLinux: %v", err)
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

// TestInstallLinux_Idempotent verifies that calling installLinux twice does not
// error and the file reflects the latest exec path.
func TestInstallLinux_Idempotent(t *testing.T) {
	dir := t.TempDir()
	first := "/usr/bin/ftc-old"
	second := "/usr/bin/ftc-new"

	if err := installLinux(dir, first); err != nil {
		t.Fatalf("first installLinux: %v", err)
	}
	if err := installLinux(dir, second); err != nil {
		t.Fatalf("second installLinux: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(dir, desktopFilename))
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if !strings.Contains(string(data), "Exec="+second) {
		t.Errorf("expected Exec=%q after second installLinux; got:\n%s", second, data)
	}
}

// TestIsInstalledLinux_TrueAfterInstall verifies isInstalledLinux returns true
// after installLinux and false before.
func TestIsInstalledLinux_TrueAfterInstall(t *testing.T) {
	dir := t.TempDir()
	if isInstalledLinux(dir) {
		t.Fatal("isInstalledLinux: expected false before installLinux")
	}
	if err := installLinux(dir, "/bin/ftc"); err != nil {
		t.Fatalf("installLinux: %v", err)
	}
	if !isInstalledLinux(dir) {
		t.Error("isInstalledLinux: expected true after installLinux")
	}
}

// TestUninstallLinux_RemovesFile verifies uninstallLinux removes the .desktop file.
func TestUninstallLinux_RemovesFile(t *testing.T) {
	dir := t.TempDir()
	if err := installLinux(dir, "/bin/ftc"); err != nil {
		t.Fatalf("installLinux: %v", err)
	}
	if err := uninstallLinux(dir); err != nil {
		t.Fatalf("uninstallLinux: %v", err)
	}
	if isInstalledLinux(dir) {
		t.Error("isInstalledLinux: expected false after uninstallLinux")
	}
}

// TestUninstallLinux_NotInstalled verifies uninstallLinux is a no-op (no error)
// when the file does not exist.
func TestUninstallLinux_NotInstalled(t *testing.T) {
	dir := t.TempDir()
	if err := uninstallLinux(dir); err != nil {
		t.Fatalf("uninstallLinux on missing file: unexpected error: %v", err)
	}
}

// ---------------------------------------------------------------------------
// Windows registry pure builders
// ---------------------------------------------------------------------------

func TestBuildRegAddArgs(t *testing.T) {
	execPath := `C:\Program Files\FastTravel\fast-travel-companion.exe`
	args := buildRegAddArgs(execPath)

	// Must start with "add" and reference the Run key.
	if len(args) == 0 || args[0] != "add" {
		t.Errorf("first arg: got %v, want \"add\"", args)
	}
	if !containsStr(args, regKeyPath) {
		t.Errorf("args missing Run key path %q; got %v", regKeyPath, args)
	}
	if !containsStr(args, regValueName) {
		t.Errorf("args missing value name %q; got %v", regValueName, args)
	}
	if !containsStr(args, "REG_SZ") {
		t.Errorf("args missing REG_SZ; got %v", args)
	}
	if !containsStr(args, execPath) {
		t.Errorf("args missing execPath %q; got %v", execPath, args)
	}
	if !containsStr(args, "/f") {
		t.Errorf("args missing /f (force flag); got %v", args)
	}
}

func TestBuildRegQueryArgs(t *testing.T) {
	args := buildRegQueryArgs()

	if len(args) == 0 || args[0] != "query" {
		t.Errorf("first arg: got %v, want \"query\"", args)
	}
	if !containsStr(args, regKeyPath) {
		t.Errorf("args missing Run key path %q; got %v", regKeyPath, args)
	}
	if !containsStr(args, regValueName) {
		t.Errorf("args missing value name %q; got %v", regValueName, args)
	}
}

func TestBuildRegDeleteArgs(t *testing.T) {
	args := buildRegDeleteArgs()

	if len(args) == 0 || args[0] != "delete" {
		t.Errorf("first arg: got %v, want \"delete\"", args)
	}
	if !containsStr(args, regKeyPath) {
		t.Errorf("args missing Run key path %q; got %v", regKeyPath, args)
	}
	if !containsStr(args, regValueName) {
		t.Errorf("args missing value name %q; got %v", regValueName, args)
	}
	if !containsStr(args, "/f") {
		t.Errorf("args missing /f (force flag); got %v", args)
	}
}

// ---------------------------------------------------------------------------
// macOS LaunchAgent plist pure builder
// ---------------------------------------------------------------------------

func TestBuildLaunchAgentPlist(t *testing.T) {
	execPath := "/usr/local/bin/fast-travel-companion"
	plist := buildLaunchAgentPlist(execPath)

	if !strings.Contains(plist, "RunAtLoad") {
		t.Error("plist missing RunAtLoad key")
	}
	if !strings.Contains(plist, "<true/>") {
		t.Error("plist missing <true/> for RunAtLoad")
	}
	if !strings.Contains(plist, execPath) {
		t.Errorf("plist missing execPath %q", execPath)
	}
	if !strings.Contains(plist, "ProgramArguments") {
		t.Error("plist missing ProgramArguments key")
	}
	if !strings.Contains(plist, "sh.kavi.fasttravel.companion") {
		t.Error("plist missing Label / bundle ID")
	}
	if !strings.Contains(plist, "<?xml") {
		t.Error("plist missing XML declaration")
	}
}

// TestBuildLaunchAgentPlist_EmbedExecPath verifies the exec path is correctly
// embedded even when it contains path separators.
func TestBuildLaunchAgentPlist_EmbedExecPath(t *testing.T) {
	execPath := "/opt/homebrew/bin/fast-travel-companion"
	plist := buildLaunchAgentPlist(execPath)
	if !strings.Contains(plist, "<string>"+execPath+"</string>") {
		t.Errorf("plist does not embed execPath as <string> element; plist:\n%s", plist)
	}
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

func containsStr(slice []string, s string) bool {
	for _, v := range slice {
		if v == s {
			return true
		}
	}
	return false
}
