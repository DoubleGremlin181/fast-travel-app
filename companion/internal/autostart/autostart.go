// Package autostart installs and removes an XDG autostart entry so the
// companion daemon starts automatically when the user logs in.
//
// The XDG autostart spec places .desktop files in ~/.config/autostart/.
// Callers should pass filepath.Join(os.UserConfigDir(), "autostart") as
// autostartDir in production; tests use t.TempDir() for isolation.
package autostart

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

const desktopFilename = "fast-travel-companion.desktop"

// desktopContent returns the .desktop file contents for the given execPath.
func desktopContent(execPath string) string {
	return fmt.Sprintf("[Desktop Entry]\nType=Application\nName=Fast Travel Companion\nExec=%s\nX-GNOME-Autostart-enabled=true\nNoDisplay=true\nTerminal=false\n", execPath)
}

// Install writes the XDG autostart .desktop file into autostartDir.
// It creates the directory (mode 0700) if absent and writes the file with
// mode 0644. Calling Install a second time overwrites the file (idempotent).
func Install(autostartDir, execPath string) error {
	if err := os.MkdirAll(autostartDir, 0700); err != nil {
		return err
	}
	path := filepath.Join(autostartDir, desktopFilename)
	return os.WriteFile(path, []byte(desktopContent(execPath)), 0644)
}

// Uninstall removes the .desktop file from autostartDir.
// It is a no-op (returns nil) if the file does not exist.
func Uninstall(autostartDir string) error {
	path := filepath.Join(autostartDir, desktopFilename)
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

// IsInstalled reports whether the .desktop file exists in autostartDir.
func IsInstalled(autostartDir string) bool {
	path := filepath.Join(autostartDir, desktopFilename)
	_, err := os.Stat(path)
	return err == nil
}
