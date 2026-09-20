/**
 * e2e for issue #68: single-token URL detection + Ctrl+Enter lucky search.
 *
 * Coverage:
 *   1. Typing a bare domain navigates directly (no search engine round-trip)
 *   2. A multi-token query containing a domain-like word still searches
 *   3. javascript: input never navigates (complements xss-javascript-url.spec.ts)
 *   4. Ctrl+Enter routes through the top-level defaultLuckyUrl template
 *   5. Ctrl+Enter skips Google's "Redirect Notice" and opens its target directly
 *
 * Navigation assertions use waitForRequest so tests resolve when the request
 * is issued, without depending on external sites actually loading.
 */

import { test, expect } from "./fixtures";
import type { BrowserContext } from "@playwright/test";

async function readyNewtab(context: BrowserContext, extensionId: string) {
  // Abort all http(s) traffic: navigation assertions below use waitForRequest,
  // which fires at request-issue time, so no external site is ever contacted.
  // Scheme-anchored regex so the extension's own chrome-extension:// CSS/JS
  // subresources are NOT intercepted (route("**/*") breaks page rendering).
  await context.route(/^https?:\/\//, (route) => route.abort());
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
  page.on("dialog", async (dialog) => {
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

test("Ctrl+Enter routes through the top-level defaultLuckyUrl", async ({
  context,
  extensionId,
}) => {
  const page = await readyNewtab(context, extensionId);

  // Seed the config directly: the service worker refreshes config from the
  // repo's main branch on install, which may not carry defaultLuckyUrl yet.
  // Direct storage write keeps this test hermetic (same pattern as the xss spec).
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() =>
    chrome.storage.local
      .get("fast-travel-config")
      .then((v: Record<string, any>) => {
        const cfg = v["fast-travel-config"];
        cfg.defaultLuckyUrl = "https://www.google.com/search?q={query}&btnI";
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

test("Ctrl+Enter opens the redirect notice's target directly", async ({
  context,
  extensionId,
}) => {
  const page = await readyNewtab(context, extensionId);

  // Stand in for Google: &btnI 302s to the /url?q=<target> "Redirect Notice"
  // interstitial, with the target's query string percent-encoded. Registered
  // after readyNewtab's abort-all route, so these take precedence.
  await context.route(/^https:\/\/www\.google\.com\/search\?/, (route) =>
    route.fulfill({
      status: 302,
      headers: {
        location: "https://www.google.com/url?q=https://example.com/watch%3Fv%3Dabc",
      },
    }),
  );
  await context.route(/^https:\/\/www\.google\.com\/url\?/, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "Redirect Notice" }),
  );

  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() =>
    chrome.storage.local
      .get("fast-travel-config")
      .then((v: Record<string, any>) => {
        const cfg = v["fast-travel-config"];
        cfg.defaultLuckyUrl = "https://www.google.com/search?q={query}&btnI";
        return chrome.storage.local.set({ "fast-travel-config": cfg });
      }),
  );
  await page.reload();
  await page.locator("html[data-ft-ready]").waitFor();

  await page.locator("#search-input").fill("some video");

  const navigations: string[] = [];
  page.on("request", (r) => {
    if (r.isNavigationRequest() && r.frame() === page.mainFrame()) {
      navigations.push(r.url());
    }
  });
  const [request] = await Promise.all([
    page.waitForRequest(
      (r) =>
        r.isNavigationRequest() &&
        r.frame() === page.mainFrame() &&
        r.url().startsWith("https://example.com"),
      { timeout: 10000 },
    ),
    page.keyboard.press("Control+Enter"),
  ]);
  expect(request.url()).toBe("https://example.com/watch?v=abc");
  // The tab never navigates to Google — only the resolving fetch() contacts it.
  expect(navigations).toEqual(["https://example.com/watch?v=abc"]);
});
