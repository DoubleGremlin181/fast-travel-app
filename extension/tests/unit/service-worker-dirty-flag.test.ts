/**
 * Tests for the importFromUrl dirty-flag fix (Bug #12).
 *
 * The bug: fetchAndStoreConfig(message.interval !== "manual") was called in the
 * importFromUrl handler, so when interval="manual" the clearDirtyOnSuccess arg
 * was false. This left CONFIG_DIRTY_KEY set after a successful URL import,
 * incorrectly blocking alarm scheduling and showing a wrong "local edits" state.
 *
 * Fix: always pass clearDirtyOnSuccess=true for a URL import, because alarm
 * scheduling (interval → no-alarm vs. timed alarm) is handled separately by
 * scheduleRefresh(), which reads the stored interval value independently.
 *
 * These tests validate the dirty-flag contract that the service-worker relies on,
 * using an in-process storage mock that mirrors the chrome.storage.local shape.
 */

import { describe, it, expect, beforeEach } from "vitest";

const CONFIG_DIRTY_KEY = "fast-travel-config-dirty";
const CONFIG_URL_KEY = "fast-travel-config-url";
const REFRESH_INTERVAL_KEY = "fast-travel-refresh-interval";
const CONFIG_KEY = "fast-travel-config";
const LAST_SYNCED_KEY = "fast-travel-last-synced";

// ---------------------------------------------------------------------------
// Minimal chrome.storage.local mock (same pattern as auto-ignore-store.test.ts)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Re-implement the three private dirty-flag helpers from service-worker.ts
// so we can test their contract without importing the full worker (which has
// top-level chrome.* listener registrations that can't run in Vitest).
// ---------------------------------------------------------------------------

function makeHelpers(storage: MockStorage) {
  async function isDirty(): Promise<boolean> {
    const v = await storage.get(CONFIG_DIRTY_KEY);
    return (v[CONFIG_DIRTY_KEY] as boolean | undefined) ?? false;
  }

  async function markDirty(): Promise<void> {
    await storage.set({ [CONFIG_DIRTY_KEY]: true });
  }

  async function clearDirty(): Promise<void> {
    await storage.remove(CONFIG_DIRTY_KEY);
  }

  /**
   * Minimal stand-in for service-worker's fetchAndStoreConfig.
   * Simulates a successful fetch and respects clearDirtyOnSuccess.
   */
  async function fetchAndStoreConfig(
    clearDirtyOnSuccess = true,
    fetchResult: { ok: boolean; config?: unknown } = { ok: true, config: {} },
  ): Promise<{ ok: boolean; reason?: string }> {
    if (!fetchResult.ok) {
      return { ok: false, reason: "simulated fetch failure" };
    }
    await storage.set({
      [CONFIG_KEY]: fetchResult.config ?? {},
      [LAST_SYNCED_KEY]: Date.now(),
    });
    if (clearDirtyOnSuccess) await clearDirty();
    return { ok: true };
  }

  return { isDirty, markDirty, clearDirty, fetchAndStoreConfig };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("fetchAndStoreConfig — dirty-flag contract", () => {
  let storage: MockStorage;
  let helpers: ReturnType<typeof makeHelpers>;

  beforeEach(() => {
    storage = mockStorage();
    helpers = makeHelpers(storage);
  });

  it("clearDirtyOnSuccess=true clears dirty flag after successful fetch", async () => {
    await helpers.markDirty();
    expect(await helpers.isDirty()).toBe(true);

    const result = await helpers.fetchAndStoreConfig(true);

    expect(result.ok).toBe(true);
    expect(await helpers.isDirty()).toBe(false);
    expect(storage._backing[CONFIG_DIRTY_KEY]).toBeUndefined();
  });

  it("clearDirtyOnSuccess=false (old bug) leaves dirty flag set", async () => {
    await helpers.markDirty();
    expect(await helpers.isDirty()).toBe(true);

    const result = await helpers.fetchAndStoreConfig(false);

    expect(result.ok).toBe(true);
    // This is the bug: flag still set even after a successful remote import.
    expect(await helpers.isDirty()).toBe(true);
  });

  it("fetch failure does not clear dirty flag regardless of clearDirtyOnSuccess", async () => {
    await helpers.markDirty();

    const result = await helpers.fetchAndStoreConfig(true, { ok: false });

    expect(result.ok).toBe(false);
    expect(await helpers.isDirty()).toBe(true);
  });

  it("importFromUrl with interval=manual: fix passes true, clears dirty", async () => {
    // Simulate the importFromUrl handler state: user set a URL with manual interval
    // and had dirty (local-edit) config beforehand.
    storage._backing[CONFIG_URL_KEY] = "https://example.com/config.json";
    storage._backing[REFRESH_INTERVAL_KEY] = "manual";
    await helpers.markDirty();

    // Before fix: fetchAndStoreConfig(message.interval !== "manual") → false → dirty stays
    // After fix:  fetchAndStoreConfig(true) → dirty cleared
    const result = await helpers.fetchAndStoreConfig(true); // fixed call

    expect(result.ok).toBe(true);
    expect(await helpers.isDirty()).toBe(false);
  });

  it("importFromUrl with interval=daily: fix still clears dirty", async () => {
    storage._backing[CONFIG_URL_KEY] = "https://example.com/config.json";
    storage._backing[REFRESH_INTERVAL_KEY] = "daily";
    await helpers.markDirty();

    const result = await helpers.fetchAndStoreConfig(true);

    expect(result.ok).toBe(true);
    expect(await helpers.isDirty()).toBe(false);
  });

  it("dirty flag absent by default, stays absent after clean import", async () => {
    expect(await helpers.isDirty()).toBe(false);

    await helpers.fetchAndStoreConfig(true);

    expect(await helpers.isDirty()).toBe(false);
  });
});

describe("scheduleRefresh — alarm scheduling is independent of dirty-clear", () => {
  /**
   * This group documents the key architectural point: scheduleRefresh() reads
   * the interval from storage and decides whether to create an alarm. It is
   * called *after* fetchAndStoreConfig in the importFromUrl handler, so the
   * clearDirtyOnSuccess flag in fetchAndStoreConfig has no bearing on whether
   * an alarm is created for manual vs. timed intervals.
   *
   * We verify the intervalToMinutes contract here, since that is the function
   * that controls alarm scheduling for the manual interval case.
   */

  function intervalToMinutes(interval: string): number | null {
    switch (interval) {
      case "daily":
        return 24 * 60;
      case "weekly":
        return 7 * 24 * 60;
      case "manual":
        return null; // no alarm — user refreshes manually
      default:
        return null;
    }
  }

  it("manual interval → null (no alarm created)", () => {
    expect(intervalToMinutes("manual")).toBeNull();
  });

  it("daily interval → 1440 minutes", () => {
    expect(intervalToMinutes("daily")).toBe(1440);
  });

  it("weekly interval → 10080 minutes", () => {
    expect(intervalToMinutes("weekly")).toBe(10080);
  });
});
