import { test, expect } from "./fixtures";

const HISTORY_KEY = "fast-travel-history";

// Regression for the unnecessary scrollbar (issue #2): a full recent-history
// list (8 items + separator + "Clear history") measured 431px against a 420px
// cap, so it showed a thin vertical scrollbar. The cap now fits that bounded
// list and overflow-x is pinned to hidden.
test("recent-history dropdown does not show a scrollbar for a full 8-item list", async ({
  context,
  extensionId,
}) => {
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker");
  const now = Date.now();
  const entries = Array.from({ length: 8 }, (_, i) => ({
    query: `history query number ${i}`,
    commandId: null,
    timestamp: now - i * 1000,
  }));
  await worker.evaluate(
    ([key, data]) => chrome.storage.local.set({ [key]: data }),
    [HISTORY_KEY, entries] as [string, typeof entries],
  );

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);
  await page.locator(".quick-chip").first().waitFor({ state: "visible", timeout: 5000 });
  await page.locator("#search-input").blur();
  await page.locator("#search-input").focus();
  await page.locator(".suggestion-history-text").first().waitFor({ state: "visible" });
  await page.waitForTimeout(300); // let the dropdown-in animation settle

  const scroll = await page.locator("#suggestions-dropdown").evaluate((el) => ({
    vScroll: el.scrollHeight > el.clientHeight,
    hScroll: el.scrollWidth > el.clientWidth,
    itemCount: el.querySelectorAll(".suggestion-item").length,
  }));

  expect(scroll.itemCount).toBe(8);
  expect(scroll.vScroll).toBe(false);
  expect(scroll.hScroll).toBe(false);
});
