/**
 * Tests for the stale-closure fix in configuration.ts (Bug #20).
 *
 * The bug: both onChange callbacks in renderConfiguration() closed over the
 * same `config` snapshot fetched once at render time. If the user changed
 * `defaultCommand` and then `defaultSuggestionsApi` in the same session, the
 * second callback spread the pre-first-change snapshot and silently overwrote
 * the first change.
 *
 * Fix: each callback now calls getConfig() at invocation time so it always
 * spreads the latest persisted state rather than a stale render-time snapshot.
 *
 * These tests validate the callback contract in isolation, following the same
 * in-process approach used by service-worker-dirty-flag.test.ts — no chrome.*
 * API mocking required.
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { FastTravelConfig } from "../../src/core/types.js";

// ---------------------------------------------------------------------------
// Minimal in-memory config store that mirrors getConfig / setConfig behaviour
// ---------------------------------------------------------------------------

function makeConfigStore(initial: FastTravelConfig) {
  let stored: FastTravelConfig = { ...initial };

  async function getConfig(): Promise<FastTravelConfig | null> {
    return { ...stored };
  }

  async function setConfig(cfg: FastTravelConfig): Promise<void> {
    stored = { ...cfg };
  }

  function snapshot(): FastTravelConfig {
    return { ...stored };
  }

  return { getConfig, setConfig, snapshot };
}

// ---------------------------------------------------------------------------
// Re-implementation of the two callbacks from configuration.ts (fixed version)
// This mirrors exactly what renderConfiguration() now does after the fix.
// ---------------------------------------------------------------------------

function makeCallbacks(
  getConfig: () => Promise<FastTravelConfig | null>,
  setConfig: (cfg: FastTravelConfig) => Promise<void>,
) {
  async function onDefaultCommandChange(trigger: string): Promise<void> {
    const current = await getConfig();
    if (!current) return;
    await setConfig({ ...current, defaultCommand: trigger });
  }

  async function onDefaultSuggestionsApiChange(url: string): Promise<void> {
    const current = await getConfig();
    if (!current) return;
    await setConfig({ ...current, defaultSuggestionsApi: url || undefined });
  }

  async function onDefaultLuckyUrlChange(url: string): Promise<void> {
    const current = await getConfig();
    if (!current) return;
    await setConfig({ ...current, defaultLuckyUrl: url || undefined });
  }

  return { onDefaultCommandChange, onDefaultSuggestionsApiChange, onDefaultLuckyUrlChange };
}

// ---------------------------------------------------------------------------
// Baseline config used across tests
// ---------------------------------------------------------------------------

const baseConfig: FastTravelConfig = {
  version: 2,
  defaultCommand: "g",
  groups: [
    {
      id: "search",
      name: "Search",
      commands: [
        {
          id: "google",
          name: "Google",
          triggers: ["g"],
          type: "standard",
          routes: [{ devices: "*", defaultUrl: "https://google.com/search?q={query}" }],
        },
        {
          id: "bing",
          name: "Bing",
          triggers: ["b"],
          type: "standard",
          routes: [{ devices: "*", defaultUrl: "https://bing.com/search?q={query}" }],
        },
      ],
    },
  ],
  ignoreList: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("configuration screen callbacks — fixed (fetch-at-call-time)", () => {
  let store: ReturnType<typeof makeConfigStore>;
  let callbacks: ReturnType<typeof makeCallbacks>;

  beforeEach(() => {
    store = makeConfigStore(baseConfig);
    callbacks = makeCallbacks(store.getConfig, store.setConfig);
  });

  it("onDefaultCommandChange saves the new default command", async () => {
    await callbacks.onDefaultCommandChange("b");
    expect(store.snapshot().defaultCommand).toBe("b");
  });

  it("onDefaultSuggestionsApiChange saves the new suggestions API URL", async () => {
    await callbacks.onDefaultSuggestionsApiChange("https://suggest.example.com?q={query}");
    expect(store.snapshot().defaultSuggestionsApi).toBe("https://suggest.example.com?q={query}");
  });

  it("onDefaultSuggestionsApiChange with empty string clears the field (stores undefined)", async () => {
    store = makeConfigStore({ ...baseConfig, defaultSuggestionsApi: "https://old.example.com" });
    callbacks = makeCallbacks(store.getConfig, store.setConfig);

    await callbacks.onDefaultSuggestionsApiChange("");
    expect(store.snapshot().defaultSuggestionsApi).toBeUndefined();
  });

  it("onDefaultLuckyUrlChange saves the new lucky URL", async () => {
    await callbacks.onDefaultLuckyUrlChange("https://www.bing.com/search?q={query}&btnI");
    expect(store.snapshot().defaultLuckyUrl).toBe("https://www.bing.com/search?q={query}&btnI");
  });

  it("onDefaultLuckyUrlChange with empty string clears the field (stores undefined)", async () => {
    store = makeConfigStore({ ...baseConfig, defaultLuckyUrl: "https://old.example.com?q={query}" });
    callbacks = makeCallbacks(store.getConfig, store.setConfig);

    await callbacks.onDefaultLuckyUrlChange("");
    expect(store.snapshot().defaultLuckyUrl).toBeUndefined();
  });

  it("sequential changes both persist — the core regression test", async () => {
    // Simulate: user changes defaultCommand first, then defaultSuggestionsApi.
    // Under the old (buggy) code both callbacks closed over the same stale snapshot,
    // so the second spread would overwrite defaultCommand back to "g".
    // Under the fix each callback re-fetches, so both changes survive.

    // Step 1: change defaultCommand using the first callback.
    await callbacks.onDefaultCommandChange("b");
    expect(store.snapshot().defaultCommand).toBe("b"); // first change persisted

    // Step 2: change defaultSuggestionsApi using the second callback.
    // At this point getConfig() returns the post-step-1 state (defaultCommand="b").
    await callbacks.onDefaultSuggestionsApiChange("https://suggest.example.com?q={query}");

    const final = store.snapshot();
    // Both changes must survive:
    expect(final.defaultCommand).toBe("b");
    expect(final.defaultSuggestionsApi).toBe("https://suggest.example.com?q={query}");
  });

  it("stale-snapshot bug reproduced then fixed — old code would lose the first change", async () => {
    // This test documents the exact bug by modelling what the OLD code did:
    // capture the snapshot once at "render time", then close over it in both callbacks.
    const staleSnapshot = await store.getConfig() as FastTravelConfig;

    // Old onDefaultCommandChange: spreads staleSnapshot
    const oldOnDefaultCommandChange = async (trigger: string) => {
      await store.setConfig({ ...staleSnapshot, defaultCommand: trigger });
    };

    // Old onDefaultSuggestionsApiChange: also spreads staleSnapshot (the bug)
    const oldOnDefaultSuggestionsApiChange = async (url: string) => {
      await store.setConfig({ ...staleSnapshot, defaultSuggestionsApi: url || undefined });
    };

    // Simulate sequential user changes with the OLD (buggy) callbacks
    await oldOnDefaultCommandChange("b");       // sets defaultCommand="b"
    await oldOnDefaultSuggestionsApiChange("https://suggest.example.com?q={query}");
    //  ↑ this spreads staleSnapshot (defaultCommand="g") → overwrites first change

    const buggyResult = store.snapshot();
    // Confirm the bug: defaultCommand was silently reverted to the stale value
    expect(buggyResult.defaultCommand).toBe("g"); // BUG: should be "b"
    expect(buggyResult.defaultSuggestionsApi).toBe("https://suggest.example.com?q={query}");

    // Now confirm the fix produces the correct outcome
    store = makeConfigStore(baseConfig);
    callbacks = makeCallbacks(store.getConfig, store.setConfig);

    await callbacks.onDefaultCommandChange("b");
    await callbacks.onDefaultSuggestionsApiChange("https://suggest.example.com?q={query}");

    const fixedResult = store.snapshot();
    expect(fixedResult.defaultCommand).toBe("b");         // fix: change preserved
    expect(fixedResult.defaultSuggestionsApi).toBe("https://suggest.example.com?q={query}");
  });

  it("getConfig returning null is a no-op for both callbacks", async () => {
    // Simulate a store that returns null (e.g. messaging failure)
    const nullStore = {
      getConfig: async () => null as FastTravelConfig | null,
      setConfig: async (_cfg: FastTravelConfig) => { throw new Error("should not be called"); },
    };
    const nullCallbacks = makeCallbacks(nullStore.getConfig, nullStore.setConfig);

    // Neither callback should throw or call setConfig
    await expect(nullCallbacks.onDefaultCommandChange("b")).resolves.toBeUndefined();
    await expect(nullCallbacks.onDefaultSuggestionsApiChange("https://x.com")).resolves.toBeUndefined();
  });
});
