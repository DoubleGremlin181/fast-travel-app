package server

import (
	"os/exec"
	"path/filepath"
)

// Opener opens or reveals a file using the host OS's default mechanism.
// It is injectable so tests can supply a fake without spawning real processes.
type Opener interface {
	Open(path string) error   // open the file in its default application
	Reveal(path string) error // show the file's parent directory in the file manager
}

// XDGOpener is the Linux implementation of Opener using xdg-open.
var _ Opener = (*XDGOpener)(nil)

// XDGOpener uses xdg-open to open files and directories.
type XDGOpener struct{}

// Open opens path in its default application via xdg-open.
func (o *XDGOpener) Open(path string) error {
	return exec.Command("xdg-open", path).Run()
}

// Reveal opens the parent directory of path via xdg-open. A future revision
// may use a desktop-specific "select and highlight file" command.
func (o *XDGOpener) Reveal(path string) error {
	return exec.Command("xdg-open", filepath.Dir(path)).Run()
}
