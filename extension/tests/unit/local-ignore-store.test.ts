import { describe, it, expect, beforeEach } from "vitest";
import {
  addLocalIgnore,
  loadLocalIgnores,
  removeLocalIgnore,
} from "../../src/core/local-ignore-store.js";

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
  };
}

function install(initial: Record<string, unknown> = {}): void {
  (globalThis as any).chrome = { storage: { local: mockStorage(initial) } };
}

describe("local-ignore-store", () => {
  beforeEach(() => install());

  it("starts empty", async () => {
    expect(await loadLocalIgnores()).toEqual([]);
  });

  it("add stores lowercased and persists", async () => {
    await addLocalIgnore("ScHoLr");
    expect(await loadLocalIgnores()).toEqual(["scholr"]);
  });

  it("add is idempotent and ignores blanks", async () => {
    await addLocalIgnore("dupe");
    await addLocalIgnore("DUPE");
    await addLocalIgnore("   ");
    expect(await loadLocalIgnores()).toEqual(["dupe"]);
  });

  it("remove deletes case-insensitively", async () => {
    await addLocalIgnore("one");
    await addLocalIgnore("two");
    await removeLocalIgnore("ONE");
    expect(await loadLocalIgnores()).toEqual(["two"]);
  });
});
