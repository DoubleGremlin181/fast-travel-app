// Command fast-travel-companion is the companion daemon for the Fast Travel
// browser extension. It exposes a loopback HTTP server that the extension
// uses to search files on the local machine via native OS indexers (Baloo,
// Tracker, plocate). The daemon must be running before the extension can
// execute local-file searches.
//
// Version is injected at build time via ldflags:
//
//	go build -ldflags "-X main.version=1.2.3" ./cmd/fast-travel-companion
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"syscall"
	"time"

	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/autostart"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/config"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/index"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/pairing"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/protocol"
	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/server"
)

// version is set via -ldflags at build time; falls back to "dev".
var version = "dev"

func main() {
	// --- 1. Config dir ---
	userCfgDir, err := os.UserConfigDir()
	if err != nil {
		log.Fatalf("fast-travel-companion: cannot determine user config dir: %v", err)
	}
	configDir := filepath.Join(userCfgDir, "fast-travel-companion")

	// --- 2. Load config ---
	cfg, cfgErr := config.Load(configDir)
	if cfgErr != nil {
		log.Printf("fast-travel-companion: warn: could not load config (%v); using defaults", cfgErr)
	}
	cfg = cfg.WithDefaults()

	// --- 3. Detect indexers ---
	reg := index.Detect(index.ExecRunner{}, cfg.PreferredIndexer)

	// --- 4. Pairing manager ---
	pm, err := pairing.New(configDir, cfg.AllowedOrigins)
	if err != nil {
		log.Fatalf("fast-travel-companion: pairing.New: %v", err)
	}

	// --- 5. Bind loopback port ---
	ln, port, err := server.ListenLoopback(cfg.Port)
	if err != nil {
		log.Fatalf("fast-travel-companion: %v", err)
	}

	// --- 6. Build server ---
	opener := server.NewOpener()
	srv := server.New(server.Deps{
		Registry: reg,
		Pairing:  pm,
		Opener:   opener,
		Name:     "fast-travel-companion",
		Version:  version,
		OS:       protocolOS(runtime.GOOS),
		Port:     port,
	})

	// --- 7. OS autostart (best-effort) ---
	selfPath := selfExecPath()
	if selfPath == "" {
		log.Printf("fast-travel-companion: warn: could not determine executable path; skipping autostart")
	} else {
		if err := autostart.Install(selfPath); err != nil {
			log.Printf("fast-travel-companion: warn: could not install autostart entry: %v", err)
		}
	}

	// --- 8. First-run: open pairing window + setup page ---
	if !pm.Paired() {
		pm.OpenPairingWindow(5 * time.Minute)
		setupURL := fmt.Sprintf("http://127.0.0.1:%d/setup", port)
		if err := opener.Open(setupURL); err != nil {
			log.Printf("fast-travel-companion: warn: could not open setup page (%v)", err)
		}
	}

	// --- 9. Serve with graceful shutdown ---
	httpSrv := &http.Server{Handler: srv.Handler()}

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		sig := <-sigCh
		log.Printf("fast-travel-companion: received %v — shutting down", sig)
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := httpSrv.Shutdown(ctx); err != nil {
			log.Printf("fast-travel-companion: shutdown error: %v", err)
		}
	}()

	log.Printf("fast-travel-companion v%s listening on http://127.0.0.1:%d", version, port)
	if err := httpSrv.Serve(ln); err != nil && err != http.ErrServerClosed {
		log.Fatalf("fast-travel-companion: serve error: %v", err)
	}
	log.Printf("fast-travel-companion: stopped")
}

// protocolOS maps runtime.GOOS to the protocol.OS value reported in /v1/ping.
// darwin → "macos"; all others pass through ("linux", "windows", …).
func protocolOS(goos string) protocol.OS {
	if goos == "darwin" {
		return protocol.OSMacOS
	}
	return protocol.OS(goos)
}

// selfExecPath returns the path to the running executable.
// On failure it returns an empty string (autostart will be skipped gracefully).
func selfExecPath() string {
	path, err := os.Executable()
	if err != nil {
		return ""
	}
	return path
}
