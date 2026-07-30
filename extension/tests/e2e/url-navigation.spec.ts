/**
 * e2e for issue #68: single-token URL detection + Ctrl+Enter lucky search.
 *
 * Coverage:
 *   1. Typing a bare domain navigates directly (no search engine round-trip)
 *   2. A multi-token query containing a domain-like word still searches
 *   3. javascript: input never navigates (complements xss-javascript-url.spec.ts)
 *   4. Ctrl+Enter routes through the default command's luckyUrl template
 *
 * Navigation assertions use waitForRequest so tests resolve when the request
 * is issued, without depending on external sites actually loading.
 */

import { test, expect } from "./fixtures";

async function readyNewtab(context: any, extensionId: string) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);
  await page.locator("html[data-ft-ready]").waitFor();
  return page;
}

test("typing a bare domain navigates directly to it", async ({ context, extensionId }) => {
  const page = await readyNewtab(context, extensionId);

  const input = page.locator("#search-input");
  await input.fill("example.com");

  const [request] = await Promise.all([
    page.waitForRequest(
      (r) =>
        r.isNavigationRequest() &&
        r.frame() === page.mainFrame() &&
        r.url().startsWith("https://example.com"),
      { timeout: 10000 },
    ),
    page.keyboard.press("Enter"),
  ]);
  expect(request.url()).toBe("https://example.com/");
});

test("a multi-token query with a domain-like word still searches", async ({
  context,
  extensionId,
}) => {
  const page = await readyNewtab(context, extensionId);

  const input = page.locator("#search-input");
  await input.fill("node.js install");

  const [request] = await Promise.all([
    page.waitForRequest(
      (r) =>
        r.isNavigationRequest() &&
        r.frame() === page.mainFrame() &&
        /google\.com\/search/.test(r.url()),
      { timeout: 10000 },
    ),
    page.keyboard.press("Enter"),
  ]);
  expect(request.url()).toMatch(/google\.com\/search\?q=node\.js%20install/);
});

test("javascript: input searches instead of navigating", async ({ context, extensionId }) => {
  const page = await readyNewtab(context, extensionId);

  let dialogFired = false;
  page.on("dialog", async (dialog: any) => {
    dialogFired = true;
    await dialog.dismiss();
  });

  const input = page.locator("#search-input");
  await input.fill("javascript:alert(1)");

  const [request] = await Promise.all([
    page.waitForRequest(
      (r) =>
        r.isNavigationRequest() &&
        r.frame() === page.mainFrame() &&
        /google\.com\/search/.test(r.url()),
      { timeout: 10000 },
    ),
    page.keyboard.press("Enter"),
  ]);
  expect(request.url()).toContain("javascript%3Aalert");
  expect(page.url()).not.toMatch(/^javascript:/i);
  expect(dialogFired).toBe(false);
});

test("Ctrl+Enter routes through the default command's luckyUrl", async ({
  context,
  extensionId,
}) => {
  const page = await readyNewtab(context, extensionId);

  // Seed the config directly: the service worker refreshes config from the
  // repo's main branch on install, which may not carry luckyUrl yet. Direct
  // storage write keeps this test hermetic (same pattern as the xss spec).
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() =>
    chrome.storage.local
      .get("fast-travel-config")
      .then((v: Record<string, any>) => {
        const cfg = v["fast-travel-config"];
        const google = cfg.groups
          .flatMap((g: any) => g.commands)
          .find((c: any) => c.id === "google");
        google.luckyUrl = "https://www.google.com/search?q={query}&btnI";
        return chrome.storage.local.set({ "fast-travel-config": cfg });
      }),
  );
  await page.reload();
  await page.locator("html[data-ft-ready]").waitFor();

  const input = page.locator("#search-input");
  await input.fill("wikipedia");

  const [request] = await Promise.all([
    page.waitForRequest(
      (r) =>
        r.isNavigationRequest() &&
        r.frame() === page.mainFrame() &&
        /google\.com\/search/.test(r.url()),
      { timeout: 10000 },
    ),
    page.keyboard.press("Control+Enter"),
  ]);
  expect(request.url()).toMatch(/google\.com\/search\?q=wikipedia&btnI/);
});
