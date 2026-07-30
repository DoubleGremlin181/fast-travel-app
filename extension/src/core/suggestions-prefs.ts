/**
 * Device-local preferences for the blended-suggestions pipeline (#61).
 * Stored as a single JSON blob in chrome.storage.local with DEFAULTS merged
 * on read, following the auto-ignore-store pattern. Device-local on purpose:
 * includeBrowserHistory is gated on the optional "history" permission, which
 * is granted per device.
 */

export interface SuggestionsPrefs {
  /** Blend matching Fast Travel history entries into typed-query suggestions. */
  blendFtHistory: boolean;
  /** Blend browser history (requires the optional "history" permission). */
  includeBrowserHistory: boolean;
}

const STORE_KEY = "fast-travel-suggestions-prefs";

const DEFAULTS: SuggestionsPrefs = {
  blendFtHistory: true,
  includeBrowserHistory: false,
};

export async function getSuggestionsPrefs(): Promise<SuggestionsPrefs> {
  const v = await chrome.storage.local.get(STORE_KEY);
  return { ...DEFAULTS, ...((v[STORE_KEY] as Partial<SuggestionsPrefs>) ?? {}) };
}

export async function setSuggestionsPrefs(
  partial: Partial<SuggestionsPrefs>,
): Promise<void> {
  const current = await getSuggestionsPrefs();
  await chrome.storage.local.set({ [STORE_KEY]: { ...current, ...partial } });
}

/** Notify on pref changes so already-open newtabs react without a reload. */
export function subscribeSuggestionsPrefs(
  listener: (prefs: SuggestionsPrefs) => void,
): () => void {
  const handler = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area === "local" && changes[STORE_KEY]) {
      listener({
        ...DEFAULTS,
        ...((changes[STORE_KEY].newValue as Partial<SuggestionsPrefs>) ?? {}),
      });
    }
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
