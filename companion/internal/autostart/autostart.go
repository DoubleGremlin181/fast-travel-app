// Package autostart installs and removes a per-OS autostart entry so the
// companion daemon starts automatically when the user logs in.
//
// Linux:   XDG autostart (~/.config/autostart/fast-travel-companion.desktop)
// Windows: HKCU Run registry key (FastTravelCompanion) via reg.exe
// macOS:   LaunchAgent plist (~/.Library/LaunchAgents/sh.kavi.fasttravel.companion.plist)
// Other:   no-op
//
// All per-OS command/content builders are pure functions testable on any
// platform. Only the Install/Uninstall/IsInstalled side-effects are
// dispatched on runtime.GOOS.
package autostart

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const (
	desktopFilename     = "fast-travel-companion.desktop"
	launchAgentFilename = "sh.kavi.fasttravel.companion.plist"
	regKeyPath          = `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
	regValueName        = "FastTravelCompanion"
)

// ---------------------------------------------------------------------------
// Linux: XDG autostart (.desktop)
// ---------------------------------------------------------------------------

// desktopContent returns the .desktop file contents for the given execPath.
func desktopContent(execPath string) string {
	return fmt.Sprintf("[Desktop Entry]\nType=Application\nName=Fast Travel Companion\nExec=%s\nX-GNOME-Autostart-enabled=true\nNoDisplay=true\nTerminal=false\n", execPath)
}

// installLinux writes the XDG autostart .desktop file into autostartDir.
// It creates the directory (mode 0700) if absent and writes the file with
// mode 0644. Calling installLinux a second time overwrites the file (idempotent).
func installLinux(autostartDir, execPath string) error {
	if err := os.MkdirAll(autostartDir, 0700); err != nil {
		return err
	}
	path := filepath.Join(autostartDir, desktopFilename)
	return os.WriteFile(path, []byte(desktopContent(execPath)), 0644)
}

// uninstallLinux removes the .desktop file from autostartDir.
// It is a no-op (returns nil) if the file does not exist.
func uninstallLinux(autostartDir string) error {
	path := filepath.Join(autostartDir, desktopFilename)
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

// isInstalledLinux reports whether the .desktop file exists in autostartDir.
func isInstalledLinux(autostartDir string) bool {
	path := filepath.Join(autostartDir, desktopFilename)
	_, err := os.Stat(path)
	return err == nil
}

// linuxAutostartDir returns the XDG autostart directory (~/.config/autostart).
func linuxAutostartDir() (string, error) {
	cfgDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(cfgDir, "autostart"), nil
}

// ---------------------------------------------------------------------------
// Windows: HKCU Run registry key (via reg.exe)
// ---------------------------------------------------------------------------

// buildRegAddArgs returns the argv slice (after "reg") to install the Run key.
func buildRegAddArgs(execPath string) []string {
	return []string{"add", regKeyPath, "/v", regValueName, "/t", "REG_SZ", "/d", execPath, "/f"}
}

// buildRegQueryArgs returns the argv slice (after "reg") to check the Run key.
func buildRegQueryArgs() []string {
	return []string{"query", regKeyPath, "/v", regValueName}
}

// buildRegDeleteArgs returns the argv slice (after "reg") to remove the Run key.
func buildRegDeleteArgs() []string {
	return []string{"delete", regKeyPath, "/v", regValueName, "/f"}
}

// ---------------------------------------------------------------------------
// macOS: LaunchAgent plist
// ---------------------------------------------------------------------------

// buildLaunchAgentPlist returns the plist XML content for a RunAtLoad LaunchAgent.
func buildLaunchAgentPlist(execPath string) string {
	return fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>sh.kavi.fasttravel.companion</string>
	<key>ProgramArguments</key>
	<array>
		<string>%s</string>
	</array>
	<key>RunAtLoad</key>
	<true/>
</dict>
</plist>
`, execPath)
}

// darwinLaunchAgentDir returns ~/Library/LaunchAgents.
func darwinLaunchAgentDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, "Library", "LaunchAgents"), nil
}

// ---------------------------------------------------------------------------
// Public API — dispatches on runtime.GOOS
// ---------------------------------------------------------------------------

// Install installs the autostart entry for the current OS using execPath as
// the command to launch on login. It is idempotent. Unknown OSes return nil.
func Install(execPath string) error {
	switch runtime.GOOS {
	case "linux":
		dir, err := linuxAutostartDir()
		if err != nil {
			return err
		}
		return installLinux(dir, execPath)
	case "windows":
		return exec.Command("reg", buildRegAddArgs(execPath)...).Run()
	case "darwin":
		dir, err := darwinLaunchAgentDir()
		if err != nil {
			return err
		}
		if err := os.MkdirAll(dir, 0700); err != nil {
			return err
		}
		path := filepath.Join(dir, launchAgentFilename)
		return os.WriteFile(path, []byte(buildLaunchAgentPlist(execPath)), 0644)
	default:
		return nil
	}
}

// Uninstall removes the autostart entry for the current OS. It is a no-op
// (returns nil) if the entry does not exist. Unknown OSes return nil.
func Uninstall() error {
	switch runtime.GOOS {
	case "linux":
		dir, err := linuxAutostartDir()
		if err != nil {
			return err
		}
		return uninstallLinux(dir)
	case "windows":
		// reg delete exits non-zero if the value doesn't exist; treat as no-op.
		exec.Command("reg", buildRegDeleteArgs()...).Run() //nolint:errcheck
		return nil
	case "darwin":
		dir, err := darwinLaunchAgentDir()
		if err != nil {
			return err
		}
		path := filepath.Join(dir, launchAgentFilename)
		if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
		return nil
	default:
		return nil
	}
}

// IsInstalled reports whether the autostart entry is present for the current OS.
// Unknown OSes return false.
func IsInstalled() bool {
	switch runtime.GOOS {
	case "linux":
		dir, err := linuxAutostartDir()
		if err != nil {
			return false
		}
		return isInstalledLinux(dir)
	case "windows":
		return exec.Command("reg", buildRegQueryArgs()...).Run() == nil
	case "darwin":
		dir, err := darwinLaunchAgentDir()
		if err != nil {
			return false
		}
		_, err = os.Stat(filepath.Join(dir, launchAgentFilename))
		return err == nil
	default:
		return false
	}
}
