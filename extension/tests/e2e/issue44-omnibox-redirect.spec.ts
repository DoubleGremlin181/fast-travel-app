/**
 * Regression test for Issue #44: context-menu / default-search "Search Fast
 * Travel for <term>" opened an error page (ERR_BLOCKED_BY_CLIENT) on Chrome.
 *
 * Root cause: the search routed through a sentinel URL that a declarativeNetRequest
 * rule redirected into `newtab/newtab.html?q=…`. Chrome BLOCKS DNR redirects of
 * browser-initiated navigations (omnibox / context-menu) into chrome-extension://
 * pages — even when web-accessible. Firefox worked because it used a webNavigation
 * + tabs.update (extension-initiated) navigation instead.
 *
 * Fix: Chrome now uses the same webNavigation + tabs.update path, and actively
 * removes any stale DNR redirect rule a prior build installed (dynamic rules
 * persist across updates, and the rule is enforced by the network stack without
 * the service worker, so a leftover rule keeps blocking).
 */

import { test, expect } from "./fixtures";

test("Chrome removes any stale declarativeNetRequest redirect rule (it would block the search)", async ({
  context,
}) => {
  const sw = context.serviceWorkers()[0];

  const installed = await sw.evaluate(async () => {
    // Simulate the rule an older build left in the profile.
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1],
      addRules: [
        {
          id: 1,
          priority: 1,
          action: {
            type: "redirect" as chrome.declarativeNetRequest.RuleActionType,
            redirect: { regexSubstitution: chrome.runtime.getURL("newtab/newtab.html") + "?q=\\1" },
          },
          condition: {
            regexFilter: "^https://fast-travel-omnibox\\.invalid/search\\?q=(.*)$",
            resourceTypes: ["main_frame" as chrome.declarativeNetRequest.ResourceType],
          },
        },
      ],
    });
    const n = (await chrome.declarativeNetRequest.getDynamicRules()).length;

    // Re-run the worker's startup/update paths; on Chrome they remove the rule.
    (chrome.runtime.onStartup as chrome.events.Event<() => void>).dispatch();
    (
      chrome.runtime.onInstalled as chrome.events.Event<
        (d: chrome.runtime.InstalledDetails) => void
      >
    ).dispatch({ reason: "update" } as chrome.runtime.InstalledDetails);
    return n;
  });

  expect(installed).toBe(1);
  // The removal is async; poll from the test side so a slow CI worker can't flake
  // on a fixed wait.
  await expect
    .poll(
      async () => (await sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules())).length,
      { timeout: 10000 },
    )
    .toBe(0);
});

test("Chrome routes the sentinel via a webNavigation handler (not a blocked DNR redirect)", async ({
  context,
}) => {
  const sw = context.serviceWorkers()[0];
  // The fix replaces the Chrome-blocked DNR redirect with a webNavigation +
  // tabs.update interception of the sentinel host. Assert the listener is wired
  // up. (Driving the full .invalid → tabs.update → result chain end-to-end is a
  // service-worker-wake timing race in this harness and is verified manually in
  // real browsers; this is the reliable, non-flaky structural check.)
  const wired = await sw.evaluate(
    () =>
      typeof chrome.webNavigation?.onBeforeNavigate?.hasListeners === "function" &&
      chrome.webNavigation.onBeforeNavigate.hasListeners(),
  );
  expect(wired).toBe(true);
});

test("the newtab page resolves a ?q= query to the default command's search", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  const reqPromise = page.waitForRequest(
    (r) =>
      r.isNavigationRequest() &&
      r.frame() === page.mainFrame() &&
      /google\.com\/search\?q=/.test(r.url()),
    { timeout: 10000 },
  );
  page.goto(`chrome-extension://${extensionId}/newtab/newtab.html?q=Dallas`).catch(() => {});
  const request = await reqPromise;
  expect(new URL(request.url()).searchParams.get("q")).toBe("Dallas");
});

test("a ?q= load with no query falls through to an interactive page (never stranded)", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html?q=`);
  await expect(page.locator("html[data-ft-ready]")).toBeAttached({ timeout: 5000 });
  expect(page.url()).toContain("/newtab/newtab.html");
});
