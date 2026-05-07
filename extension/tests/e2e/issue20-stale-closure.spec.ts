/**
 * E2E test verifying fix for issue #20 — stale-closure bug in configuration.ts.
 *
 * The bug: onChange callbacks in renderConfiguration() closed over a `config`
 * snapshot taken at render time. If another tab / background sync updated
 * storage between render and callback fire, the callback would spread the stale
 * snapshot and silently overwrite the newer version.
 *
 * The fix: each callback calls `const current = await getConfig()` inside the
 * callback body (not at render time), so it always operates on the latest state.
 *
 * This test simulates the race:
 *   1. Load the configuration screen (renders and captures initial config).
 *   2. Via the service worker, inject a "background sync" that writes a new
 *      field (`_syncMarker`) into storage — simulating an external update that
 *      landed while the page was open.
 *   3. Change the defaultSuggestionsApi input on the options page.
 *   4. Assert that the saved config still contains `_syncMarker` — proving the
 *      callback fetched the current config rather than spreading the stale
 *      render-time snapshot.
 */

import * as path from "node:path";
import { test, expect } from "./fixtures";

const SCREENSHOT_DIR = path.resolve(__dirname, "screenshots");

test("issue #20: onChange callback uses current config, not stale render-time snapshot", async ({ context, extensionId }) => {
  const page = await context.newPage();

  // Step 1 — Load the configuration screen.
  // renderConfiguration() fetches config here (the "render-time snapshot").
  await page.goto(`chrome-extension://${extensionId}/options/options.html#/configuration`);

  // Wait until the screen is fully rendered (default-cmd select must be visible).
  await expect(page.locator('select#default-cmd')).toBeVisible();

  // Step 2 — Simulate a background sync updating storage while the page is open.
  // We write `_syncMarker: true` directly into the stored config via the service
  // worker. The page's render-time snapshot does NOT know about this field.
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => {
    return chrome.storage.local.get("fast-travel-config").then(result => {
      const cfg = result["fast-travel-config"];
      if (!cfg) throw new Error("config not in storage");
      // Inject a marker field — simulates a background sync adding data
      (cfg as Record<string, unknown>)["_syncMarker"] = true;
      return chrome.storage.local.set({ "fast-travel-config": cfg });
    });
  });

  // Step 3 — Change the defaultSuggestionsApi input and blur to fire onChange.
  const apiInput = page.locator('input#default-api');
  await expect(apiInput).toBeVisible();
  await apiInput.fill("https://suggest.example.com?q={query}");
  await apiInput.dispatchEvent("change");  // triggers the onChange callback

  // Give the async callback time to call getConfig() → setConfig().
  await page.waitForTimeout(500);

  // Step 4 — Read back the stored config and assert both changes survived.
  const saved = await sw.evaluate(() =>
    chrome.storage.local.get("fast-travel-config").then(v => v["fast-travel-config"])
  );

  // The sync marker must still be present — proves the callback re-fetched
  // rather than spreading the stale snapshot (which had no _syncMarker).
  expect((saved as Record<string, unknown>)["_syncMarker"]).toBe(true);

  // The actual user edit must also have persisted.
  expect((saved as Record<string, unknown>)["defaultSuggestionsApi"]).toBe(
    "https://suggest.example.com?q={query}"
  );

  // Step 5 — Screenshot.
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, "issue20-configuration-screen.png"),
    fullPage: false,
  });
});
