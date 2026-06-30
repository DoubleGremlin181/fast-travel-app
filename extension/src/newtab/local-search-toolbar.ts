/**
 * Drive-style results toolbar for the local-search view.
 *
 * Pure, unit-tested exports:
 *   datePresetToRange — converts a named date preset to an epoch-ms range
 *   toggleType        — adds or removes a FileType string in the active set
 *
 * DOM export:
 *   mountToolbar — populates the #ls-toolbar element and returns a
 *                  ToolbarControls handle so the parent can sync it on open.
 */

import type { PingResponse, FileType } from "../core/companion-types.js";
import type { LocalSearchPrefs } from "../core/local-search-store.js";
import { setLocalSearchPrefs } from "../core/local-search-store.js";
import { regexAvailable, contentAvailable } from "../core/local-search-capabilities.js";

// ── Types ────────────────────────────────────────────────────────────────────

export type DatePreset = "any" | "week" | "month" | "year";

// ── Pure helpers (exported + unit-tested) ─────────────────────────────────────

/**
 * Convert a named date preset to an epoch-ms open-ended range, or undefined
 * for "any" (no filter). `now` must be an epoch-millisecond timestamp
 * (e.g. Date.now()).
 */
export function datePresetToRange(
  preset: DatePreset,
  now: number,
): { from: number } | undefined {
  if (preset === "any") return undefined;
  const DAY_MS = 86_400_000;
  if (preset === "week") return { from: now - 7 * DAY_MS };
  if (preset === "month") return { from: now - 30 * DAY_MS };
  return { from: now - 365 * DAY_MS }; // "year"
}

/**
 * Toggle a file-type string in the active types array.
 * If `type` is already present it is removed; otherwise it is appended.
 * Returns a new array — does not mutate the input.
 * An empty result means "all types" (no filter).
 */
export function toggleType(types: string[] | undefined, type: string): string[] {
  const current = types ?? [];
  if (current.includes(type)) {
    return current.filter((t) => t !== type);
  }
  return [...current, type];
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Infer which date preset a stored modifiedRange corresponds to.
 * Uses generous time windows (±1 week extra) to survive session gaps.
 * Returns "any" when no range is set or the age falls outside all bands.
 */
function inferDatePreset(
  modifiedRange: { from?: number; to?: number } | undefined,
  now: number,
): DatePreset {
  if (!modifiedRange?.from) return "any";
  const ageMs = now - modifiedRange.from;
  const DAY = 86_400_000;
  if (ageMs <= 8 * DAY) return "week";
  if (ageMs <= 35 * DAY) return "month";
  return "year";
}

// ── File-type chip definitions ───────────────────────────────────────────────

const FILE_TYPES: Array<{ value: FileType; label: string }> = [
  { value: "document", label: "Doc" },
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
  { value: "archive", label: "Archive" },
  { value: "code", label: "Code" },
  { value: "folder", label: "Folder" },
  { value: "other", label: "Other" },
];

// ── Toolbar controls interface ───────────────────────────────────────────────

export interface ToolbarControls {
  /** Sync all control states to the given prefs + capability ping. */
  sync(prefs: LocalSearchPrefs, ping: PingResponse | null): void;
}

// ── DOM helper ───────────────────────────────────────────────────────────────

function mkEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string> | null,
  ...children: (string | Node)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      e.setAttribute(k, v);
    }
  }
  for (const c of children) {
    if (typeof c === "string") e.appendChild(document.createTextNode(c));
    else e.appendChild(c);
  }
  return e;
}

// ── Toolbar mount ─────────────────────────────────────────────────────────────

/**
 * Populate `container` (the #ls-toolbar element) with the Drive-style toolbar
 * controls. Returns a ToolbarControls handle to sync control state on open.
 *
 * @param container  The #ls-toolbar HTMLElement to populate.
 * @param onReSearch Callback to re-trigger the current search after prefs change.
 */
export function mountToolbar(
  container: HTMLElement,
  onReSearch: () => void,
): ToolbarControls {
  // ── Closure state (kept in sync by the returned sync function) ─────────
  let _types: string[] = [];
  let _sortDir: "asc" | "desc" = "desc";

  // ── Row 1: query-mode segmented control + sort ──────────────────────────

  const mainRow = mkEl("div", { class: "ls-toolbar-row ls-toolbar-main" });

  // -- Query-mode segmented control --

  const modeSeg = mkEl("div", {
    class: "ls-mode-seg",
    role: "group",
    "aria-label": "Query mode",
  });

  const MODE_DEFS: Array<{ value: "simple" | "wildcard" | "regex"; label: string }> = [
    { value: "simple", label: "Simple" },
    { value: "wildcard", label: "Wildcard" },
    { value: "regex", label: "Regex" },
  ];
  const modeBtns: Partial<Record<string, HTMLButtonElement>> = {};

  for (const { value, label } of MODE_DEFS) {
    const btn = mkEl("button", {
      type: "button",
      class: "ls-mode-btn",
      "data-mode": value,
    }, label);
    if (value === "regex") {
      btn.disabled = true;
      btn.title = "Not supported by your indexer";
    }
    btn.addEventListener("click", () => {
      void setLocalSearchPrefs({ queryMode: value }).then(onReSearch);
    });
    modeSeg.appendChild(btn);
    modeBtns[value] = btn;
  }
  mainRow.appendChild(modeSeg);

  // -- Sort: field dropdown + direction toggle --

  const sortWrap = mkEl("div", { class: "ls-sort" });

  const sortFieldSel = mkEl("select", {
    class: "ls-sort-field",
    "aria-label": "Sort by",
  }) as HTMLSelectElement;

  const SORT_FIELD_DEFS: Array<{
    value: "relevance" | "created" | "modified";
    label: string;
  }> = [
    { value: "relevance", label: "Relevance" },
    { value: "created", label: "Date created" },
    { value: "modified", label: "Date modified" },
  ];
  for (const { value, label } of SORT_FIELD_DEFS) {
    sortFieldSel.appendChild(mkEl("option", { value }, label));
  }
  sortFieldSel.addEventListener("change", () => {
    void setLocalSearchPrefs({
      sort: { field: sortFieldSel.value as "relevance" | "created" | "modified" },
    }).then(onReSearch);
  });
  sortWrap.appendChild(sortFieldSel);

  // Direction toggle button (↓ desc / ↑ asc)
  const sortDirBtn = mkEl("button", {
    type: "button",
    class: "ls-sort-dir",
    "aria-label": "Toggle sort direction",
    title: "Sort descending",
  });
  // Down-arrow SVG
  sortDirBtn.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
    ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>' +
    "</svg>";
  sortDirBtn.addEventListener("click", () => {
    const next: "asc" | "desc" = _sortDir === "desc" ? "asc" : "desc";
    _sortDir = next;
    sortDirBtn.title = next === "asc" ? "Sort ascending" : "Sort descending";
    sortDirBtn.classList.toggle("asc", next === "asc");
    void setLocalSearchPrefs({ sort: { dir: next } }).then(onReSearch);
  });
  sortWrap.appendChild(sortDirBtn);

  mainRow.appendChild(sortWrap);
  container.appendChild(mainRow);

  // ── Row 2: type chips, date preset, path input, toggles, clear ─────────

  const filterRow = mkEl("div", { class: "ls-toolbar-row ls-filter-row" });

  // -- Type chips --

  const chipsWrap = mkEl("div", { class: "ls-type-chips" });
  const chipBtns: Partial<Record<FileType, HTMLButtonElement>> = {};

  for (const { value, label } of FILE_TYPES) {
    const chip = mkEl("button", {
      type: "button",
      class: "ls-type-chip",
      "data-type": value,
      title: value.charAt(0).toUpperCase() + value.slice(1),
    }, label);
    chip.addEventListener("click", () => {
      const newTypes = toggleType(_types, value);
      _types = newTypes;
      // Optimistic UI update
      for (const { value: v } of FILE_TYPES) {
        chipBtns[v]?.classList.toggle("active", newTypes.includes(v));
      }
      void setLocalSearchPrefs({
        filters: { types: newTypes.length > 0 ? newTypes : undefined },
      }).then(onReSearch);
    });
    chipsWrap.appendChild(chip);
    chipBtns[value] = chip;
  }
  filterRow.appendChild(chipsWrap);

  // -- Date preset select --

  const dateSel = mkEl("select", {
    class: "ls-date-sel",
    "aria-label": "Date modified filter",
  }) as HTMLSelectElement;

  const DATE_OPTS: Array<{ value: DatePreset; label: string }> = [
    { value: "any", label: "Any time" },
    { value: "week", label: "Past week" },
    { value: "month", label: "Past month" },
    { value: "year", label: "Past year" },
  ];
  for (const { value, label } of DATE_OPTS) {
    dateSel.appendChild(mkEl("option", { value }, label));
  }
  dateSel.addEventListener("change", () => {
    const preset = dateSel.value as DatePreset;
    const range = datePresetToRange(preset, Date.now());
    void setLocalSearchPrefs({ filters: { modifiedRange: range } }).then(onReSearch);
  });
  filterRow.appendChild(dateSel);

  // -- Path prefix input (debounced 400 ms) --

  const pathInput = mkEl("input", {
    type: "text",
    class: "ls-path-input",
    placeholder: "Path…",
    "aria-label": "Filter by path prefix",
  }) as HTMLInputElement;

  let pathTimer: ReturnType<typeof setTimeout> | null = null;
  pathInput.addEventListener("input", () => {
    if (pathTimer !== null) {
      clearTimeout(pathTimer);
      pathTimer = null;
    }
    pathTimer = setTimeout(() => {
      pathTimer = null;
      const v = pathInput.value.trim();
      void setLocalSearchPrefs({ filters: { pathPrefix: v || undefined } }).then(onReSearch);
    }, 400);
  });
  filterRow.appendChild(pathInput);

  // -- Title-only checkbox --

  const titleCheck = mkEl("input", {
    type: "checkbox",
    id: "ls-title-only",
  }) as HTMLInputElement;
  titleCheck.addEventListener("change", () => {
    void setLocalSearchPrefs({
      filters: { titleOnly: titleCheck.checked || undefined },
    }).then(onReSearch);
  });
  const titleLabel = mkEl("label", {
    class: "ls-filter-toggle",
    for: "ls-title-only",
  });
  titleLabel.appendChild(titleCheck);
  titleLabel.appendChild(document.createTextNode(" Title only"));
  filterRow.appendChild(titleLabel);

  // -- Content search checkbox (capability-gated; hidden until ping confirms) --

  const contentCheck = mkEl("input", {
    type: "checkbox",
    id: "ls-content-search",
  }) as HTMLInputElement;
  contentCheck.addEventListener("change", () => {
    void setLocalSearchPrefs({
      filters: { content: contentCheck.checked || undefined },
    }).then(onReSearch);
  });
  const contentLabel = mkEl("label", {
    class: "ls-filter-toggle ls-content-toggle hidden",
    for: "ls-content-search",
  });
  contentLabel.appendChild(contentCheck);
  contentLabel.appendChild(document.createTextNode(" Contents"));
  filterRow.appendChild(contentLabel);

  // -- Clear filters button --

  const clearBtn = mkEl("button", { type: "button", class: "ls-clear-btn" }, "Clear");
  clearBtn.addEventListener("click", () => {
    void setLocalSearchPrefs({
      filters: {
        types: undefined,
        titleOnly: undefined,
        content: undefined,
        pathPrefix: undefined,
        modifiedRange: undefined,
        createdRange: undefined,
      },
    }).then(() => {
      // Reset UI immediately alongside prefs flush
      _types = [];
      _sortDir = _sortDir; // unchanged by clear
      for (const { value } of FILE_TYPES) {
        chipBtns[value]?.classList.remove("active");
      }
      dateSel.value = "any";
      pathInput.value = "";
      titleCheck.checked = false;
      contentCheck.checked = false;
      onReSearch();
    });
  });
  filterRow.appendChild(clearBtn);

  container.appendChild(filterRow);

  // Toolbar is now populated — remove the placeholder aria-hidden.
  container.removeAttribute("aria-hidden");

  // ── sync function ─────────────────────────────────────────────────────────

  function sync(prefs: LocalSearchPrefs, ping: PingResponse | null): void {
    const now = Date.now();

    // Query mode
    for (const { value } of MODE_DEFS) {
      const btn = modeBtns[value];
      if (!btn) continue;
      btn.classList.toggle("active", prefs.queryMode === value);
      if (value === "regex") {
        const ok = ping !== null && regexAvailable(ping);
        btn.disabled = !ok;
        btn.title = ok ? "" : "Not supported by your indexer";
      }
    }

    // Sort field
    sortFieldSel.value = prefs.sort.field;

    // Sort direction
    _sortDir = prefs.sort.dir;
    sortDirBtn.title = _sortDir === "asc" ? "Sort ascending" : "Sort descending";
    sortDirBtn.classList.toggle("asc", _sortDir === "asc");

    // Type chips
    _types = prefs.filters.types ?? [];
    for (const { value } of FILE_TYPES) {
      chipBtns[value]?.classList.toggle("active", _types.includes(value));
    }

    // Date preset
    dateSel.value = inferDatePreset(prefs.filters.modifiedRange, now);

    // Path prefix
    pathInput.value = prefs.filters.pathPrefix ?? "";

    // Title only
    titleCheck.checked = prefs.filters.titleOnly === true;

    // Content toggle: visibility gated by capability, state from prefs
    const showContent = ping !== null && contentAvailable(ping);
    contentLabel.classList.toggle("hidden", !showContent);
    contentCheck.checked = prefs.filters.content === true;
  }

  return { sync };
}
