import { describe, it, expect } from "vitest";
import { applyBrowserHistoryToggle } from "../../src/options/screens/suggestions.js";

function deps(overrides: Partial<{
  request: () => Promise<boolean>;
  setPrefs: (p: Record<string, boolean>) => Promise<void>;
}> = {}) {
  const calls: { requested: number; prefs: Record<string, boolean>[] } = {
    requested: 0,
    prefs: [],
  };
  return {
    calls,
    request:
      overrides.request ??
      (async () => {
        calls.requested++;
        return true;
      }),
    setPrefs:
      overrides.setPrefs ??
      (async (p: Record<string, boolean>) => {
        calls.prefs.push(p);
      }),
  };
}

describe("applyBrowserHistoryToggle", () => {
  it("enabling: grant → prefs set, resolves true", async () => {
    const d = deps();
    const result = await applyBrowserHistoryToggle(true, d);
    expect(result).toBe(true);
    expect(d.calls.prefs).toEqual([{ includeBrowserHistory: true }]);
  });

  it("enabling: deny → prefs untouched, resolves false", async () => {
    const d = deps({ request: async () => false });
    const result = await applyBrowserHistoryToggle(true, d);
    expect(result).toBe(false);
    expect(d.calls.prefs).toEqual([]);
  });

  it("disabling: prefs set false without requesting the permission", async () => {
    const d = deps();
    const result = await applyBrowserHistoryToggle(false, d);
    expect(result).toBe(false);
    expect(d.calls.requested).toBe(0);
    expect(d.calls.prefs).toEqual([{ includeBrowserHistory: false }]);
  });
});
