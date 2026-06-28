package query_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"testing"

	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/query"
)

// fixtureFile locates query-parsing.json relative to this test file's directory.
func fixtureFile(t *testing.T) string {
	t.Helper()
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	// thisFile: .../companion/internal/query/parse_test.go
	// fixture: .../shared/companion-protocol/fixtures/query-parsing.json
	root := filepath.Join(filepath.Dir(thisFile), "..", "..", "..", "shared", "companion-protocol", "fixtures", "query-parsing.json")
	abs, err := filepath.Abs(root)
	if err != nil {
		t.Fatalf("filepath.Abs: %v", err)
	}
	return abs
}

type fixtureFile_ struct {
	Cases []fixtureCase `json:"cases"`
}

type fixtureCase struct {
	Name      string          `json:"name"`
	Query     string          `json:"query"`
	QueryMode string          `json:"queryMode"`
	AST       json.RawMessage `json:"ast"`
}

func TestParse_Fixtures(t *testing.T) {
	path := fixtureFile(t)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}

	var f fixtureFile_
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatalf("unmarshal fixture: %v", err)
	}

	if len(f.Cases) == 0 {
		t.Fatal("fixture has no cases")
	}

	for _, c := range f.Cases {
		c := c // capture
		t.Run(c.Name, func(t *testing.T) {
			var want query.Node
			if err := json.Unmarshal(c.AST, &want); err != nil {
				t.Fatalf("unmarshal expected AST: %v", err)
			}

			got, err := query.Parse(c.Query, query.Mode(c.QueryMode))
			if err != nil {
				t.Fatalf("Parse(%q, %q) error: %v", c.Query, c.QueryMode, err)
			}

			if !reflect.DeepEqual(got, want) {
				gotJSON, _ := json.MarshalIndent(got, "", "  ")
				wantJSON, _ := json.MarshalIndent(want, "", "  ")
				t.Errorf("Parse(%q, %q) mismatch:\ngot:\n%s\nwant:\n%s",
					c.Query, c.QueryMode, gotJSON, wantJSON)
			}
		})
	}
}
