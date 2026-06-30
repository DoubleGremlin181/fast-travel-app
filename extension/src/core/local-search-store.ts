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
  /** Active filters. */
  filters: {
    types?: string[];
    titleOnly?: boolean;
    content?: boolean;
    /** Path prefix filter — only return files under this directory. */
    pathPrefix?: string;
    /** Open-ended date range for file creation date (epoch ms). */
    createdRange?: { from?: number; to?: number };
    /** Open-ended date range for file modified date (epoch ms). */
    modifiedRange?: { from?: number; to?: number };
  };
  /** Results display style. Default "list". */
  view: "list" | "grid";
  /**
   * Capped list of recently-opened file ids (most-recent first, max 30).
   * Passed as SearchRequest.history so the companion can recency-boost them.
   */
  recentlyOpened?: string[];
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
 * `filters` are shallow-merged so callers can update one sub-field at a time
 * (e.g. `{ sort: { field } }` without supplying `dir`).
 * Returns the merged result.
 */
export async function setLocalSearchPrefs(
  partial: Partial<Omit<LocalSearchPrefs, "sort" | "filters">> & {
    sort?: Partial<LocalSearchPrefs["sort"]>;
    filters?: Partial<LocalSearchPrefs["filters"]>;
  },
): Promise<LocalSearchPrefs> {
  const current = await getLocalSearchPrefs();
  // Destructure sort/filters before spreading so the rest is fully type-safe.
  const { sort: partialSort, filters: partialFilters, ...rest } = partial;
  const next: LocalSearchPrefs = {
    ...current,
    ...rest,
    sort: {
      field: partialSort?.field ?? current.sort.field,
      dir: partialSort?.dir ?? current.sort.dir,
    },
    filters: { ...current.filters, ...(partialFilters ?? {}) },
  };
  await chrome.storage.local.set({ [STORE_KEY]: next });
  return next;
}
