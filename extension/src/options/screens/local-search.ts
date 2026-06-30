/**
 * "Local Search" settings screen — companion status + pairing flow,
 * enable toggle, `s`-keyword collision guard, and capability-gated defaults.
 *
 * Phase 2b: options screen only.  The results UI and `s` command intercept
 * are Phase 3.
 *
 * Security note: the companion's /v1/pairing/open endpoint is same-origin-
 * guarded and cannot be called from the extension.  Pairing is opened either
 * automatically on the companion's first run, or by the user clicking "Open
 * Pairing" on the companion's own /setup page.  This screen only calls
 * companionClient.pair() — it never calls companionClient.openPairingWindow().
 */

import { el, card, screenHeader } from "../dom.js";
import { getConfig } from "../data.js";
import { showSnackbar } from "../../ui/snackbar.js";
import * as companionClient from "../../core/companion-client.js";
import { getLocalSearchPrefs, setLocalSearchPrefs } from "../../core/local-search-store.js";
import { buildTriggerMap } from "../../core/parser.js";
import type { FastTravelConfig } from "../../core/types.js";
import type { PingResponse } from "../../core/companion-types.js";
import {
  regexAvailable,
  contentAvailable,
} from "../../core/local-search-capabilities.js";

// Re-export so the existing test surface (tests/unit/local-search-screen.test.ts)
// continues to import from this module without changes.
export { regexAvailable, contentAvailable };

// ── Status type ────────────────────────────────────────────────────────────────

export type CompanionStatus = "notFound" | "unpaired" | "connected" | "disconnected";

// ── Pure helpers (exported for unit tests) ────────────────────────────────────

/**
 * Detect the host OS from a User-Agent string.
 * Returns "windows", "macos", or "linux" (default).
 */
export function detectOS(ua: string): "windows" | "macos" | "linux" {
  const lower = ua.toLowerCase();
  if (lower.includes("win")) return "windows";
  if (lower.includes("mac")) return "macos";
  return "linux";
}

/**
 * Returns true if the config already maps the trigger "s" to a command.
 * The check is case-insensitive because buildTriggerMap lower-cases all
 * triggers before inserting them.
 */
export function configHasSTrigger(config: FastTravelConfig): boolean {
  return buildTriggerMap(config).has("s");
}

/**
 * Derive the companion connection status from a discover() result and stored
 * prefs.
 *
 * - null + no previous port  → "notFound"      (never seen a companion)
 * - null + had previous port → "disconnected"  (companion went away)
 * - result + ping.paired + has token → "connected"
 * - result + otherwise       → "unpaired"
 */
export function deriveStatus(
  result: { port: number; ping: PingResponse } | null,
  prefs: { port?: number; token?: string },
): CompanionStatus {
  if (result === null) {
    return prefs.port !== undefined ? "disconnected" : "notFound";
  }
  if (result.ping.paired && prefs.token) return "connected";
  return "unpaired";
}

// ── Constants ────────────────────────────────────────────────────────────────

const RELEASES_URL = "https://github.com/DoubleGremlin181/fast-travel-app/releases";

// ── Screen entry point ───────────────────────────────────────────────────────

export async function renderLocalSearch(main: HTMLElement): Promise<void> {
  main.appendChild(
    screenHeader(
      "Local Search",
      "Search files on this device using the ‘s’ command. Requires the Fast Travel Companion daemon.",
    ),
  );

  const contentArea = el("div", null);
  main.appendChild(contentArea);

  await loadAndRender();

  async function loadAndRender(): Promise<void> {
    contentArea.replaceChildren();
    contentArea.appendChild(buildLoadingCard());

    const [discoverResult, prefs, config] = await Promise.all([
      companionClient.discover(),
      getLocalSearchPrefs(),
      getConfig(),
    ]);

    const status = deriveStatus(discoverResult, prefs);
    const collision = config !== null ? configHasSTrigger(config) : false;
    const os = detectOS(navigator.userAgent);

    contentArea.replaceChildren();

    // 1. Companion status card (always shown)
    contentArea.appendChild(
      buildStatusCard(status, discoverResult, prefs, os, loadAndRender),
    );

    // 2. Collision error banner (shown when 's' is already a command trigger)
    if (collision) {
      contentArea.appendChild(buildCollisionBanner());
    }

    // 3. Enable toggle card
    contentArea.appendChild(
      buildEnableCard(status, collision, prefs, async (enabled) => {
        await setLocalSearchPrefs({ enabled });
      }),
    );

    // 4. Capability-gated defaults (only when connected)
    if (status === "connected" && discoverResult !== null) {
      contentArea.appendChild(buildDefaultsCard(discoverResult.ping, prefs));
    }
  }
}

// ── Card builders ────────────────────────────────────────────────────────────

function buildLoadingCard(): HTMLElement {
  const body = el(
    "div",
    { class: "card-body", style: "display:flex;align-items:center;gap:10px;" },
    el("span", { class: "spinner" }),
    "Discovering companion…",
  );
  const section = el("section", { class: "card" });
  section.appendChild(el("div", { class: "card-header" }, "Companion status"));
  section.appendChild(body);
  return section;
}

function buildStatusCard(
  status: CompanionStatus,
  result: { port: number; ping: PingResponse } | null,
  _prefs: { token?: string; port?: number },
  os: "windows" | "macos" | "linux",
  onRetry: () => void,
): HTMLElement {
  const section = el("section", { class: "card" });
  section.appendChild(el("div", { class: "card-header" }, "Companion status"));

  const body = el("div", { class: "card-body" });

  const STATUS_TEXT: Record<CompanionStatus, string> = {
    notFound: "Companion not installed or not running.",
    unpaired: "Companion detected — pair to connect.",
    connected: "Connected ✓",
    disconnected: "Companion disconnected.",
  };
  const STATUS_CLASS: Record<CompanionStatus, string> = {
    notFound: "status",
    unpaired: "status",
    connected: "status success",
    disconnected: "status error",
  };

  body.appendChild(el("div", { class: STATUS_CLASS[status] }, STATUS_TEXT[status]));

  if (status === "notFound") {
    body.appendChild(buildInstallGuide(os));
    body.appendChild(
      el("div", { class: "btn-row" }, mkBtn("Refresh", undefined, onRetry)),
    );
  } else if (status === "disconnected") {
    body.appendChild(
      el("div", { class: "btn-row" }, mkBtn("Retry", "primary", onRetry)),
    );
  } else if (status === "unpaired" && result !== null) {
    body.appendChild(buildPairingActions(result.port, result.ping, onRetry));
  } else if (status === "connected") {
    body.appendChild(
      el("div", { class: "btn-row" }, mkBtn("Refresh", undefined, onRetry)),
    );
  }

  section.appendChild(body);
  return section;
}

function buildPairingActions(
  port: number,
  ping: PingResponse,
  onDone: () => void,
): HTMLElement {
  const wrap = el("div", null);

  if (!ping.pairingOpen) {
    wrap.appendChild(
      el(
        "div",
        { class: "form-hint", style: "margin-top:10px;" },
        "Pairing is not yet open on the companion. Open the companion setup page and " +
          "click “Open Pairing” there, then click Pair now.",
      ),
    );
  }

  const btnRow = el("div", { class: "btn-row" });

  if (!ping.pairingOpen) {
    const openBtn = mkBtn("Open companion setup", undefined, () => {
      window.open(`http://127.0.0.1:${port}/setup`, "_blank");
    });
    btnRow.appendChild(openBtn);
  }

  const pairBtn = el("button", { class: "primary", type: "button" }, "Pair now");
  pairBtn.addEventListener("click", () => {
    pairBtn.disabled = true;
    pairBtn.textContent = "Pairing…";
    companionClient
      .pair(port, "Fast Travel Extension")
      .then(async (token) => {
        await setLocalSearchPrefs({ token });
        onDone();
      })
      .catch((err: unknown) => {
        const code =
          err instanceof companionClient.CompanionError ? err.code : "network";
        if (code === "pairing_closed") {
          showSnackbar({
            message:
              "Pairing is not open. Click “Open companion setup” first, then open pairing from there.",
          });
        } else {
          showSnackbar({
            message: `Pairing failed: ${(err as Error).message}`,
          });
        }
        pairBtn.disabled = false;
        pairBtn.textContent = "Pair now";
      });
  });
  btnRow.appendChild(pairBtn);
  wrap.appendChild(btnRow);
  return wrap;
}

function buildInstallGuide(os: "windows" | "macos" | "linux"): HTMLElement {
  const wrap = el("div", { class: "ls-install-guide" });
  wrap.appendChild(
    el(
      "div",
      { class: "ls-install-title" },
      "Install the Fast Travel Companion",
    ),
  );

  if (os === "macos") {
    wrap.appendChild(
      el(
        "p",
        { class: "form-hint", style: "margin-top:8px;" },
        "macOS support is coming soon. Check the Releases page for updates.",
      ),
    );
    wrap.appendChild(
      el(
        "div",
        { class: "btn-row", style: "margin-top:10px;" },
        el(
          "a",
          {
            href: RELEASES_URL,
            target: "_blank",
            rel: "noopener noreferrer",
            class: "btn",
          },
          "View Releases",
        ),
      ),
    );
    return wrap;
  }

  const assetName =
    os === "windows"
      ? "fast-travel-companion-windows-amd64.exe"
      : "fast-travel-companion-linux-amd64";

  const steps = el("ol", { class: "setup-steps" });

  const li1 = el("li", null);
  li1.appendChild(document.createTextNode("Download "));
  li1.appendChild(el("code", null, assetName));
  if (os === "linux") {
    li1.appendChild(document.createTextNode(" (or "));
    li1.appendChild(el("code", null, "fast-travel-companion-linux-arm64"));
    li1.appendChild(document.createTextNode(" for ARM64) "));
  }
  li1.appendChild(document.createTextNode(" from the "));
  li1.appendChild(
    el(
      "a",
      {
        href: RELEASES_URL,
        target: "_blank",
        rel: "noopener noreferrer",
      },
      "Releases page",
    ),
  );
  li1.appendChild(document.createTextNode("."));
  steps.appendChild(li1);

  steps.appendChild(
    el(
      "li",
      null,
      os === "windows"
        ? "Run the .exe — it opens a setup page in your browser and starts listening on 127.0.0.1."
        : "Make it executable (chmod +x) and run it — it opens a setup page and starts listening on 127.0.0.1.",
    ),
  );

  steps.appendChild(
    el(
      "li",
      null,
      "Once the companion is running, click Refresh above.",
    ),
  );

  wrap.appendChild(steps);
  return wrap;
}

function buildCollisionBanner(): HTMLElement {
  const banner = el("div", { class: "ls-banner ls-banner-error" });
  banner.appendChild(el("strong", null, "Keyword conflict:"));
  banner.appendChild(
    document.createTextNode(
      " The ‘s’ keyword is already used by a command in your config. " +
        "Rename or remove that command to use Local Search.",
    ),
  );
  return banner;
}

function buildEnableCard(
  status: CompanionStatus,
  collision: boolean,
  prefs: { enabled: boolean },
  onToggle: (enabled: boolean) => Promise<void>,
): HTMLElement {
  const canEnable = status === "connected" && !collision;

  const subtitle =
    status !== "connected"
      ? "Connect the companion daemon to enable."
      : collision
        ? "Resolve the keyword conflict above to enable."
        : "Type ‘s <query>’ in the new tab page to search files.";

  const checkbox = el("input", { type: "checkbox", id: "ls-enable" });
  checkbox.checked = prefs.enabled && canEnable;
  checkbox.disabled = !canEnable;

  checkbox.addEventListener("change", () => {
    const next = checkbox.checked;
    onToggle(next).catch((err: unknown) => {
      checkbox.checked = !next; // revert on failure
      showSnackbar({ message: `Failed to save: ${(err as Error).message}` });
    });
  });

  const toggleLabel = el(
    "label",
    { class: "toggle-switch" },
    checkbox,
    el("span", { class: "toggle-track" }),
  );

  const section = el("section", { class: "card" });
  section.appendChild(el("div", { class: "card-header" }, "Local Search"));

  const row = el("div", { class: "card-row" });
  const rowMain = el("div", { class: "card-row-main" });
  rowMain.appendChild(el("div", { class: "card-row-title" }, "Enable Local Search"));
  rowMain.appendChild(el("div", { class: "card-row-subtitle" }, subtitle));
  row.appendChild(rowMain);
  row.appendChild(toggleLabel);
  section.appendChild(row);

  return section;
}

function buildDefaultsCard(
  ping: PingResponse,
  prefs: { queryMode: "simple" | "wildcard" | "regex"; filters: { content?: boolean } },
): HTMLElement {
  const body = el("div", { class: "card-body" });

  // ── Query mode selector ────────────────────────────────────────────────────
  const modeRow = el("div", { class: "form-row" });
  const modeLabel = el(
    "label",
    { class: "form-label", for: "ls-query-mode" },
    "Default query mode",
  );
  modeRow.appendChild(modeLabel);

  const modeSelect = el("select", { id: "ls-query-mode" });
  const hasRegex = regexAvailable(ping);

  const MODES: { value: "simple" | "wildcard" | "regex"; label: string }[] = [
    { value: "simple", label: "Simple" },
    { value: "wildcard", label: "Wildcard" },
    { value: "regex", label: "Regex" },
  ];

  for (const { value, label } of MODES) {
    const isRegexOpt = value === "regex";
    const opt = el("option", { value }, label);
    if (isRegexOpt && !hasRegex) {
      opt.disabled = true;
      opt.title = "Not supported by your indexer.";
    }
    if (value === prefs.queryMode) opt.selected = true;
    modeSelect.appendChild(opt);
  }

  modeSelect.addEventListener("change", () => {
    void setLocalSearchPrefs({
      queryMode: modeSelect.value as "simple" | "wildcard" | "regex",
    });
  });
  modeRow.appendChild(modeSelect);

  if (!hasRegex) {
    modeRow.appendChild(
      el(
        "div",
        { class: "form-hint" },
        "Regex mode is not supported by your current indexer.",
      ),
    );
  }
  body.appendChild(modeRow);

  // ── Content search toggle (only when the default indexer supports it) ──────
  if (contentAvailable(ping)) {
    const contentRow = el("div", { class: "card-row", style: "border-top:1px solid var(--border);margin-top:12px;" });

    const rowMain = el("div", { class: "card-row-main" });
    rowMain.appendChild(
      el("div", { class: "card-row-title" }, "Search file contents"),
    );
    rowMain.appendChild(
      el(
        "div",
        { class: "card-row-subtitle" },
        "Include file contents in search results (slower).",
      ),
    );

    const contentCheck = el("input", { type: "checkbox", id: "ls-content" });
    contentCheck.checked = prefs.filters.content === true;
    contentCheck.addEventListener("change", () => {
      void setLocalSearchPrefs({ filters: { content: contentCheck.checked } });
    });

    const contentLabel = el(
      "label",
      { class: "toggle-switch" },
      contentCheck,
      el("span", { class: "toggle-track" }),
    );

    contentRow.appendChild(rowMain);
    contentRow.appendChild(contentLabel);
    body.appendChild(contentRow);
  }

  return card("Defaults", body);
}

// ── DOM utilities ────────────────────────────────────────────────────────────

function mkBtn(
  text: string,
  variant: "primary" | "ghost" | undefined,
  onClick: () => void,
): HTMLButtonElement {
  const btn = el("button", { type: "button", class: variant }, text);
  btn.addEventListener("click", onClick);
  return btn;
}
