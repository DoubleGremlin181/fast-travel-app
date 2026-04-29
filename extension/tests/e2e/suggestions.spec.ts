import { test, expect } from "./fixtures";

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
