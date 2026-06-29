// Package config loads and saves the companion-local configuration file.
// The config is a small JSON document stored in the companion's config dir.
// All fields are optional; Load returns a zero Config (not an error) when
// the file is absent, and WithDefaults fills in standard defaults.
package config

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

const filename = "companion.json"

// Config is the companion-local configuration persisted to disk.
// All fields are optional; missing fields use zero values and WithDefaults
// fills in operational defaults.
type Config struct {
	// Port is the preferred loopback port. 0 means "use the default" (7333).
	Port int `json:"port,omitempty"`
	// PreferredIndexer selects a specific search backend by ID (e.g. "baloo",
	// "plocate"). Empty string means auto-detect by priority order.
	PreferredIndexer string `json:"preferredIndexer,omitempty"`
	// AllowedOrigins is a list of extension origins that may auto-pair without
	// the user opening the pairing window (e.g. "chrome-extension://<id>").
	AllowedOrigins []string `json:"allowedOrigins,omitempty"`
}

// WithDefaults returns a copy of c with operational defaults applied to any
// zero fields.
func (c Config) WithDefaults() Config {
	if c.Port == 0 {
		c.Port = 7333
	}
	return c
}

// Load reads the config file from configDir/companion.json.
// A missing file is not an error — Load returns a zero Config and nil.
// A malformed file returns a descriptive error.
func Load(configDir string) (Config, error) {
	path := filepath.Join(configDir, filename)
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return Config{}, nil
		}
		return Config{}, err
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

// Save writes c as JSON to configDir/companion.json.
// The directory is created (mode 0700) if absent.
// The file is written with mode 0600.
func Save(configDir string, c Config) error {
	if err := os.MkdirAll(configDir, 0700); err != nil {
		return err
	}
	data, err := json.Marshal(c)
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(configDir, filename), data, 0600)
}
