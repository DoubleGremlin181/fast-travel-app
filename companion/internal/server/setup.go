package server

import (
	"fmt"
	"html/template"
	"net/http"
)

// setupTmpl is the template for GET /setup, rendered once per request with
// current server state so the page always reflects live pairing/port status.
var setupTmpl = template.Must(template.New("setup").Parse(setupHTML))

// setupData holds the dynamic values injected into the setup page template.
type setupData struct {
	Paired  bool
	Port    int
	Name    string
	Version string
}

// handleSetup serves GET /setup.
// No authentication required — it is the entry point for the user to initiate
// pairing. The page posts to /v1/pairing/open (JS fetch) and tells the user
// to click "Pair" in the extension.
func (s *Server) handleSetup(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	data := setupData{
		Paired:  s.deps.Pairing.Paired(),
		Port:    s.deps.Port,
		Name:    s.deps.Name,
		Version: s.deps.Version,
	}
	if err := setupTmpl.Execute(w, data); err != nil {
		// Headers are already sent; append a comment and move on.
		fmt.Fprintf(w, "<!-- template error: %v -->", err)
	}
}

// setupHTML is the source for the /setup page. It uses html/template syntax
// and contains no external asset dependencies.
const setupHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fast Travel — Companion Setup</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 520px;
      margin: 2.5rem auto;
      padding: 0 1.25rem;
      color: #1a1a1a;
      background: #f9fafb;
    }
    h1 { font-size: 1.35rem; margin: 0 0 1.5rem; }
    .card {
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 1.25rem 1.5rem;
      margin-bottom: 1rem;
    }
    .status-row { display: flex; align-items: center; gap: 0.5rem; }
    .badge {
      display: inline-block;
      padding: 0.2rem 0.65rem;
      border-radius: 9999px;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .badge-paired   { background: #d1fae5; color: #065f46; }
    .badge-unpaired { background: #fef3c7; color: #92400e; }
    .meta { font-size: 0.85rem; color: #6b7280; margin-top: 0.4rem; }
    button {
      display: inline-block;
      margin-top: 0.75rem;
      padding: 0.6rem 1.25rem;
      border: none;
      border-radius: 6px;
      background: #2563eb;
      color: #fff;
      font-size: 0.95rem;
      cursor: pointer;
      transition: background 0.15s;
    }
    button:hover:not(:disabled) { background: #1d4ed8; }
    button:disabled { opacity: 0.6; cursor: default; }
    #msg { margin-top: 0.75rem; font-size: 0.9rem; color: #374151; min-height: 1.4rem; }
    ol { padding-left: 1.3rem; margin: 0.5rem 0 0; }
    ol li { margin-bottom: 0.3rem; font-size: 0.9rem; }
    footer { margin-top: 2rem; font-size: 0.78rem; color: #9ca3af; text-align: center; }
  </style>
</head>
<body>
  <h1>Fast Travel Companion</h1>

  <div class="card">
    <div class="status-row">
      <span>Pairing status:</span>
      {{if .Paired}}
        <span class="badge badge-paired">Paired</span>
      {{else}}
        <span class="badge badge-unpaired">Not paired</span>
      {{end}}
    </div>
    {{if .Port}}
    <p class="meta">Listening on <code>127.0.0.1:{{.Port}}</code></p>
    {{end}}
  </div>

  <div class="card">
    <strong>Pair the browser extension</strong>
    <ol>
      <li>Click <strong>Open Pairing Window</strong> below.</li>
      <li>Open the Fast Travel extension popup in your browser and click <strong>Pair</strong>.</li>
      <li>The window stays open for 5 minutes — pair before it expires.</li>
    </ol>
    <button id="pairBtn" onclick="openPairingWindow()">Open Pairing Window</button>
    <div id="msg"></div>
  </div>

  <footer>{{.Name}} v{{.Version}}</footer>

  <script>
    async function openPairingWindow() {
      const btn = document.getElementById('pairBtn');
      const msg = document.getElementById('msg');
      btn.disabled = true;
      btn.textContent = 'Opening…';
      msg.textContent = '';
      try {
        const r = await fetch('/v1/pairing/open', { method: 'POST' });
        if (r.ok) {
          btn.textContent = 'Window open';
          msg.textContent = 'Pairing window is open. Click Pair in the extension now.';
        } else {
          const j = await r.json().catch(() => ({}));
          btn.textContent = 'Open Pairing Window';
          btn.disabled = false;
          msg.textContent = 'Failed: ' + (j.message || r.status);
        }
      } catch (e) {
        btn.textContent = 'Open Pairing Window';
        btn.disabled = false;
        msg.textContent = 'Error: ' + e.message;
      }
    }
  </script>
</body>
</html>`
