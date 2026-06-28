package index_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/index"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/protocol"
)

func TestNormalize_MissingPath(t *testing.T) {
	_, err := index.Normalize("/nonexistent/path/that/does/not/exist.txt")
	if err == nil {
		t.Error("expected error for missing path, got nil")
	}
}

func TestNormalize_RegularFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "report.pdf")
	if err := os.WriteFile(path, []byte("hello pdf"), 0o644); err != nil {
		t.Fatalf("create test file: %v", err)
	}

	r, err := index.Normalize(path)
	if err != nil {
		t.Fatalf("Normalize: %v", err)
	}

	if r.Name != "report.pdf" {
		t.Errorf("Name: got %q, want %q", r.Name, "report.pdf")
	}
	if r.Dir != dir {
		t.Errorf("Dir: got %q, want %q", r.Dir, dir)
	}
	if r.Ext != "pdf" {
		t.Errorf("Ext: got %q, want %q", r.Ext, "pdf")
	}
	if r.Type != protocol.FileTypeDocument {
		t.Errorf("Type: got %q, want %q", r.Type, protocol.FileTypeDocument)
	}
	if r.Size != 9 {
		t.Errorf("Size: got %d, want 9", r.Size)
	}
	if r.ModifiedAt == 0 {
		t.Error("ModifiedAt should be non-zero for a real file")
	}
	if r.ID != path {
		t.Errorf("ID: got %q, want %q", r.ID, path)
	}
	if r.Path != path {
		t.Errorf("Path: got %q, want %q", r.Path, path)
	}
	// Mime should be non-empty for a known extension.
	if r.Mime == "" {
		t.Error("Mime should be non-empty for .pdf")
	}
	// CreatedAt is always 0 (birth-time not available cross-platform).
	if r.CreatedAt != 0 {
		t.Errorf("CreatedAt: got %d, want 0", r.CreatedAt)
	}
}

func TestNormalize_UpperCaseExt(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "PHOTO.PNG")
	if err := os.WriteFile(path, []byte("png data"), 0o644); err != nil {
		t.Fatalf("create test file: %v", err)
	}

	r, err := index.Normalize(path)
	if err != nil {
		t.Fatalf("Normalize: %v", err)
	}
	if r.Ext != "png" {
		t.Errorf("Ext: got %q, want %q (ext should be lowercased)", r.Ext, "png")
	}
	if r.Type != protocol.FileTypeImage {
		t.Errorf("Type: got %q, want %q", r.Type, protocol.FileTypeImage)
	}
}

func TestNormalize_Directory(t *testing.T) {
	dir := t.TempDir()
	subdir := filepath.Join(dir, "mydir")
	if err := os.Mkdir(subdir, 0o755); err != nil {
		t.Fatalf("create dir: %v", err)
	}

	r, err := index.Normalize(subdir)
	if err != nil {
		t.Fatalf("Normalize: %v", err)
	}
	if r.Type != protocol.FileTypeFolder {
		t.Errorf("Type: got %q, want %q", r.Type, protocol.FileTypeFolder)
	}
	if r.Size != 0 {
		t.Errorf("Size: got %d, want 0 for directory", r.Size)
	}
	if r.Ext != "" {
		t.Errorf("Ext: got %q, want empty for directory", r.Ext)
	}
	if r.Mime != "" {
		t.Errorf("Mime: got %q, want empty for directory", r.Mime)
	}
}

func TestNormalize_NoExtension(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "Makefile")
	if err := os.WriteFile(path, []byte("all:"), 0o644); err != nil {
		t.Fatalf("create test file: %v", err)
	}

	r, err := index.Normalize(path)
	if err != nil {
		t.Fatalf("Normalize: %v", err)
	}
	if r.Ext != "" {
		t.Errorf("Ext: got %q, want empty for no-extension file", r.Ext)
	}
	if r.Type != protocol.FileTypeOther {
		t.Errorf("Type: got %q, want %q", r.Type, protocol.FileTypeOther)
	}
	// Mime should be empty for unknown extension.
	if r.Mime != "" {
		t.Errorf("Mime: got %q, want empty for unknown extension", r.Mime)
	}
}
