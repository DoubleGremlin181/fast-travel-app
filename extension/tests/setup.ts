/**
 * Global test environment setup — runs before any test file's imports are
 * resolved. Provides a minimal chrome stub so modules that access
 * chrome.storage / chrome.storage.onChanged at module load time (e.g.
 * ui/favicon.ts) don't throw in the Node/Vitest environment.
 *
 * Individual tests override chrome.storage.local via installMockStorage() in
 * their beforeEach hooks to get per-test isolation and the _backing inspector.
 */
(globalThis as unknown as Record<string, unknown>).chrome = {
  storage: {
    local: {
      get: async () => ({}),
      set: async () => {},
      remove: async () => {},
    },
    onChanged: {
      addListener: () => {},
      removeListener: () => {},
    },
  },
  runtime: {
    sendMessage: async () => undefined,
  },
};
