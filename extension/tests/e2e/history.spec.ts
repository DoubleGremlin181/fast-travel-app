import { test, expect } from "./fixtures";

const HISTORY_KEY = "fast-travel-history";

type HistoryEntry = { query: string; commandId: string | null; timestamp: number };

async function seedHistory(
  context: import("@playwright/test").BrowserContext,
  entries: HistoryEntry[],
) {
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker");
  await worker.evaluate(
    ([key, data]) => chrome.storage.local.set({ [key]: data }),
    [HISTORY_KEY, entries] as [string, HistoryEntry[]],
  );
}

/** Open newtab, wait for config to load (chips appear), then re-focus to trigger showHistory. */
async function openNewtabWithHistory(
  context: import("@playwright/test").BrowserContext,
  extensionId: string,
) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);
  // Wait for config to finish loading (chips render after config is available)
  await page.locator(".quick-chip").first().waitFor({ state: "visible", timeout: 5000 });
  // Re-trigger focus so showHistory() runs now that config is ready
  await page.locator("#search-input").blur();
  await page.locator("#search-input").focus();
  return page;
}

test("search bar suggestions deduplicate repeated queries", async ({ context, extensionId }) => {
  await seedHistory(context, [
    { query: "github", commandId: null, timestamp: Date.now() - 1000 },
    { query: "google", commandId: null, timestamp: Date.now() - 2000 },
    { query: "github", commandId: null, timestamp: Date.now() - 3000 },
    { query: "youtube", commandId: null, timestamp: Date.now() - 4000 },
  ]);

  const page = await openNewtabWithHistory(context, extensionId);
  const suggestions = page.locator(".suggestion-history-text");
  await expect(suggestions.first()).toBeVisible();

  const texts = await suggestions.allTextContents();
  const unique = new Set(texts);
  expect(texts.length).toBe(unique.size);

  // "github" appears once despite being in history twice
  expect(texts.filter((t) => t === "github")).toHaveLength(1);
  // order: most recent first, deduplicated
  expect(texts[0]).toBe("github");
  expect(texts[1]).toBe("google");
  expect(texts[2]).toBe("youtube");
});

test("whitespace-only queries are not stored", async ({ context, extensionId }) => {
  // Route through the real addHistory message handler so the production guard
  // is exercised. chrome.runtime.sendMessage from inside the service worker
  // doesn't loop back to the SW's own onMessage listener ("Receiving end does
  // not exist"), so the call has to originate from a regular extension page.
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);
  await page.evaluate(async () => {
    await chrome.runtime.sendMessage({
      type: "addHistory",
      value: { query: "   ", commandId: null, timestamp: Date.now() },
    });
  });

  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker");
  const historyResult: HistoryEntry[] = await worker.evaluate(
    ([key]: [string]) =>
      chrome.storage.local.get(key).then((r: Record<string, HistoryEntry[]>) => r[key] ?? []),
    [HISTORY_KEY] as [string],
  );
  const whitespaceEntries = historyResult.filter((e) => !e.query.trim());
  expect(whitespaceEntries).toHaveLength(0);
});

test("all history entries including duplicates visible in storage", async ({ context }) => {
  const entries: HistoryEntry[] = [
    { query: "github", commandId: null, timestamp: Date.now() - 1000 },
    { query: "google", commandId: null, timestamp: Date.now() - 2000 },
    { query: "github", commandId: null, timestamp: Date.now() - 3000 },
  ];
  await seedHistory(context, entries);

  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker");
  const stored: HistoryEntry[] = await worker.evaluate(
    ([key]: [string]) =>
      chrome.storage.local.get(key).then((r: Record<string, HistoryEntry[]>) => r[key] ?? []),
    [HISTORY_KEY] as [string],
  );

  // Settings should see all 3 entries including both "github" occurrences
  expect(stored).toHaveLength(3);
  expect(stored[0].query).toBe("github");
  expect(stored[1].query).toBe("google");
  expect(stored[2].query).toBe("github");
});
