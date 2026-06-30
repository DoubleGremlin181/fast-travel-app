/**
 * Local-search results view + `s`-command intercept logic for the new-tab page.
 *
 * Pure, side-effect-free functions (shouldInterceptLocalSearch, buildSearchRequest,
 * navDown, navUp) live at the top and are unit-tested. All DOM work is deferred
 * behind initLocalSearch() / openLocalSearch() / closeLocalSearch() so module
 * import is safe in the Vitest / Node environment.
 */

import type { FastTravelConfig } from "../core/types.js";
import type { SearchRequest, Filters, FileResult } from "../core/companion-types.js";
import type { LocalSearchPrefs } from "../core/local-search-store.js";
import { getLocalSearchPrefs, setLocalSearchPrefs } from "../core/local-search-store.js";
import { buildTriggerMap } from "../core/parser.js";
import { search as companionSearch, openFile as companionOpenFile, CompanionError } from "../core/companion-client.js";
import { renderFavicon } from "../ui/favicon.js";
import { showSnackbar } from "../ui/snackbar.js";

// ── Pure functions (exported + unit-tested) ───────────────────────────────────

/**
 * Decide whether to intercept the newtab submit and open the local-search view.
 *
 * Returns `{ intercept: true, query }` only when ALL of:
 *   - prefs.enabled is true
 *   - prefs.token is set (paired)
 *   - the config does NOT define the `s` trigger (config command always wins)
 *   - input matches `^s(\s+.*)?$` (the `s` command, optionally followed by a query)
 *
 * Everything else returns `{ intercept: false }` — a strict no-op.
 */
export function shouldInterceptLocalSearch(
  input: string,
  prefs: LocalSearchPrefs,
  config: FastTravelConfig,
): { intercept: false } | { intercept: true; query: string } {
  if (!prefs.enabled || !prefs.token) return { intercept: false };
  if (buildTriggerMap(config).has("s")) return { intercept: false };
  const match = /^s(\s+(.*))?$/i.exec(input);
  if (!match) return { intercept: false };
  return { intercept: true, query: (match[2] ?? "").trim() };
}

/**
 * Build a SearchRequest from current prefs + query + recently-opened ids.
 * page is always 0; pageSize is always 50.
 */
export function buildSearchRequest(
  prefs: LocalSearchPrefs,
  query: string,
  recentlyOpened: string[] = [],
): SearchRequest {
  return {
    query,
    queryMode: prefs.queryMode,
    sort: prefs.sort,
    filters: prefs.filters as Filters,
    page: 0,
    pageSize: 50,
    ...(recentlyOpened.length > 0 ? { history: recentlyOpened } : {}),
  };
}

/**
 * Move selection down by one, clamping at the last item.
 * Returns -1 when total is 0 (nothing to select).
 */
export function navDown(index: number, total: number): number {
  if (total === 0) return -1;
  return Math.min(index + 1, total - 1);
}

/**
 * Move selection up by one, allowing deselection to -1 (above the list).
 * Returns -1 when total is 0.
 */
export function navUp(index: number, total: number): number {
  if (total === 0) return -1;
  return Math.max(index - 1, -1);
}

// ── DOM state (module-level; reset on closeLocalSearch) ───────────────────────

let isOpen = false;
let activeIndex = -1;
let currentResults: FileResult[] = [];
/** Monotonically-increasing generation counter prevents stale responses from
 * rendering after a newer search was started. */
let searchGeneration = 0;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

// DOM refs — null until ensureContainer() runs
let lsContainer: HTMLElement | null = null;
let lsInput: HTMLInputElement | null = null;
let lsStatus: HTMLElement | null = null;
let lsList: HTMLElement | null = null;
let lsFooter: HTMLElement | null = null;

/** IDs of the normal newtab hero elements to hide while the results view is open. */
const HERO_IDS = [
  "search-container",
  "chips-section",
  "typo-container",
  "onboarding-hint",
] as const;

// ── Initialization (called once from newtab.ts after DOM is ready) ────────────

/**
 * Register the document-level Escape handler. Call once from newtab.ts.
 * Kept out of module-level scope so the module is safe to import in Node/tests.
 */
export function initLocalSearch(): void {
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === "Escape") closeLocalSearch();
  });
}

// ── DOM creation (lazy — first call to openLocalSearch) ───────────────────────

function ensureContainer(): void {
  if (lsContainer) return;
  const app = document.getElementById("app");
  if (!app) return;

  lsContainer = document.createElement("div");
  lsContainer.id = "ls-container";
  lsContainer.className = "hidden";
  lsContainer.setAttribute("role", "region");
  lsContainer.setAttribute("aria-label", "Local file search");

  // ── Header: back button + compact search input ──────────────────────────
  const header = document.createElement("div");
  header.id = "ls-header";

  const backBtn = document.createElement("button");
  backBtn.id = "ls-back";
  backBtn.type = "button";
  backBtn.setAttribute("aria-label", "Back to Fast Travel");
  backBtn.innerHTML =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>';
  backBtn.addEventListener("click", closeLocalSearch);
  header.appendChild(backBtn);

  const inputWrapper = document.createElement("div");
  inputWrapper.id = "ls-input-wrapper";
  lsInput = document.createElement("input");
  lsInput.id = "ls-input";
  lsInput.type = "text";
  lsInput.autocomplete = "off";
  lsInput.spellcheck = false;
  lsInput.setAttribute("aria-label", "Search local files");
  lsInput.placeholder = "Search files…";
  inputWrapper.appendChild(lsInput);
  header.appendChild(inputWrapper);

  lsContainer.appendChild(header);

  // ── Toolbar placeholder — 3b drops the Drive-style toolbar here ─────────
  const toolbar = document.createElement("div");
  toolbar.id = "ls-toolbar";
  toolbar.setAttribute("aria-hidden", "true");
  lsContainer.appendChild(toolbar);

  // ── Status area: loading / empty / error / disconnected ─────────────────
  lsStatus = document.createElement("div");
  lsStatus.id = "ls-status";
  lsStatus.className = "hidden";
  lsStatus.setAttribute("role", "status");
  lsStatus.setAttribute("aria-live", "polite");
  lsContainer.appendChild(lsStatus);

  // ── Results list ─────────────────────────────────────────────────────────
  lsList = document.createElement("div");
  lsList.id = "ls-list";
  lsList.setAttribute("role", "listbox");
  lsList.setAttribute("aria-label", "File search results");
  lsContainer.appendChild(lsList);

  // ── Footer: total + indexer + degraded note ──────────────────────────────
  lsFooter = document.createElement("div");
  lsFooter.id = "ls-footer";
  lsFooter.className = "hidden";
  lsContainer.appendChild(lsFooter);

  app.appendChild(lsContainer);

  // Wire keyboard navigation on the local search input
  lsInput.addEventListener("keydown", handleInputKeydown);
  lsInput.addEventListener("input", handleInputChange);
}

// ── Keyboard handling ─────────────────────────────────────────────────────────

function handleInputKeydown(e: KeyboardEvent): void {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    activeIndex = navDown(activeIndex, currentResults.length);
    updateActiveRow();
    scrollActiveRowIntoView();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    activeIndex = navUp(activeIndex, currentResults.length);
    updateActiveRow();
    scrollActiveRowIntoView();
  } else if (e.key === "Enter" && activeIndex >= 0) {
    e.preventDefault();
    if (e.shiftKey) {
      void doReveal(activeIndex);
    } else {
      void doOpen(activeIndex);
    }
  } else if (e.key === "Escape") {
    closeLocalSearch();
  }
}

function handleInputChange(): void {
  if (!lsInput) return;
  const query = lsInput.value;
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void runSearch(query);
  }, 240);
}

// ── Open / close ──────────────────────────────────────────────────────────────

/**
 * Take over the new-tab view: hide the hero, show the results container, and
 * run an initial search for `query`. Exported so newtab.ts can call it.
 */
export async function openLocalSearch(query: string): Promise<void> {
  ensureContainer();
  if (!lsContainer || !lsInput) return;

  isOpen = true;
  activeIndex = -1;
  currentResults = [];

  // Hide normal newtab elements
  for (const id of HERO_IDS) {
    document.getElementById(id)?.classList.add("ls-hidden");
  }

  lsContainer.classList.remove("hidden");
  lsInput.value = query;
  lsInput.focus();
  lsInput.select();

  if (query) {
    await runSearch(query);
  } else {
    showEmptyQueryState();
  }
}

/**
 * Restore the normal launcher view. Called on Escape, back button, or from
 * newtab.ts.
 */
export function closeLocalSearch(): void {
  if (!isOpen) return;
  isOpen = false;
  searchGeneration++;

  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  lsContainer?.classList.add("hidden");
  clearStatusAndList();

  currentResults = [];
  activeIndex = -1;

  // Restore normal newtab elements
  for (const id of HERO_IDS) {
    document.getElementById(id)?.classList.remove("ls-hidden");
  }

  // Return focus to the main search bar
  (document.getElementById("search-input") as HTMLInputElement | null)?.focus();
}

// ── Search ────────────────────────────────────────────────────────────────────

async function runSearch(query: string): Promise<void> {
  const gen = ++searchGeneration;
  showLoading();

  const prefs = await getLocalSearchPrefs();
  if (gen !== searchGeneration || !isOpen) return;

  if (!prefs.port || !prefs.token) {
    showDisconnected();
    return;
  }

  const req = buildSearchRequest(prefs, query, prefs.recentlyOpened ?? []);

  try {
    const resp = await companionSearch(prefs.port, prefs.token, req);
    if (gen !== searchGeneration || !isOpen) return;
    renderResults(resp.results, resp.total, resp.indexer, resp.degraded ?? false, query);
  } catch (err) {
    if (gen !== searchGeneration || !isOpen) return;
    if (err instanceof CompanionError && err.code === "unauthorized") {
      // Definitive 401 — clear the stale token so the settings screen re-prompts pairing
      await setLocalSearchPrefs({ token: undefined });
      showUnauthorized();
    } else if (err instanceof CompanionError && err.code === "network") {
      showDisconnected();
    } else {
      showError(err instanceof Error ? err.message : String(err), query);
    }
  }
}

// ── State renderers ───────────────────────────────────────────────────────────

function clearStatusAndList(): void {
  if (lsStatus) {
    lsStatus.className = "hidden";
    lsStatus.replaceChildren();
  }
  lsList?.replaceChildren();
  if (lsFooter) lsFooter.className = "hidden";
}

function showLoading(): void {
  if (!lsStatus || !lsList || !lsFooter) return;
  lsList.replaceChildren();
  lsFooter.className = "hidden";
  lsStatus.className = "ls-status ls-status-loading";
  lsStatus.replaceChildren();
  const spinner = document.createElement("div");
  spinner.className = "ls-spinner";
  spinner.setAttribute("aria-hidden", "true");
  lsStatus.appendChild(spinner);
  const label = document.createElement("span");
  label.textContent = "Searching…";
  lsStatus.appendChild(label);
}

function showEmptyQueryState(): void {
  if (!lsStatus || !lsList || !lsFooter) return;
  lsList.replaceChildren();
  lsFooter.className = "hidden";
  lsStatus.className = "ls-status ls-status-empty";
  lsStatus.textContent = "Type a query to search your local files.";
}

function showDisconnected(): void {
  if (!lsStatus || !lsList || !lsFooter) return;
  lsList.replaceChildren();
  lsFooter.className = "hidden";
  lsStatus.className = "ls-status ls-status-disconnected";
  lsStatus.replaceChildren();
  const msg = document.createElement("p");
  msg.textContent = "Cannot reach the Fast Travel companion.";
  lsStatus.appendChild(msg);
  lsStatus.appendChild(makeSettingsLink("Check Local Search settings →"));
}

function showUnauthorized(): void {
  if (!lsStatus || !lsList || !lsFooter) return;
  lsList.replaceChildren();
  lsFooter.className = "hidden";
  lsStatus.className = "ls-status ls-status-disconnected";
  lsStatus.replaceChildren();
  const msg = document.createElement("p");
  msg.textContent = "Authorization lost — re-pairing is required.";
  lsStatus.appendChild(msg);
  lsStatus.appendChild(makeSettingsLink("Re-pair in Local Search settings →"));
}

function showError(message: string, query: string): void {
  if (!lsStatus || !lsList || !lsFooter) return;
  lsList.replaceChildren();
  lsFooter.className = "hidden";
  lsStatus.className = "ls-status ls-status-error";
  lsStatus.replaceChildren();
  const msg = document.createElement("p");
  msg.textContent = `Search error: ${message}`;
  lsStatus.appendChild(msg);
  const retryBtn = document.createElement("button");
  retryBtn.type = "button";
  retryBtn.className = "ls-retry-btn";
  retryBtn.textContent = "Retry";
  retryBtn.addEventListener("click", () => void runSearch(query));
  lsStatus.appendChild(retryBtn);
}

function makeSettingsLink(text: string): HTMLParagraphElement {
  const hint = document.createElement("p");
  hint.className = "ls-status-hint";
  const a = document.createElement("a");
  a.href = "../options/options.html#/local-search";
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = text;
  hint.appendChild(a);
  return hint;
}

// ── Results rendering ─────────────────────────────────────────────────────────

function renderResults(
  results: FileResult[],
  total: number,
  indexer: string,
  degraded: boolean,
  query: string,
): void {
  if (!lsStatus || !lsList || !lsFooter) return;

  currentResults = results;
  activeIndex = -1;

  if (results.length === 0) {
    lsStatus.className = "ls-status ls-status-empty";
    lsStatus.textContent = query
      ? `No files match “${query}”.`
      : "No files found.";
    lsList.replaceChildren();
    lsFooter.className = "hidden";
    return;
  }

  lsStatus.className = "hidden";
  lsStatus.replaceChildren();

  lsList.replaceChildren();
  results.forEach((file, i) => {
    lsList!.appendChild(buildResultRow(file, i));
  });

  // Footer: total count + indexer name + optional degraded badge
  lsFooter.className = "ls-footer";
  lsFooter.replaceChildren();
  const countEl = document.createElement("span");
  countEl.className = "ls-footer-count";
  countEl.textContent = `${total.toLocaleString()} result${total !== 1 ? "s" : ""} · ${indexer}`;
  lsFooter.appendChild(countEl);
  if (degraded) {
    const badge = document.createElement("span");
    badge.className = "ls-degraded-badge";
    badge.title = "Index may be incomplete — results are best-effort";
    badge.textContent = "best-effort";
    lsFooter.appendChild(badge);
  }
}

function buildResultRow(file: FileResult, index: number): HTMLElement {
  const row = document.createElement("div");
  row.className = "ls-result-row";
  row.setAttribute("role", "option");
  row.setAttribute("aria-selected", "false");
  row.dataset.index = String(index);

  // File-type icon — monogram keyed on ext/type for now; rich per-type icons come in 3b
  const iconEl = document.createElement("div");
  iconEl.className = "ls-result-icon";
  renderFavicon(iconEl, {
    // Use the extension (e.g. ".pdf") or first letter of type as the monogram seed
    trigger: file.ext ? `.${file.ext}` : file.type.charAt(0),
    size: 20,
  });
  row.appendChild(iconEl);

  // Primary name + secondary path
  const textBlock = document.createElement("div");
  textBlock.className = "ls-result-text";

  const primary = document.createElement("span");
  primary.className = "ls-result-primary";
  primary.textContent = file.name;
  textBlock.appendChild(primary);

  const secondary = document.createElement("span");
  secondary.className = "ls-result-secondary";
  secondary.textContent = file.dir;
  textBlock.appendChild(secondary);

  row.appendChild(textBlock);

  // Compact meta: date + size
  const meta = document.createElement("div");
  meta.className = "ls-result-meta";
  const dateEl = document.createElement("span");
  dateEl.textContent = formatDate(file.modifiedAt);
  meta.appendChild(dateEl);
  const sizeEl = document.createElement("span");
  sizeEl.textContent = formatSize(file.size);
  meta.appendChild(sizeEl);
  row.appendChild(meta);

  // Reveal-in-file-manager button (Shift+Enter affordance)
  const revealBtn = document.createElement("button");
  revealBtn.type = "button";
  revealBtn.className = "ls-reveal-btn";
  revealBtn.title = "Reveal in file manager (Shift+Enter)";
  revealBtn.setAttribute("aria-label", `Reveal ${file.name} in file manager`);
  // Folder / reveal icon
  revealBtn.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
    ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>' +
    "</svg>";
  revealBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    void doReveal(index);
  });
  row.appendChild(revealBtn);

  // Mouse: hover selects, click opens
  row.addEventListener("mouseenter", () => {
    activeIndex = index;
    updateActiveRow();
  });
  row.addEventListener("click", () => void doOpen(index));

  return row;
}

function updateActiveRow(): void {
  if (!lsList) return;
  lsList.querySelectorAll<HTMLElement>(".ls-result-row").forEach((row, i) => {
    const active = i === activeIndex;
    row.classList.toggle("active", active);
    row.setAttribute("aria-selected", String(active));
  });
}

function scrollActiveRowIntoView(): void {
  if (!lsList || activeIndex < 0) return;
  const rows = lsList.querySelectorAll<HTMLElement>(".ls-result-row");
  rows[activeIndex]?.scrollIntoView({ block: "nearest" });
}

// ── File actions ──────────────────────────────────────────────────────────────

async function doOpen(index: number): Promise<void> {
  const file = currentResults[index];
  if (!file) return;
  const prefs = await getLocalSearchPrefs();
  if (!prefs.port || !prefs.token) { showDisconnected(); return; }
  try {
    await companionOpenFile(prefs.port, prefs.token, file.path);
    await recordRecentlyOpened(file.id);
  } catch (err) {
    await handleFileActionError(err);
  }
}

async function doReveal(index: number): Promise<void> {
  const file = currentResults[index];
  if (!file) return;
  const prefs = await getLocalSearchPrefs();
  if (!prefs.port || !prefs.token) { showDisconnected(); return; }
  try {
    await companionOpenFile(prefs.port, prefs.token, file.path, true);
    await recordRecentlyOpened(file.id);
  } catch (err) {
    await handleFileActionError(err);
  }
}

async function handleFileActionError(err: unknown): Promise<void> {
  if (err instanceof CompanionError && err.code === "unauthorized") {
    await setLocalSearchPrefs({ token: undefined });
    showUnauthorized();
  } else {
    showSnackbar({
      message: `Could not open file: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

/** Prepend `id` to recentlyOpened, dedupe, and cap at 30. */
async function recordRecentlyOpened(id: string): Promise<void> {
  const prefs = await getLocalSearchPrefs();
  const existing = prefs.recentlyOpened ?? [];
  const next = [id, ...existing.filter((x) => x !== id)].slice(0, 30);
  await setLocalSearchPrefs({ recentlyOpened: next });
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
}

/**
 * Format a Unix-epoch-seconds timestamp as a human-readable relative time.
 * Falls back to locale date string for dates older than a week.
 */
function formatDate(ts: number): string {
  const date = new Date(ts * 1_000); // companion sends seconds
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}
