import { describe, it, expect, beforeEach } from "vitest";
import {
  AUTO_IGNORE_THRESHOLD_MAX,
  AUTO_IGNORE_THRESHOLD_MIN,
  DEFAULT_AUTO_IGNORE_THRESHOLD,
  clearAllCandidates,
  decrementCandidate,
  getAutoIgnoreThreshold,
  incrementCandidate,
  loadCandidates,
  removeCandidate,
  setAutoIgnoreThreshold,
  setDoNotIgnore,
} from "../../src/core/auto-ignore-store.js";

function mockStorage(initial: Record<string, unknown> = {}) {
  const backing: Record<string, unknown> = { ...initial };
  return {
    get: async (keys: string | string[]) => {
      const want = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of want) if (k in backing) out[k] = backing[k];
      return out;
    },
    set: async (obj: Record<string, unknown>) => {
      Object.assign(backing, obj);
    },
    remove: async (k: string | string[]) => {
      for (const key of Array.isArray(k) ? k : [k]) delete backing[key];
    },
    _backing: backing,
  };
}

type MockStorage = ReturnType<typeof mockStorage>;

function install(initial: Record<string, unknown> = {}): MockStorage {
  const storage = mockStorage(initial);
  (globalThis as any).chrome = { storage: { local: storage } };
  return storage;
}

const STORE_KEY = "fast-travel-auto-ignore";
const LEGACY_KEY = "fast-travel-typo-rejections";
const THRESHOLD_KEY = "fast-travel-auto-ignore-threshold";

describe("auto-ignore-store", () => {
  let storage: MockStorage;

  beforeEach(() => {
    storage = install();
  });

  it("empty store → loadCandidates() returns {}", async () => {
    expect(await loadCandidates()).toEqual({});
  });

  it("incrementCandidate(\"fcb\") creates {count:1, doNotIgnore:false}", async () => {
    const count = await incrementCandidate("fcb");
    expect(count).toBe(1);
    expect(await loadCandidates()).toEqual({
      fcb: { count: 1, doNotIgnore: false },
    });
  });

  it("two increments → count=2", async () => {
    await incrementCandidate("fcb");
    const next = await incrementCandidate("fcb");
    expect(next).toBe(2);
    const store = await loadCandidates();
    expect(store.fcb).toEqual({ count: 2, doNotIgnore: false });
  });

  it("decrement on count=1 removes the entry", async () => {
    await incrementCandidate("fcb");
    await decrementCandidate("fcb");
    expect(await loadCandidates()).toEqual({});
  });

  it("decrement with DNI=true → keeps {count:0, doNotIgnore:true}", async () => {
    await incrementCandidate("fcb");
    await setDoNotIgnore("fcb", true);
    await decrementCandidate("fcb");
    expect(await loadCandidates()).toEqual({
      fcb: { count: 0, doNotIgnore: true },
    });
  });

  it("decrement on missing trigger is a no-op", async () => {
    await decrementCandidate("ghost");
    expect(await loadCandidates()).toEqual({});
  });

  it("setDoNotIgnore(\"fcb\", true) preserves existing count", async () => {
    await incrementCandidate("fcb");
    await incrementCandidate("fcb");
    await setDoNotIgnore("fcb", true);
    expect(await loadCandidates()).toEqual({
      fcb: { count: 2, doNotIgnore: true },
    });
  });

  it("setDoNotIgnore(\"new-trigger\", true) creates {count:0, doNotIgnore:true}", async () => {
    await setDoNotIgnore("new-trigger", true);
    expect(await loadCandidates()).toEqual({
      "new-trigger": { count: 0, doNotIgnore: true },
    });
  });

  it("setDoNotIgnore(t, false) on a count=0 DNI-only entry deletes it", async () => {
    await setDoNotIgnore("pinned", true);
    await setDoNotIgnore("pinned", false);
    expect(await loadCandidates()).toEqual({});
  });

  it("removeCandidate(\"fcb\") deletes both count and DNI", async () => {
    await incrementCandidate("fcb");
    await setDoNotIgnore("fcb", true);
    await removeCandidate("fcb");
    expect(await loadCandidates()).toEqual({});
  });

  it("clearAllCandidates() wipes every entry", async () => {
    await incrementCandidate("fcb");
    await incrementCandidate("uk");
    await setDoNotIgnore("pinned", true);
    await clearAllCandidates();
    expect(await loadCandidates()).toEqual({});
  });

  it("case-insensitive: incrementCandidate(\"FcB\") stored as fcb", async () => {
    await incrementCandidate("FcB");
    expect(await loadCandidates()).toEqual({
      fcb: { count: 1, doNotIgnore: false },
    });
  });

  it("migration: legacy typo-rejections converts to new shape and persists to new key", async () => {
    storage = install({ [LEGACY_KEY]: { fcb: 2, uk: 1 } });

    const loaded = await loadCandidates();
    expect(loaded).toEqual({
      fcb: { count: 2, doNotIgnore: false },
      uk: { count: 1, doNotIgnore: false },
    });

    // New key is written; legacy key is left alone.
    expect(storage._backing[STORE_KEY]).toEqual({
      fcb: { count: 2, doNotIgnore: false },
      uk: { count: 1, doNotIgnore: false },
    });
    expect(storage._backing[LEGACY_KEY]).toEqual({ fcb: 2, uk: 1 });
  });

  it("after migration, subsequent incrementCandidate works (reads from new key)", async () => {
    storage = install({ [LEGACY_KEY]: { fcb: 2, uk: 1 } });
    await loadCandidates(); // trigger migration
    const next = await incrementCandidate("fcb");
    expect(next).toBe(3);
    const store = await loadCandidates();
    expect(store.fcb).toEqual({ count: 3, doNotIgnore: false });
    expect(store.uk).toEqual({ count: 1, doNotIgnore: false });
  });

  it("threshold: default 3, round-trip, and clamping to [MIN, MAX]", async () => {
    // Default
    expect(await getAutoIgnoreThreshold()).toBe(DEFAULT_AUTO_IGNORE_THRESHOLD);
    expect(DEFAULT_AUTO_IGNORE_THRESHOLD).toBe(3);

    // Round-trip
    await setAutoIgnoreThreshold(5);
    expect(await getAutoIgnoreThreshold()).toBe(5);
    expect(storage._backing[THRESHOLD_KEY]).toBe(5);

    // Clamp low
    await setAutoIgnoreThreshold(0);
    expect(await getAutoIgnoreThreshold()).toBe(AUTO_IGNORE_THRESHOLD_MIN);
    expect(AUTO_IGNORE_THRESHOLD_MIN).toBe(1);

    // Clamp high
    await setAutoIgnoreThreshold(100);
    expect(await getAutoIgnoreThreshold()).toBe(AUTO_IGNORE_THRESHOLD_MAX);
    expect(AUTO_IGNORE_THRESHOLD_MAX).toBe(20);
  });
});
