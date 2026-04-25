import { el, screenHeader } from "../dom.js";
import {
  getConfig,
  setConfig,
  getConfigSourceState,
  importFromUrl,
  resetToRemote,
  clearIconCache,
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

  // ---- Import from file ----
  const fileCard = el("section", { class: "card" });
  fileCard.appendChild(el("div", { class: "card-header" }, "Import from file"));
  const fileBody = el("div", { class: "card-body" });
  const fileStatus = el("div", { class: "status" });
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
        fileStatus.className = "status error";
        fileStatus.textContent = `Validation failed: ${errors[0].message}`;
        return;
      }
      const result = await setConfig(parsed as FastTravelConfig);
      if (result.ok) {
        fileStatus.className = "status success";
        fileStatus.textContent = "Config imported from file.";
        updateStatusLine(statusLine, await getConfigSourceState());
        showSnackbar({ message: "Config imported" });
      } else {
        fileStatus.className = "status error";
        fileStatus.textContent = `Import failed: ${result.reason}`;
      }
    } catch (e) {
      fileStatus.className = "status error";
      fileStatus.textContent = `Failed: ${(e as Error).message}`;
    }
    fileInput.value = "";
  });
  fileBody.appendChild(el("div", { class: "btn-row" }, fileBtn, fileInput));
  fileBody.appendChild(fileStatus);
  fileCard.appendChild(fileBody);
  main.appendChild(fileCard);

  // ---- Import from URL ----
  const urlCard = el("section", { class: "card" });
  urlCard.appendChild(el("div", { class: "card-header" }, "Import from URL"));
  const urlBody = el("div", { class: "card-body" });
  const urlStatus = el("div", { class: "status" });

  const urlInput = el("input", {
    type: "url",
    placeholder: "https://raw.githubusercontent.com/…/config.json",
    value: state.url,
    class: "full-width",
  }) as HTMLInputElement;

  // Interval selector
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
      urlStatus.className = "status error";
      urlStatus.textContent = "Enter a URL first.";
      return;
    }
    fetchBtn.setAttribute("disabled", "true");
    urlStatus.className = "status";
    urlStatus.replaceChildren(el("span", { class: "spinner" }), " Fetching…");
    try {
      const result = await importFromUrl(url, selectedInterval());
      if (result.ok) {
        urlStatus.className = "status success";
        urlStatus.textContent = "Config imported from URL.";
        updateStatusLine(statusLine, await getConfigSourceState());
        showSnackbar({ message: "Config imported" });
      } else {
        urlStatus.className = "status error";
        urlStatus.textContent = `Failed: ${result.reason}`;
      }
    } catch (e) {
      urlStatus.className = "status error";
      urlStatus.textContent = `Error: ${(e as Error).message}`;
    } finally {
      fetchBtn.removeAttribute("disabled");
    }
  });

  urlBody.appendChild(el("div", { class: "form-row" }, el("label", null, "URL"), urlInput));
  urlBody.appendChild(radioGroup);
  urlBody.appendChild(el("div", { class: "btn-row" }, fetchBtn));
  urlBody.appendChild(urlStatus);
  urlCard.appendChild(urlBody);
  main.appendChild(urlCard);

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

  // ---- Icon cache ----
  const cacheCard = el("section", { class: "card" });
  cacheCard.appendChild(el("div", { class: "card-header" }, "Icon cache"));
  const cacheBody = el("div", { class: "card-body" });
  cacheBody.appendChild(el("div", { class: "form-hint" }, "Force re-fetch of all command favicons."));
  const cacheBtn = el("button", { class: "primary" }, "Clear icon cache");
  cacheBtn.addEventListener("click", async () => {
    await clearIconCache();
    showSnackbar({ message: "Icon cache cleared" });
  });
  cacheBody.appendChild(el("div", { class: "btn-row" }, cacheBtn));
  cacheCard.appendChild(cacheBody);
  main.appendChild(cacheCard);

  // ---- Reset to remote (only when URL stored) ----
  if (state.url) {
    const resetCard = el("section", { class: "card" });
    resetCard.appendChild(el("div", { class: "card-header" }, "Reset"));
    const resetBody = el("div", { class: "card-body" });
    resetBody.appendChild(
      el("div", { class: "form-hint" }, "Re-fetch from the last URL and re-enable auto-refresh."),
    );
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
  if (!state.dirty && state.url && state.lastSynced) {
    try {
      return `Auto-refresh active · Synced from ${new URL(state.url).hostname} · ${formatTimestamp(state.lastSynced)}`;
    } catch {
      return `Auto-refresh active · Synced · ${formatTimestamp(state.lastSynced)}`;
    }
  }
  if (state.dirty) return "Local config · auto-refresh paused";
  return "No remote source configured";
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
