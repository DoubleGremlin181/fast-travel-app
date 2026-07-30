import { describe, it, expect, beforeEach } from "vitest";
import {
  getSuggestionsPrefs,
  setSuggestionsPrefs,
  subscribeSuggestionsPrefs,
} from "../../src/core/suggestions-prefs.js";

const KEY = "fast-travel-suggestions-prefs";

type Listener = (changes: Record<string, { newValue?: unknown }>, area: string) => void;

function install(initial: Record<string, unknown> = {}) {
  const backing: Record<string, unknown> = { ...initial };
  const listeners: Listener[] = [];
  const local = {
    get: async (keys: string | string[]) => {
      const want = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of want) if (k in backing) out[k] = backing[k];
      return out;
    },
    set: async (obj: Record<string, unknown>) => {
      const changes: Record<string, { newValue?: unknown }> = {};
      for (const [k, v] of Object.entries(obj)) {
        changes[k] = { newValue: v };
        backing[k] = v;
      }
      for (const l of listeners) l(changes, "local");
    },
  };
  (globalThis as any).chrome = {
    storage: {
      local,
      onChanged: {
        addListener: (l: Listener) => listeners.push(l),
        removeListener: (l: Listener) => {
          const i = listeners.indexOf(l);
          if (i >= 0) listeners.splice(i, 1);
        },
      },
    },
  };
  return { backing, listeners };
}

describe("suggestions-prefs", () => {
  beforeEach(() => {
    install();
  });

  it("returns defaults when storage is empty", async () => {
    expect(await getSuggestionsPrefs()).toEqual({
      blendFtHistory: true,
      includeBrowserHistory: false,
    });
  });

  it("merges a partial update over existing prefs", async () => {
    await setSuggestionsPrefs({ includeBrowserHistory: true });
    expect(await getSuggestionsPrefs()).toEqual({
      blendFtHistory: true,
      includeBrowserHistory: true,
    });
  });

  it("merges stored values over defaults on read", async () => {
    install({ [KEY]: { blendFtHistory: false } });
    expect(await getSuggestionsPrefs()).toEqual({
      blendFtHistory: false,
      includeBrowserHistory: false,
    });
  });

  it("notifies subscribers with full prefs when the key changes", async () => {
    const seen: unknown[] = [];
    const unsubscribe = subscribeSuggestionsPrefs((p) => seen.push(p));
    await setSuggestionsPrefs({ blendFtHistory: false });
    expect(seen).toEqual([{ blendFtHistory: false, includeBrowserHistory: false }]);
    unsubscribe();
    await setSuggestionsPrefs({ blendFtHistory: true });
    expect(seen).toHaveLength(1);
  });
});
