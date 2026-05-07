/**
 * Regression test for Issue #7: omnibox onInputEntered "currentTab" case
 *
 * Bug: The "currentTab" branch called chrome.tabs.update(undefined, { url })
 *      because the tabId was never queried. This silently failed in Chrome MV3
 *      and threw in Firefox.
 *
 * Fix: The "currentTab" case now queries the active tab first:
 *   const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
 *   if (tab?.id != null) { await chrome.tabs.update(tab.id, { url: navUrl }); }
 *
 * This test:
 *   1. Loads the Chrome extension.
 *   2. Opens a plain HTTPS page as the active tab (so there IS an active tab).
 *   3. Dispatches onInputEntered("g kittens", "currentTab") via the service worker.
 *   4. Asserts the active tab's URL updates to google.com/search?q=kittens.
 *   5. Also verifies the scheme guard still blocks a javascript: URL (Issue #2).
 */

import { test, expect } from "./fixtures";

type OmniboxDisposition = "currentTab" | "newForegroundTab" | "newBackgroundTab";

/** Helper: dispatch omnibox.onInputEntered from the service worker context. */
async function dispatchInputEntered(
  sw: import("@playwright/test").Worker,
  text: string,
  disposition: OmniboxDisposition,
) {
  await sw.evaluate(
    ([t, d]) => {
      (
        chrome.omnibox.onInputEntered as chrome.events.Event<
          (text: string, disposition: chrome.omnibox.OnInputEnteredDisposition) => void
        >
      ).dispatch(t, d as chrome.omnibox.OnInputEnteredDisposition);
    },
    [text, disposition] as [string, OmniboxDisposition],
  );
}

// ---------------------------------------------------------------------------
// Test 1: "currentTab" disposition updates the current tab's URL
// ---------------------------------------------------------------------------

test("omnibox currentTab: navigates the active tab to the resolved URL", async ({
  context,
  extensionId,
}) => {
  // Open a plain page that has a stable, predictable URL. We use example.com
  // because it's always available and has no JS that could interfere.
  const page = await context.newPage();
  await page.goto("https://example.com");
  await expect(page).toHaveURL("https://example.com/");

  // Confirm the extension loaded (extensionId is already resolved by the fixture).
  expect(extensionId).toBeTruthy();

  // Get a reference to the service worker so we can dispatch events from it.
  const sw = context.serviceWorkers()[0];

  // Set up a promise that resolves when the page navigates to google.com/search.
  // Register BEFORE dispatching so we don't miss the event.
  const navPromise = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timed out waiting for google.com/search navigation")),
      10_000,
    );
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame() && /google\.com\/search/.test(frame.url())) {
        clearTimeout(timer);
        resolve(frame.url());
      }
    });
  });

  // Dispatch onInputEntered with disposition "currentTab" from the service worker.
  // This simulates the user pressing Enter in the omnibox on the "g kittens" suggestion.
  await dispatchInputEntered(sw, "g kittens", "currentTab");

  // Wait for the navigation to complete.
  const finalUrl = await navPromise;

  // Verify the URL has the correct search query.
  const url = new URL(finalUrl);
  expect(url.hostname).toMatch(/google\.com/);
  expect(url.searchParams.get("q")).toBe("kittens");

  // Take a screenshot showing the tab navigated to Google search.
  await page.screenshot({
    path: "tests/e2e/screenshots/omnibox-currentTab-navigated.png",
    fullPage: false,
  });
});

// ---------------------------------------------------------------------------
// Test 2: "currentTab" disposition with a javascript: URL is blocked (Issue #2)
//
// Note: getConfig() in the service worker runs isConfigUsable() which rejects
// configs containing javascript: URLs via lintConfig(). Writing directly to
// storage bypasses the write-time linter but the read-time guard (isConfigUsable)
// still fires, causing getConfig() to fall back to the bundled config. This
// means the "evil" command never resolves a URL, so no navigation occurs.
// The test verifies the full defense-in-depth chain blocks javascript: navigation.
// ---------------------------------------------------------------------------

test("omnibox currentTab: scheme guard blocks javascript: URL navigation", async ({
  context,
  extensionId,
}) => {
  const sw = context.serviceWorkers()[0];

  // Write a config with a javascript: defaultUrl directly to storage, bypassing
  // the write-time linter. The read-time guard in getConfig() will still reject it.
  await sw.evaluate(() => {
    return chrome.storage.local.set({
      "fast-travel-config": {
        version: 2,
        defaultCommand: "evil",
        ignoreList: [],
        groups: [
          {
            id: "g-evil",
            name: "Evil Group",
            commands: [
              {
                id: "cmd-evil",
                name: "Evil",
                triggers: ["evil"],
                type: "standard",
                routes: [{ devices: "*", defaultUrl: "javascript:alert('pwned')" }],
              },
            ],
          },
        ],
      },
    });
  });

  const page = await context.newPage();
  await page.goto("https://example.com");
  await expect(page).toHaveURL("https://example.com/");

  let dialogFired = false;
  page.on("dialog", async (dialog) => {
    dialogFired = true;
    await dialog.dismiss();
  });

  // Dispatch the malicious command via omnibox "currentTab" disposition.
  await dispatchInputEntered(sw, "evil", "currentTab");

  // Give it time to (not) navigate to javascript:.
  await page.waitForTimeout(2_000);

  // The page must NOT have navigated to a javascript: URL.
  // (The read-time linter rejects the malicious config and falls back to the
  // bundled default config, so "evil" may be processed as a regular Google
  // search — but it will never be a javascript: URL.)
  expect(page.url()).not.toMatch(/^javascript:/i);
  // No alert must have fired (the javascript: URL was never executed).
  expect(dialogFired).toBe(false);

  await page.screenshot({
    path: "tests/e2e/screenshots/omnibox-currentTab-scheme-guard.png",
    fullPage: false,
  });
});

// ---------------------------------------------------------------------------
// Test 3: "newForegroundTab" disposition still opens a new tab (sanity check)
// ---------------------------------------------------------------------------

test("omnibox newForegroundTab: opens a new tab with the resolved URL", async ({
  context,
  extensionId,
}) => {
  const sw = context.serviceWorkers()[0];

  // Open an anchor page first so the context has at least one stable page.
  const anchorPage = await context.newPage();
  await anchorPage.goto("https://example.com");

  const pagesBefore = context.pages().length;

  // Listen for the new page BEFORE dispatching.
  const newPagePromise = context.waitForEvent("page", { timeout: 10_000 });

  await dispatchInputEntered(sw, "g puppies", "newForegroundTab");

  const newPage = await newPagePromise;
  // Wait for the new tab to reach a google.com URL (search or sorry redirect).
  await newPage.waitForURL(/google\.com/, { timeout: 15_000 });

  // The new tab must have navigated to Google (confirming the disposition opened a
  // new tab and the URL was correct, even if Google redirects to a sorry page).
  expect(new URL(newPage.url()).hostname).toMatch(/google\.com/);

  // Verify a new tab was indeed opened.
  expect(context.pages().length).toBeGreaterThan(pagesBefore);
});
