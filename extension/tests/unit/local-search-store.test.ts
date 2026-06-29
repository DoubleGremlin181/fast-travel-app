import { describe, it, expect, beforeEach } from "vitest";
import {
  getLocalSearchPrefs,
  setLocalSearchPrefs,
} from "../../src/core/local-search-store.js";

// ── Storage mock (same pattern as auto-ignore-store.test.ts) ─────────────────

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
  (globalThis as unknown as { chrome: unknown }).chrome = { storage: { local: storage } };
  return storage;
}

const STORE_KEY = "fast-travel-local-search-prefs";

// ── Tests ────────────────────────────────────────────────────────────────────

describe("local-search-store", () => {
  let storage: MockStorage;

  beforeEach(() => {
    storage = install();
  });

  // ── Defaults ──────────────────────────────────────────────────────────────

  it("returns defaults when store is empty", async () => {
    const prefs = await getLocalSearchPrefs();
    expect(prefs.enabled).toBe(false);
    expect(prefs.queryMode).toBe("simple");
    expect(prefs.sort).toEqual({ field: "relevance", dir: "desc" });
    expect(prefs.filters).toEqual({});
    expect(prefs.view).toBe("list");
    expect(prefs.token).toBeUndefined();
    expect(prefs.port).toBeUndefined();
  });

  it("enabled defaults to false (opt-in)", async () => {
    const prefs = await getLocalSearchPrefs();
    expect(prefs.enabled).toBe(false);
  });

  it("queryMode default is simple", async () => {
    const prefs = await getLocalSearchPrefs();
    expect(prefs.queryMode).toBe("simple");
  });

  it("sort default is relevance/desc", async () => {
    const prefs = await getLocalSearchPrefs();
    expect(prefs.sort.field).toBe("relevance");
    expect(prefs.sort.dir).toBe("desc");
  });

  it("view default is list", async () => {
    const prefs = await getLocalSearchPrefs();
    expect(prefs.view).toBe("list");
  });

  // ── Merging on write ──────────────────────────────────────────────────────

  it("setLocalSearchPrefs merges: only changed fields update", async () => {
    await setLocalSearchPrefs({ enabled: true, queryMode: "wildcard" });
    const prefs = await getLocalSearchPrefs();
    expect(prefs.enabled).toBe(true);
    expect(prefs.queryMode).toBe("wildcard");
    // Untouched defaults must survive
    expect(prefs.sort).toEqual({ field: "relevance", dir: "desc" });
    expect(prefs.view).toBe("list");
    expect(prefs.filters).toEqual({});
  });

  it("setLocalSearchPrefs returns the merged result", async () => {
    const result = await setLocalSearchPrefs({ enabled: true });
    expect(result.enabled).toBe(true);
    expect(result.queryMode).toBe("simple");
  });

  it("sort is shallow-merged: updating dir preserves field", async () => {
    await setLocalSearchPrefs({ sort: { field: "created", dir: "asc" } });
    await setLocalSearchPrefs({ sort: { field: "created", dir: "desc" } });
    const prefs = await getLocalSearchPrefs();
    expect(prefs.sort.field).toBe("created");
    expect(prefs.sort.dir).toBe("desc");
  });

  it("filters is shallow-merged: adding titleOnly preserves types", async () => {
    await setLocalSearchPrefs({ filters: { types: ["document"] } });
    await setLocalSearchPrefs({ filters: { titleOnly: true } });
    const prefs = await getLocalSearchPrefs();
    expect(prefs.filters.types).toEqual(["document"]);
    expect(prefs.filters.titleOnly).toBe(true);
  });

  // ── Round-trip ────────────────────────────────────────────────────────────

  it("round-trip: set and get preserve all fields", async () => {
    const toSet = {
      enabled: true,
      token: "tok-abc",
      port: 7334,
      queryMode: "regex" as const,
      sort: { field: "modified" as const, dir: "asc" as const },
      filters: { titleOnly: true, types: ["image" as const] },
      view: "grid" as const,
    };
    await setLocalSearchPrefs(toSet);
    const prefs = await getLocalSearchPrefs();
    expect(prefs.enabled).toBe(true);
    expect(prefs.token).toBe("tok-abc");
    expect(prefs.port).toBe(7334);
    expect(prefs.queryMode).toBe("regex");
    expect(prefs.sort).toEqual({ field: "modified", dir: "asc" });
    expect(prefs.filters.titleOnly).toBe(true);
    expect(prefs.filters.types).toEqual(["image"]);
    expect(prefs.view).toBe("grid");
  });

  it("token and port survive a subsequent partial update", async () => {
    await setLocalSearchPrefs({ token: "tok-xyz", port: 7333 });
    await setLocalSearchPrefs({ enabled: true });
    const prefs = await getLocalSearchPrefs();
    expect(prefs.token).toBe("tok-xyz");
    expect(prefs.port).toBe(7333);
    expect(prefs.enabled).toBe(true);
  });

  // ── Storage key ───────────────────────────────────────────────────────────

  it("persists under the correct storage key", async () => {
    await setLocalSearchPrefs({ enabled: true });
    expect(storage._backing[STORE_KEY]).toBeDefined();
    expect((storage._backing[STORE_KEY] as { enabled: boolean }).enabled).toBe(true);
  });

  it("does not write to any other key", async () => {
    await setLocalSearchPrefs({ enabled: true });
    const keys = Object.keys(storage._backing);
    expect(keys).toEqual([STORE_KEY]);
  });
});
