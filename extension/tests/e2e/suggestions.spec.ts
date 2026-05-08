import { test, expect } from "./fixtures";

const HISTORY_KEY = "fast-travel-history";

async function mockGoogleSuggest(
  page: import("@playwright/test").Page,
  suggestions: string[],
) {
  // OpenSearch format: [query, [suggestions], ...]
  await page.route("**/suggestqueries.google.com/**", async (route) => {
    const url = new URL(route.request().url());
    const q = url.searchParams.get("q") ?? "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([q, suggestions]),
    });
  });
}

test("suggestions: newtab input is visible and accepts text", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);
  const input = page.locator("#search-input");
  await expect(input).toBeVisible();
  await input.fill("hello");
  await expect(input).toHaveValue("hello");
});

test("suggestions: typing a command prefix shows suggestions dropdown", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);
  // Wait for config to load (chips appear after config is ready)
  await page.locator(".quick-chip").first().waitFor({ state: "visible", timeout: 5000 });

  const input = page.locator("#search-input");
  // Type "g " — matches the Google command; suggestions dropdown should appear.
  await input.fill("g hello world");

  // The input should still be visible and contain the typed value.
  await expect(input).toBeVisible();
  await expect(input).toHaveValue("g hello world");

  // The suggestions dropdown should now be visible (hidden class removed by renderSuggestions).
  await expect(page.locator("#suggestions-dropdown")).not.toHaveClass(/hidden/);
});

test("suggestions: typing a query with no matching command prefix does not crash", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);
  await page.locator(".quick-chip").first().waitFor({ state: "visible", timeout: 5000 });

  const input = page.locator("#search-input");
  // Use a prefix that won't match any built-in command trigger.
  await input.fill("zzznomatch hello");

  // The input must remain visible — no JS error caused a page crash.
  await expect(input).toBeVisible();
  await expect(input).toHaveValue("zzznomatch hello");
});

test("suggestions: long API suggestion gets tail-visible class", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  const longSuggestion = "abcdefghij".repeat(30); // 300 chars — well past any reasonable width
  await mockGoogleSuggest(page, [longSuggestion]);

  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);
  await page.locator(".quick-chip").first().waitFor({ state: "visible", timeout: 5000 });

  await page.locator("#search-input").fill("g hello");

  const apiText = page.locator(".suggestion-api .suggestion-text").first();
  await expect(apiText).toBeVisible();
  await expect(apiText).toHaveClass(/tail-visible/);
});

test("suggestions: short API suggestion does not get tail-visible class", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await mockGoogleSuggest(page, ["short"]);

  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);
  await page.locator(".quick-chip").first().waitFor({ state: "visible", timeout: 5000 });

  await page.locator("#search-input").fill("g hi");

  const apiText = page.locator(".suggestion-api .suggestion-text").first();
  await expect(apiText).toBeVisible();
  // Wait for the rAF-deferred toggle to settle.
  await page.waitForTimeout(50);
  const classes = (await apiText.getAttribute("class")) ?? "";
  expect(classes).not.toContain("tail-visible");
});

test("suggestions: long history items never get tail-visible class", async ({
  context,
  extensionId,
}) => {
  const longQuery = "history-".repeat(40); // 320 chars — guaranteed overflow
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker");
  await worker.evaluate(
    ([key, data]) => chrome.storage.local.set({ [key]: data }),
    [
      HISTORY_KEY,
      [{ query: longQuery, commandId: null, timestamp: Date.now() }],
    ] as [string, Array<{ query: string; commandId: string | null; timestamp: number }>],
  );

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);
  await page.locator(".quick-chip").first().waitFor({ state: "visible", timeout: 5000 });
  await page.locator("#search-input").blur();
  await page.locator("#search-input").focus();

  const historyText = page.locator(".suggestion-history-text").first();
  await expect(historyText).toBeVisible();
  const classes = (await historyText.getAttribute("class")) ?? "";
  expect(classes).not.toContain("tail-visible");
});
