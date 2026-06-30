import { describe, it, expect, beforeEach } from "vitest";
import {
  getLocalSearchPrefs,
  setLocalSearchPrefs,
} from "../../src/core/local-search-store.js";
import {
  installMockStorage as install,
  type MockStorage,
} from "./helpers/mock-storage.js";

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
    expect(prefs.caseSensitive).toBe(false);
    expect(prefs.exactPhrase).toBe(false);
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

  // ── caseSensitive + exactPhrase (Phase 6b) ────────────────────────────────

  it("caseSensitive defaults to false", async () => {
    const prefs = await getLocalSearchPrefs();
    expect(prefs.caseSensitive).toBe(false);
  });

  it("exactPhrase defaults to false", async () => {
    const prefs = await getLocalSearchPrefs();
    expect(prefs.exactPhrase).toBe(false);
  });

  it("caseSensitive round-trips through set/get", async () => {
    await setLocalSearchPrefs({ caseSensitive: true });
    const prefs = await getLocalSearchPrefs();
    expect(prefs.caseSensitive).toBe(true);
  });

  it("exactPhrase round-trips through set/get", async () => {
    await setLocalSearchPrefs({ exactPhrase: true });
    const prefs = await getLocalSearchPrefs();
    expect(prefs.exactPhrase).toBe(true);
  });

  it("caseSensitive survives a subsequent unrelated partial update", async () => {
    await setLocalSearchPrefs({ caseSensitive: true });
    await setLocalSearchPrefs({ view: "grid" });
    const prefs = await getLocalSearchPrefs();
    expect(prefs.caseSensitive).toBe(true);
  });

  it("exactPhrase survives a subsequent unrelated partial update", async () => {
    await setLocalSearchPrefs({ exactPhrase: true });
    await setLocalSearchPrefs({ enabled: true });
    const prefs = await getLocalSearchPrefs();
    expect(prefs.exactPhrase).toBe(true);
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
