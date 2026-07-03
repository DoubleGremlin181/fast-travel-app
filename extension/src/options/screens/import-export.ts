import { el, screenHeader } from "../dom.js";
import {
  getConfig,
  setConfig,
  getConfigSourceState,
  importFromUrl,
  resetToRemote,
  type RefreshInterval,
  type ConfigSourceState,
} from "../data.js";
import { lintConfig } from "../../core/config-linter.js";
import type { FastTravelConfig } from "../../core/types.js";
import { showSnackbar } from "../../ui/snackbar.js";

const INTERVAL_CHOICES: { value: RefreshInterval; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

export async function renderImportExport(main: HTMLElement): Promise<void> {
  main.appendChild(screenHeader("Import / Export", "Import a config from a file or URL, or export your current config."));

  const state = await getConfigSourceState();

  // ---- Status ----
  const statusCard = el("section", { class: "card" });
  statusCard.appendChild(el("div", { class: "card-header" }, "Status"));
  const statusBody = el("div", { class: "card-body" });
  const statusLine = el("div", { class: state.dirty ? "status" : "status success" });
  statusLine.textContent = buildStatusText(state);
  statusBody.appendChild(statusLine);
  statusCard.appendChild(statusBody);
  main.appendChild(statusCard);

  // ---- Import (file or URL) — mirrors the Android Import section ----
  const importCard = el("section", { class: "card" });
  importCard.appendChild(el("div", { class: "card-header" }, "Import"));
  const importBody = el("div", { class: "card-body" });
  const importStatus = el("div", { class: "status" });

  // Choose file…
  const fileInput = el("input", {
    type: "file",
    accept: ".json,application/json",
    style: "display:none",
    id: "file-import-input",
  }) as HTMLInputElement;
  const fileBtn = el("button", { class: "primary" }, "Choose file…");
  fileBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const errors = lintConfig(parsed as FastTravelConfig);
      if (errors.length > 0) {
        importStatus.className = "status error";
        importStatus.textContent = `Validation failed: ${errors[0].message}`;
        return;
      }
      const result = await setConfig(parsed as FastTravelConfig);
      if (result.ok) {
        importStatus.className = "status success";
        importStatus.textContent = "Config imported from file.";
        updateStatusLine(statusLine, await getConfigSourceState());
        showSnackbar({ message: "Config imported" });
      } else {
        importStatus.className = "status error";
        importStatus.textContent = `Import failed: ${result.reason}`;
      }
    } catch (e) {
      importStatus.className = "status error";
      importStatus.textContent = `Failed: ${(e as Error).message}`;
    }
    fileInput.value = "";
  });

  // Config URL (prefilled + editable, like Android)
  const urlInput = el("input", {
    type: "url",
    placeholder: "https://raw.githubusercontent.com/…/config.json",
    value: state.url,
    class: "full-width",
  }) as HTMLInputElement;

  // Auto-refresh interval selector
  const radioGroup = el("div", { class: "radio-group", style: "padding:8px 0;" });
  for (const opt of INTERVAL_CHOICES) {
    const isSelected = opt.value === state.interval;
    const card = el(
      "label",
      { class: isSelected ? "radio-card selected" : "radio-card", "data-value": opt.value },
      el("input", { type: "radio", name: "import-interval", value: opt.value }),
      el("div", { class: "radio-card-title" }, opt.label),
    );
    radioGroup.appendChild(card);
  }
  function selectedInterval(): RefreshInterval {
    const sel = radioGroup.querySelector<HTMLElement>(".radio-card.selected");
    return (sel?.getAttribute("data-value") ?? "daily") as RefreshInterval;
  }
  radioGroup.addEventListener("click", (e) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>(".radio-card");
    if (!card) return;
    e.preventDefault();
    radioGroup.querySelectorAll<HTMLElement>(".radio-card").forEach((c) =>
      c.classList.toggle("selected", c === card)
    );
  });

  const fetchBtn = el("button", { class: "primary" }, "Fetch & Import");
  fetchBtn.addEventListener("click", async () => {
    const url = urlInput.value.trim();
    if (!url) {
      importStatus.className = "status error";
      importStatus.textContent = "Enter a URL first.";
      return;
    }
    fetchBtn.setAttribute("disabled", "true");
    importStatus.className = "status";
    importStatus.replaceChildren(el("span", { class: "spinner" }), " Fetching…");
    try {
      const result = await importFromUrl(url, selectedInterval());
      if (result.ok) {
        importStatus.className = "status success";
        importStatus.textContent = "Config imported from URL.";
        updateStatusLine(statusLine, await getConfigSourceState());
        showSnackbar({ message: "Config imported" });
      } else {
        importStatus.className = "status error";
        importStatus.textContent = `Failed: ${result.reason}`;
      }
    } catch (e) {
      importStatus.className = "status error";
      importStatus.textContent = `Error: ${(e as Error).message}`;
    } finally {
      fetchBtn.removeAttribute("disabled");
    }
  });

  importBody.appendChild(el("div", { class: "btn-row" }, fileBtn, fileInput));
  importBody.appendChild(el("div", { class: "form-row" }, el("label", null, "Config URL"), urlInput));
  importBody.appendChild(el("label", { class: "form-label" }, "Auto-refresh"));
  importBody.appendChild(radioGroup);
  importBody.appendChild(el("div", { class: "btn-row" }, fetchBtn));
  importBody.appendChild(importStatus);
  importCard.appendChild(importBody);
  main.appendChild(importCard);

  // ---- Export ----
  const exportCard = el("section", { class: "card" });
  exportCard.appendChild(el("div", { class: "card-header" }, "Export"));
  const exportBody = el("div", { class: "card-body" });
  const exportBtn = el("button", { class: "primary" }, "Export config");
  exportBtn.addEventListener("click", async () => {
    const cfg = await getConfig();
    if (!cfg) return;
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" });
    const blobUrl = URL.createObjectURL(blob);
    const a = el("a", { href: blobUrl, download: "fast-travel-config.json" }) as HTMLAnchorElement;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
    showSnackbar({ message: "Config exported" });
  });
  exportBody.appendChild(el("div", { class: "btn-row" }, exportBtn));
  exportCard.appendChild(exportBody);
  main.appendChild(exportCard);

  // ---- Reset to remote (only when there are local edits to discard) ----
  if (state.dirty) {
    const resetCard = el("section", { class: "card" });
    resetCard.appendChild(el("div", { class: "card-header" }, "Reset"));
    const resetBody = el("div", { class: "card-body" });
    const resetBtn = el("button", { class: "danger" }, "Reset to remote");
    resetBtn.addEventListener("click", async () => {
      if (!confirm("Re-fetch from remote and discard any local changes?")) return;
      resetBtn.setAttribute("disabled", "true");
      const result = await resetToRemote();
      if (result.ok) {
        updateStatusLine(statusLine, await getConfigSourceState());
        showSnackbar({ message: "Reset to remote config" });
      } else {
        showSnackbar({ message: `Reset failed: ${result.reason}` });
      }
      resetBtn.removeAttribute("disabled");
    });
    resetBody.appendChild(el("div", { class: "btn-row" }, resetBtn));
    resetCard.appendChild(resetBody);
    main.appendChild(resetCard);
  }
}

function buildStatusText(state: ConfigSourceState): string {
  // Mirror the Android status wording: when local edits have paused
  // auto-refresh, say so explicitly so it's clear why remote changes aren't
  // arriving (and that "Reset to remote" is the way to resume).
  if (state.dirty) return "Local config · auto-refresh paused";
  if (state.lastSynced) return `Synced ${formatTimestamp(state.lastSynced)}`;
  return "Not synced yet";
}

function updateStatusLine(el: HTMLElement, state: ConfigSourceState): void {
  el.className = state.dirty ? "status" : "status success";
  el.textContent = buildStatusText(state);
}

function formatTimestamp(ts: number): string {
  const diffMin = Math.floor((Date.now() - ts) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(ts).toLocaleDateString();
}
