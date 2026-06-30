package server

import (
	"path/filepath"
	"testing"
)

// TestOpenCommand tests the pure openCommand builder for every OS × open/reveal
// combination. These tests run on any platform (no exec side-effects).

func TestOpenCommand_Linux_Open(t *testing.T) {
	name, args := openCommand("linux", "/home/user/file.txt", false)
	if name != "xdg-open" {
		t.Errorf("name: got %q, want %q", name, "xdg-open")
	}
	if len(args) != 1 || args[0] != "/home/user/file.txt" {
		t.Errorf("args: got %v, want [/home/user/file.txt]", args)
	}
}

func TestOpenCommand_Linux_Reveal(t *testing.T) {
	path := "/home/user/docs/file.txt"
	name, args := openCommand("linux", path, true)
	if name != "xdg-open" {
		t.Errorf("name: got %q, want %q", name, "xdg-open")
	}
	want := filepath.Dir(path)
	if len(args) != 1 || args[0] != want {
		t.Errorf("args: got %v, want [%s]", args, want)
	}
}

func TestOpenCommand_Windows_Open(t *testing.T) {
	path := `C:\Users\user\Documents\file.txt`
	name, args := openCommand("windows", path, false)
	if name != "cmd" {
		t.Errorf("name: got %q, want %q", name, "cmd")
	}
	// Expect: cmd /c start "" <path>
	if len(args) != 4 {
		t.Fatalf("args length: got %d, want 4; args=%v", len(args), args)
	}
	if args[0] != "/c" || args[1] != "start" || args[2] != "" || args[3] != path {
		t.Errorf("args: got %v, want [/c start \"\" %s]", args, path)
	}
}

func TestOpenCommand_Windows_Reveal(t *testing.T) {
	path := `C:\Users\user\Documents\file.txt`
	name, args := openCommand("windows", path, true)
	if name != "explorer" {
		t.Errorf("name: got %q, want %q", name, "explorer")
	}
	// Expect: explorer /select,<path>
	want := "/select," + path
	if len(args) != 1 || args[0] != want {
		t.Errorf("args: got %v, want [%s]", args, want)
	}
}

func TestOpenCommand_Darwin_Open(t *testing.T) {
	path := "/Users/user/Documents/file.txt"
	name, args := openCommand("darwin", path, false)
	if name != "open" {
		t.Errorf("name: got %q, want %q", name, "open")
	}
	if len(args) != 1 || args[0] != path {
		t.Errorf("args: got %v, want [%s]", args, path)
	}
}

func TestOpenCommand_Darwin_Reveal(t *testing.T) {
	path := "/Users/user/Documents/file.txt"
	name, args := openCommand("darwin", path, true)
	if name != "open" {
		t.Errorf("name: got %q, want %q", name, "open")
	}
	// Expect: open -R <path>
	if len(args) != 2 || args[0] != "-R" || args[1] != path {
		t.Errorf("args: got %v, want [-R %s]", args, path)
	}
}

func TestOpenCommand_Unknown_Open(t *testing.T) {
	// Unknown OS falls through to the linux/xdg-open default.
	name, args := openCommand("freebsd", "/home/user/file.txt", false)
	if name != "xdg-open" {
		t.Errorf("name: got %q, want %q (unknown OS should use xdg-open)", name, "xdg-open")
	}
	if len(args) != 1 || args[0] != "/home/user/file.txt" {
		t.Errorf("args: got %v", args)
	}
}

func TestOpenCommand_Unknown_Reveal(t *testing.T) {
	path := "/home/user/file.txt"
	name, args := openCommand("freebsd", path, true)
	if name != "xdg-open" {
		t.Errorf("name: got %q, want %q (unknown OS should use xdg-open)", name, "xdg-open")
	}
	want := filepath.Dir(path)
	if len(args) != 1 || args[0] != want {
		t.Errorf("args: got %v, want [%s]", args, want)
	}
}
