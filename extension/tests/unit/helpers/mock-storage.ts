/**
 * Shared chrome.storage.local mock for unit tests.
 *
 * Usage:
 *   import { installMockStorage, type MockStorage } from "./helpers/mock-storage.js";
 *
 *   let storage: MockStorage;
 *   beforeEach(() => { storage = installMockStorage(); });
 */

export function mockStorage(initial: Record<string, unknown> = {}) {
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

export type MockStorage = ReturnType<typeof mockStorage>;

/**
 * Create a fresh storage mock and wire it into globalThis.chrome.storage.local.
 * Call this in beforeEach to get a clean slate for each test.
 */
export function installMockStorage(initial: Record<string, unknown> = {}): MockStorage {
  const storage = mockStorage(initial);
  (globalThis as unknown as { chrome: unknown }).chrome = { storage: { local: storage } };
  return storage;
}
