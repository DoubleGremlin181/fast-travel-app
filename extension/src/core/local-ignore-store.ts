/**
 * Device-local list of triggers the user has chosen to permanently ignore for
 * typo detection.
 *
 * Deliberately kept OUT of the config document: the ignore list is a personal,
 * per-device preference, not shared command config. Storing user ignores here
 * (instead of in `config.ignoreList`) means adding/removing one never marks the
 * config dirty and never pauses remote auto-refresh. Entries are merged into the
 * effective ignore list at parse time by `effectiveIgnoreList`, alongside the
 * config's baseline ignoreList and the auto-ignore candidates.
 *
 * Triggers are stored lowercased; all mutators lowercase input first.
 */

const STORE_KEY = "fast-travel-local-ignore";

async function readRaw(): Promise<string[]> {
  const v = await chrome.storage.local.get(STORE_KEY);
  const list = v[STORE_KEY];
  return Array.isArray(list)
    ? (list as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
}

/** All locally-ignored triggers (lowercased). */
export async function loadLocalIgnores(): Promise<string[]> {
  return await readRaw();
}

/** Add `trigger` (lowercased). No-op for blank input or an existing entry. */
export async function addLocalIgnore(trigger: string): Promise<void> {
  const t = trigger.trim().toLowerCase();
  if (!t) return;
  const list = await readRaw();
  if (list.includes(t)) return;
  await chrome.storage.local.set({ [STORE_KEY]: [...list, t] });
}

/** Remove `trigger` if present (case-insensitive). */
export async function removeLocalIgnore(trigger: string): Promise<void> {
  const t = trigger.trim().toLowerCase();
  const list = await readRaw();
  if (!list.includes(t)) return;
  await chrome.storage.local.set({ [STORE_KEY]: list.filter((x) => x !== t) });
}
