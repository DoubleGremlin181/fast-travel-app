/**
 * Regression test for Issue #43: Chrome closes on launch.
 *
 * Bug: To dodge Chrome's omnibox focus-steal on Ctrl+T, the service worker's
 * `chrome.tabs.onCreated` listener removed any `chrome://newtab/` tab and
 * recreated it programmatically. At a normal browser launch / new window the
 * New Tab Page is the ONLY tab in the window, so removing it tore the whole
 * window down before the replacement could be created — the window "opened and
 * instantly closed". (The reporter's "renderer crash / WidgetHost" log is the
 * symptom of the tab being destroyed mid-paint, not the newtab page crashing.)
 *
 * Fix: never remove a tab that is the sole tab of its window; the focus-steal
 * workaround is only needed for Ctrl+T / "+" where the window already has tabs.
 */

import { test, expect } from "./fixtures";

test("a new window whose only tab is the New Tab Page is NOT torn down", async ({
  context,
}) => {
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));

  const winId: number = await sw.evaluate(async () => {
    const win = await chrome.windows.create({ url: "chrome://newtab/" });
    return win!.id!;
  });

  // Give the onCreated handler time to (previously) remove/recreate the tab.
  await sw.evaluate(() => new Promise((r) => setTimeout(r, 1500)));

  const survived = await sw.evaluate(async (id) => {
    const wins = await chrome.windows.getAll({ populate: true });
    const w = wins.find((x) => x.id === id);
    return { exists: !!w, tabCount: w?.tabs?.length ?? 0 };
  }, winId);

  // Before the fix: the window was destroyed (exists === false, tabCount 0).
  expect(survived.exists).toBe(true);
  expect(survived.tabCount).toBeGreaterThanOrEqual(1);
});

test("Ctrl+T (new tab in a window that already has tabs) still routes through the extension New Tab page", async ({
  context,
}) => {
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));

  const result = await sw.evaluate(async () => {
    const [win] = await chrome.windows.getAll({ populate: true });
    await chrome.tabs.create({ windowId: win.id, url: "chrome://newtab/" });
    await new Promise((r) => setTimeout(r, 1500));
    const updated = await chrome.windows.get(win.id, { populate: true });
    return {
      tabCount: updated.tabs?.length ?? 0,
      urls: updated.tabs?.map((t) => t.url || t.pendingUrl || "") ?? [],
    };
  });

  // The workaround must still fire here: the window keeps >= 2 tabs and the new
  // one is the extension's newtab page (proves the focus-steal fix is intact).
  expect(result.tabCount).toBeGreaterThanOrEqual(2);
  expect(result.urls.some((u) => u.endsWith("/newtab/newtab.html"))).toBe(true);
});
