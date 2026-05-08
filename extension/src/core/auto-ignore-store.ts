/**
 * Device-local store of auto-ignore candidates. Each candidate has a dismissal
 * `count` and a `doNotIgnore` flag that lets the user "pin" a trigger so it
 * won't be auto-added to the ignore list even if the count crosses the
 * auto-ignore threshold.
 *
 * Missing entries imply `count=0, doNotIgnore=false`. An entry is persisted
 * iff `count > 0 || doNotIgnore == true` — any other state is "ineffective"
 * and the entry is deleted.
 *
 * Triggers are stored lowercased; all mutators lowercase input first.
 *
 * Migrates legacy `fast-travel-typo-rejections` (Record<string, number>) on
 * first read into the new `fast-travel-auto-ignore` key (this module's shape).
 * The legacy key is left in place for safety.
 */

export interface AutoIgnoreCandidate {
  count: number;
  doNotIgnore: boolean;
}

export type AutoIgnoreStore = Record<string, AutoIgnoreCandidate>;

const STORE_KEY = "fast-travel-auto-ignore";
const LEGACY_KEY = "fast-travel-typo-rejections";
const THRESHOLD_KEY = "fast-travel-auto-ignore-threshold";

export const AUTO_IGNORE_THRESHOLD_MIN = 1;
export const AUTO_IGNORE_THRESHOLD_MAX = 20;
export const DEFAULT_AUTO_IGNORE_THRESHOLD = 3;

/** True iff this candidate should be persisted (i.e. is not ineffective). */
function isEffective(c: AutoIgnoreCandidate): boolean {
  return c.count > 0 || c.doNotIgnore;
}

/**
 * Read the current store, migrating from the legacy typo-rejections key if
 * needed. If the new key exists it always wins; if only the legacy key has
 * data, convert it (filtering out count <= 0), persist under the new key, and
 * return the converted form. The legacy key is not deleted.
 */
async function readRaw(): Promise<AutoIgnoreStore> {
  const v = await chrome.storage.local.get([STORE_KEY, LEGACY_KEY]);
  const current = v[STORE_KEY] as AutoIgnoreStore | undefined;
  if (current && typeof current === "object") {
    return current;
  }
  const legacy = v[LEGACY_KEY] as Record<string, number> | undefined;
  if (legacy && typeof legacy === "object") {
    const migrated: AutoIgnoreStore = {};
    for (const [trigger, count] of Object.entries(legacy)) {
      if (typeof count !== "number" || count <= 0) continue;
      migrated[trigger.toLowerCase()] = { count, doNotIgnore: false };
    }
    if (Object.keys(migrated).length > 0) {
      await chrome.storage.local.set({ [STORE_KEY]: migrated });
      return migrated;
    }
  }
  return {};
}

async function writeRaw(store: AutoIgnoreStore): Promise<void> {
  await chrome.storage.local.set({ [STORE_KEY]: store });
}

export async function loadCandidates(): Promise<AutoIgnoreStore> {
  return await readRaw();
}

/** Bump the dismissal count by one. Returns the new count. */
export async function incrementCandidate(trigger: string): Promise<number> {
  const key = trigger.toLowerCase();
  const store = await readRaw();
  const existing = store[key];
  const next: AutoIgnoreCandidate = {
    count: (existing?.count ?? 0) + 1,
    doNotIgnore: existing?.doNotIgnore ?? false,
  };
  store[key] = next;
  await writeRaw(store);
  return next.count;
}

/**
 * Decrease the dismissal count by one. If the new count is zero and
 * `doNotIgnore` is false the entry is removed; if `doNotIgnore` is true the
 * entry is kept as `{count:0, doNotIgnore:true}`. No-op when the trigger has
 * no existing entry.
 */
export async function decrementCandidate(trigger: string): Promise<void> {
  const key = trigger.toLowerCase();
  const store = await readRaw();
  const existing = store[key];
  if (!existing) return;
  const nextCount = existing.count - 1;
  if (nextCount > 0) {
    store[key] = { count: nextCount, doNotIgnore: existing.doNotIgnore };
  } else if (existing.doNotIgnore) {
    store[key] = { count: 0, doNotIgnore: true };
  } else {
    delete store[key];
  }
  await writeRaw(store);
}

/**
 * Set the do-not-ignore flag for a trigger, preserving any existing count.
 *
 * - `value=true` on a missing trigger creates `{count:0, doNotIgnore:true}`
 *   (a "pinned but not yet tracked" state that must be representable).
 * - `value=false` on a missing trigger is a no-op.
 * - `value=false` that leaves `{count:0, doNotIgnore:false}` deletes the entry.
 */
export async function setDoNotIgnore(trigger: string, value: boolean): Promise<void> {
  const key = trigger.toLowerCase();
  const store = await readRaw();
  const existing = store[key];
  if (value) {
    const next: AutoIgnoreCandidate = {
      count: existing?.count ?? 0,
      doNotIgnore: true,
    };
    store[key] = next;
  } else {
    if (!existing) return;
    const next: AutoIgnoreCandidate = {
      count: existing.count,
      doNotIgnore: false,
    };
    if (isEffective(next)) {
      store[key] = next;
    } else {
      delete store[key];
    }
  }
  await writeRaw(store);
}

/** Delete both count and do-not-ignore for this trigger. */
export async function removeCandidate(trigger: string): Promise<void> {
  const key = trigger.toLowerCase();
  const store = await readRaw();
  if (!(key in store)) return;
  delete store[key];
  await writeRaw(store);
}

/** Wipe every candidate. */
export async function clearAllCandidates(): Promise<void> {
  await writeRaw({});
}

/** Read the auto-ignore threshold, falling back to the default when unset or invalid. */
export async function getAutoIgnoreThreshold(): Promise<number> {
  const v = await chrome.storage.local.get(THRESHOLD_KEY);
  const n = v[THRESHOLD_KEY];
  return typeof n === "number" &&
    n >= AUTO_IGNORE_THRESHOLD_MIN &&
    n <= AUTO_IGNORE_THRESHOLD_MAX
    ? n
    : DEFAULT_AUTO_IGNORE_THRESHOLD;
}

/** Persist the auto-ignore threshold, clamped to [MIN, MAX]. */
export async function setAutoIgnoreThreshold(n: number): Promise<void> {
  const clamped = Math.min(
    AUTO_IGNORE_THRESHOLD_MAX,
    Math.max(AUTO_IGNORE_THRESHOLD_MIN, Math.round(n)),
  );
  await chrome.storage.local.set({ [THRESHOLD_KEY]: clamped });
}
