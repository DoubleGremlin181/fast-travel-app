package protocol_test

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/protocol"
)

func searchExamplesPath(t *testing.T) string {
	t.Helper()
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	// thisFile: .../companion/internal/protocol/types_test.go
	// fixture:  .../shared/companion-protocol/fixtures/search-examples.json
	root := filepath.Join(filepath.Dir(thisFile), "..", "..", "..", "shared", "companion-protocol", "fixtures", "search-examples.json")
	abs, err := filepath.Abs(root)
	if err != nil {
		t.Fatalf("filepath.Abs: %v", err)
	}
	return abs
}

type searchExample struct {
	Name     string          `json:"name"`
	Request  json.RawMessage `json:"request"`
	Response json.RawMessage `json:"response"`
}

type searchExamplesFile struct {
	Cases []searchExample `json:"cases"`
}

// TestSearchExamples_RoundTrip unmarshals each fixture case's request/response
// into the Go protocol structs using DisallowUnknownFields.  A decode error
// means the struct definitions diverge from the wire contract.
func TestSearchExamples_RoundTrip(t *testing.T) {
	data, err := os.ReadFile(searchExamplesPath(t))
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}

	var f searchExamplesFile
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatalf("unmarshal fixture file: %v", err)
	}
	if len(f.Cases) == 0 {
		t.Fatal("fixture has no cases")
	}

	for _, c := range f.Cases {
		c := c
		t.Run(c.Name, func(t *testing.T) {
			// Decode request with strict decoder.
			var req protocol.SearchRequest
			dec := json.NewDecoder(bytes.NewReader(c.Request))
			dec.DisallowUnknownFields()
			if err := dec.Decode(&req); err != nil {
				t.Errorf("decode SearchRequest: %v", err)
			}

			// Decode response with strict decoder.
			var resp protocol.SearchResponse
			dec = json.NewDecoder(bytes.NewReader(c.Response))
			dec.DisallowUnknownFields()
			if err := dec.Decode(&resp); err != nil {
				t.Errorf("decode SearchResponse: %v", err)
			}

			// Spot-check the regex/degraded case.
			if c.Name == "regex mode – degraded via plocate fallback" {
				if !resp.Degraded {
					t.Errorf("expected Degraded==true for regex/plocate case")
				}
				if resp.Indexer != "plocate" {
					t.Errorf("expected Indexer==\"plocate\", got %q", resp.Indexer)
				}
			}
		})
	}
}
