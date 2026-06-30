package server

import (
	"os/exec"
	"path/filepath"
	"runtime"
)

// Opener opens or reveals a file using the host OS's default mechanism.
// It is injectable so tests can supply a fake without spawning real processes.
type Opener interface {
	Open(path string) error   // open the file in its default application
	Reveal(path string) error // show the file's parent directory in the file manager
}

// openCommand returns the name and args to open (reveal=false) or reveal
// (reveal=true) path on goos. It is a pure function — no side effects — so
// it can be tested on any platform.
func openCommand(goos, path string, reveal bool) (name string, args []string) {
	switch goos {
	case "windows":
		if reveal {
			// explorer /select,<path> highlights the file in Explorer.
			return "explorer", []string{"/select," + path}
		}
		// cmd /c start "" <path> opens with the default application.
		// The empty string is the window title (required by start).
		return "cmd", []string{"/c", "start", "", path}
	case "darwin":
		if reveal {
			// open -R reveals (selects) the file in Finder.
			return "open", []string{"-R", path}
		}
		return "open", []string{path}
	default: // linux and unknown OSes
		if reveal {
			// xdg-open the parent directory (closest Linux equivalent).
			return "xdg-open", []string{filepath.Dir(path)}
		}
		return "xdg-open", []string{path}
	}
}

// OSOpener is an Opener that dispatches on runtime.GOOS.
type OSOpener struct{}

var _ Opener = (*OSOpener)(nil)

// Open opens path in its default application for the current OS.
func (o *OSOpener) Open(path string) error {
	name, args := openCommand(runtime.GOOS, path, false)
	return exec.Command(name, args...).Run()
}

// Reveal shows path's location in the host file manager for the current OS.
func (o *OSOpener) Reveal(path string) error {
	name, args := openCommand(runtime.GOOS, path, true)
	return exec.Command(name, args...).Run()
}

// NewOpener returns an Opener appropriate for the current OS.
func NewOpener() Opener {
	return &OSOpener{}
}
