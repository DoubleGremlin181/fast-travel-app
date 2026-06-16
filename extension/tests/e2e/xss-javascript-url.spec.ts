/**
 * Security regression test: javascript: URL XSS (Issue #2)
 *
 * Verifies that a malicious config with `"defaultUrl": "javascript:alert(1)"`
 * CANNOT execute script in the extension's privileged newtab context.
 *
 * Coverage:
 *   1. config-linter blocks the bad URL before it reaches storage
 *   2. newtab.ts handleSearch() scheme guard prevents window.location.href assignment
 *   3. newtab.ts init() omnibox path scheme guard prevents window.location.replace()
 *   4. Both guards together (belt-and-suspenders)
 *
 * Note: The linter is the primary defence — it runs in the service worker's
 * `setConfig` handler and rejects the config before it is ever stored. The
 * newtab-level scheme guard is the second line of defence if a bad config
 * somehow bypasses linting (e.g., direct storage write).
 */

import { test, expect } from "./fixtures";

// ---------------------------------------------------------------------------
// Helper: minimal valid config with a javascript: URL as defaultUrl
// ---------------------------------------------------------------------------

function makeMaliciousConfig(customUrl = "javascript:alert(1)") {
  return {
    version: 2,
    defaultCommand: "xss",
    ignoreList: [],
    groups: [
      {
        id: "g-xss",
        name: "XSS Test Group",
        commands: [
          {
            id: "cmd-xss",
            name: "XSS Test",
            triggers: ["xss"],
            type: "standard" as const,
            routes: [
              {
                devices: "*",
                defaultUrl: customUrl,
              },
            ],
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 1. Linter defence: service worker should REJECT the config via setConfig
// ---------------------------------------------------------------------------

test("linter: setConfig rejects a javascript: defaultUrl", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);

  // Ask the service worker to store the malicious config via the normal message path.
  // We send the message from the extension page so chrome.runtime.sendMessage reaches
  // the background service worker listener which returns a proper { ok, reason } response.
  const result: { ok: boolean; reason?: string } = await page.evaluate((maliciousCfg) => {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "setConfig", config: maliciousCfg },
        (response) => resolve(response),
      );
    });
  }, makeMaliciousConfig() as unknown as Record<string, unknown>);

  // The service worker must reject the config.
  expect(result.ok).toBe(false);
  expect(result.reason).toMatch(/validation/i);

  // The stored config must NOT contain the malicious URL.
  const sw = context.serviceWorkers()[0];
  const stored = await sw.evaluate(() =>
    chrome.storage.local
      .get("fast-travel-config")
      .then((v) => v["fast-travel-config"]),
  );
  const storedStr = JSON.stringify(stored);
  expect(storedStr).not.toContain("javascript:");
});

// ---------------------------------------------------------------------------
// 2. Newtab handleSearch() scheme guard — bypass linter by writing directly
//    to chrome.storage.local (simulates a compromised storage layer)
// ---------------------------------------------------------------------------

test("newtab handleSearch: scheme guard blocks javascript: URL navigation", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);

  const sw = context.serviceWorkers()[0];

  // Bypass the linter by writing directly to storage.
  await sw.evaluate((maliciousCfg) => {
    return chrome.storage.local.set({ "fast-travel-config": maliciousCfg });
  }, makeMaliciousConfig() as unknown as Record<string, unknown>);

  // Track whether an alert (or any dialog) fires.
  let dialogFired = false;
  page.on("dialog", async (dialog) => {
    dialogFired = true;
    await dialog.dismiss();
  });

  // Reload the newtab so it picks up the malicious config from storage.
  await page.reload();

  // Type the trigger for the malicious command and submit.
  const input = page.locator("#search-input");
  await input.fill("xss");
  await page.keyboard.press("Enter");

  // Give the page 2 seconds to navigate or fire an alert.
  await page.waitForTimeout(2000);

  // The page must NOT have navigated to a javascript: URL.
  expect(page.url()).not.toMatch(/^javascript:/i);

  // No dialog (alert) must have fired.
  expect(dialogFired).toBe(false);

  // Take a screenshot as evidence.
  await page.screenshot({
    path: "tests/e2e/screenshots/xss-handleSearch-blocked.png",
    fullPage: false,
  });
});

// ---------------------------------------------------------------------------
// 3. Newtab init() omnibox path (?q=…) scheme guard
// ---------------------------------------------------------------------------

test("newtab init ?q= path: scheme guard blocks javascript: URL from omnibox route", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();

  const sw = context.serviceWorkers()[0];

  // Bypass the linter and write the malicious config directly to storage.
  await sw.evaluate((maliciousCfg) => {
    return chrome.storage.local.set({ "fast-travel-config": maliciousCfg });
  }, makeMaliciousConfig() as unknown as Record<string, unknown>);

  let dialogFired = false;
  page.on("dialog", async (dialog) => {
    dialogFired = true;
    await dialog.dismiss();
  });

  // Simulate the omnibox search path: newtab?q=xss
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html?q=xss`);

  // Give the page 2 seconds to navigate or fire an alert.
  await page.waitForTimeout(2000);

  expect(page.url()).not.toMatch(/^javascript:/i);
  expect(dialogFired).toBe(false);

  await page.screenshot({
    path: "tests/e2e/screenshots/xss-omnibox-path-blocked.png",
    fullPage: false,
  });
});

// ---------------------------------------------------------------------------
// 4. Verify that a legitimate https: URL still navigates correctly
//    (sanity check — guards must not over-block)
// ---------------------------------------------------------------------------

test("newtab handleSearch: https: URLs still navigate (guards do not over-block)", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);

  // Use the bundled default config (Google search), no storage injection needed.
  const input = page.locator("#search-input");
  await input.fill("g playwright testing");

  // Race-free + network-independent: waitForRequest resolves when the navigation
  // request is issued, without waiting for the external site to load.
  const [request] = await Promise.all([
    page.waitForRequest(
      (r) => r.isNavigationRequest() && r.frame() === page.mainFrame() && /google\.com/.test(r.url()),
      { timeout: 10000 },
    ),
    page.keyboard.press("Enter"),
  ]);
  const url = request.url();
  // The URL may use + or %20 for spaces depending on encodeURIComponent vs URLSearchParams
  expect(url).toMatch(/google\.com\/search\?q=playwright/);
});
