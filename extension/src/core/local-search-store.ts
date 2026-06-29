/**
 * Device-local store for local-search settings. Mirrors the auto-ignore-store
 * pattern: direct chrome.storage.local calls, no message passing, sane
 * defaults applied on every read, partial-merge on write.
 *
 * Key: "fast-travel-local-search-prefs"
 * Default: enabled=false so users opt in explicitly.
 */

export interface LocalSearchPrefs {
  /** Whether the local-search feature is enabled. Default false — opt-in. */
  enabled: boolean;
  /** Bearer token obtained after pairing. Absent until paired. */
  token?: string;
  /** Last known companion port. Absent until a successful discover(). */
  port?: number;
  /** Query parsing mode sent to the companion. Default "simple". */
  queryMode: "simple" | "wildcard" | "regex";
  /** Result sort order. Default relevance/desc. */
  sort: { field: "relevance" | "created" | "modified"; dir: "asc" | "desc" };
  /** Active filters. Minimal defaults; Phase 3 extends with more fields. */
  filters: { types?: string[]; titleOnly?: boolean };
  /** Results display style. Default "list". */
  view: "list" | "grid";
}

const STORE_KEY = "fast-travel-local-search-prefs";

const DEFAULTS: LocalSearchPrefs = {
  enabled: false,
  queryMode: "simple",
  sort: { field: "relevance", dir: "desc" },
  filters: {},
  view: "list",
};

/**
 * Read the current local-search prefs, merging stored values over defaults.
 * Always returns a fully-populated object — callers never need null checks.
 */
export async function getLocalSearchPrefs(): Promise<LocalSearchPrefs> {
  const v = await chrome.storage.local.get(STORE_KEY);
  const stored = v[STORE_KEY] as Partial<LocalSearchPrefs> | undefined;
  if (!stored || typeof stored !== "object") {
    return { ...DEFAULTS, filters: { ...DEFAULTS.filters }, sort: { ...DEFAULTS.sort } };
  }
  return {
    ...DEFAULTS,
    ...stored,
    sort: { ...DEFAULTS.sort, ...(stored.sort ?? {}) },
    filters: { ...DEFAULTS.filters, ...(stored.filters ?? {}) },
  };
}

/**
 * Merge `partial` into the current prefs and persist. Nested `sort` and
 * `filters` are shallow-merged so callers can update one sub-field at a time.
 * Returns the merged result.
 */
export async function setLocalSearchPrefs(
  partial: Partial<LocalSearchPrefs>,
): Promise<LocalSearchPrefs> {
  const current = await getLocalSearchPrefs();
  const next: LocalSearchPrefs = {
    ...current,
    ...partial,
    sort: { ...current.sort, ...(partial.sort ?? {}) },
    filters: { ...current.filters, ...(partial.filters ?? {}) },
  };
  await chrome.storage.local.set({ [STORE_KEY]: next });
  return next;
}
