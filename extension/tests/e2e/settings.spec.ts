import { test, expect } from "./fixtures";

test("settings: sidebar has 6 items in correct order", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/options.html`);
  const links = page.locator(".sidebar-link");
  await expect(links).toHaveCount(6);
  const texts = await links.allTextContents();
  const trimmed = texts.map(t => t.trim());
  expect(trimmed).toEqual(["Appearance", "Configuration", "Ignore list", "History", "Set as default", "About"]);
});

test("settings: Configuration screen shows Commands, Groups, Default command, Import/Export", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/options.html#/configuration`);
  // Nav rows are role="button" divs containing a <span> with the label text
  await expect(page.locator('.nav-list-item span', { hasText: "Commands" })).toBeVisible();
  await expect(page.locator('.nav-list-item span', { hasText: "Groups" })).toBeVisible();
  await expect(page.locator('label[for="default-cmd"]')).toBeVisible();
  await expect(page.locator('.nav-list-item span', { hasText: "Import / Export" })).toBeVisible();
});

test("settings: clicking Commands in Configuration navigates to commands list", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/options.html#/configuration`);
  await page.locator('.nav-list-item', { hasText: "Commands" }).first().click();
  await expect(page).toHaveURL(/.*#\/commands$/);
});

test("settings: Import/Export link navigates to import-export screen", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/options.html#/configuration`);
  await page.locator('.nav-list-item', { hasText: "Import / Export" }).click();
  await expect(page).toHaveURL(/.*#\/import-export$/);
  // File + URL import are now merged into a single "Import" card (Android parity).
  await expect(page.locator(".card-header", { hasText: /^Import$/ })).toBeVisible();
  await expect(page.locator(".card-header", { hasText: "Export" })).toBeVisible();
  // The "Clear icon cache" action has been removed.
  await expect(page.locator(".card-header", { hasText: "Icon cache" })).toHaveCount(0);
  await expect(page.locator("button", { hasText: "Clear icon cache" })).toHaveCount(0);
});

test("settings: Import/Export prefills the config URL and hides Reset when synced", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/options.html#/import-export`);

  // The URL field is prefilled with the default config URL (editable), like Android.
  const urlInput = page.locator('input[type="url"]');
  await expect(urlInput).toHaveValue(/raw\.githubusercontent\.com.*default-config\.json/);

  // With no local edits, "Reset to remote" is not offered.
  await expect(page.locator("button", { hasText: "Reset to remote" })).toHaveCount(0);
});

test("settings: local edits surface 'auto-refresh paused' and offer Reset to remote", async ({
  context,
  extensionId,
}) => {
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker");
  // Simulate a prior local edit having set the dirty flag.
  await worker.evaluate(() =>
    chrome.storage.local.set({ "fast-travel-config-dirty": true }),
  );

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/options.html#/import-export`);

  await expect(page.locator(".status", { hasText: "auto-refresh paused" })).toBeVisible();
  await expect(page.locator("button", { hasText: "Reset to remote" })).toBeVisible();

  // The Configuration screen surfaces the same paused state on the nav row.
  await page.goto(`chrome-extension://${extensionId}/options/options.html#/configuration`);
  await expect(
    page.locator(".nav-list-item-subtitle", { hasText: "auto-refresh paused" }),
  ).toBeVisible();

  // Clean up so the flag doesn't leak into other tests sharing the context.
  await worker.evaluate(() =>
    chrome.storage.local.remove("fast-travel-config-dirty"),
  );
});
