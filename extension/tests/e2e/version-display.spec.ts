import { test, expect } from "./fixtures";

// The popup and options-sidebar version labels are populated at runtime from
// chrome.runtime.getManifest().version. They used to be hardcoded strings the
// release bump script didn't know about, and shipped showing a stale 2.0.0.

test("options sidebar shows the manifest version", async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  const version = await sw.evaluate(() => chrome.runtime.getManifest().version);

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/options.html`);
  await expect(page.locator(".sidebar-version")).toHaveText(`v${version}`);
});

test("popup shows the manifest version", async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  const version = await sw.evaluate(() => chrome.runtime.getManifest().version);

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await expect(page.locator(".popup-version")).toHaveText(version);
});
