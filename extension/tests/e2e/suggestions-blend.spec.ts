/**
 * e2e for issue #61: blended suggestions (FT history + API + browser history)
 * and the Suggestions settings screen.
 *
 * Hermetic: the suggestions API is stubbed via context.route, FT history and
 * prefs are seeded straight into chrome.storage.local. The browser-history
 * toggle's native permission prompt cannot be driven by Playwright, so the
 * grant/deny flow is covered by unit tests (suggestions-screen.test.ts,
 * permissions.test.ts); here we only assert the gated UI states.
 */

import { test, expect } from "./fixtures";
import type { BrowserContext, Page } from "@playwright/test";

const SUGGEST_STUB = ["gi", ["giants game", "github", "gif maker"]];

async function stubSuggestApi(context: BrowserContext) {
  await context.route("https://suggestqueries.google.com/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(SUGGEST_STUB),
    }),
  );
}

async function seedHistory(page: Page, entries: Array<Record<string, unknown>>) {
  await page.evaluate(
    (h) => chrome.storage.local.set({ "fast-travel-history": h }),
    entries,
  );
}

async function openNewtab(context: BrowserContext, extensionId: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);
  await page.locator("html[data-ft-ready]").waitFor();
  return page;
}

test("blend: FT history rows appear above API rows with a separator", async ({
  context,
  extensionId,
}) => {
  await stubSuggestApi(context);
  const page = await openNewtab(context, extensionId);
  await seedHistory(page, [
    { query: "gitlab pipelines", commandId: null, timestamp: Date.now() - 86_400_000 },
    { query: "weather", commandId: null, timestamp: Date.now() },
  ]);
  await page.reload();
  await page.locator("html[data-ft-ready]").waitFor();

  await page.locator("#search-input").fill("gi");

  const historyRow = page.locator(".suggestion-item.suggestion-history");
  const apiRows = page.locator(".suggestion-item.suggestion-api");
  await expect(historyRow).toHaveCount(1, { timeout: 5000 });
  await expect(historyRow).toContainText("gitlab pipelines");
  await expect(apiRows.first()).toBeVisible();
  await expect(page.locator(".suggestion-separator").first()).toBeVisible();

  // History section renders above the API section.
  const allRows = page.locator(".suggestion-item");
  await expect(allRows.first()).toHaveClass(/suggestion-history/);
});

test("blend: identical history query dedupes the API copy", async ({
  context,
  extensionId,
}) => {
  await stubSuggestApi(context);
  const page = await openNewtab(context, extensionId);
  await seedHistory(page, [
    { query: "github", commandId: null, timestamp: Date.now() - 86_400_000 * 60 },
  ]);
  await page.reload();
  await page.locator("html[data-ft-ready]").waitFor();

  await page.locator("#search-input").fill("gi");
  await expect(page.locator(".suggestion-item.suggestion-history")).toHaveCount(1, {
    timeout: 5000,
  });
  // "github" from the API stub must be deduped; the other two remain.
  const apiTexts = await page
    .locator(".suggestion-item.suggestion-api .suggestion-text")
    .allTextContents();
  expect(apiTexts).toEqual(["giants game", "gif maker"]);
});

test("blend: recent prefix match is promoted as the top hit", async ({
  context,
  extensionId,
}) => {
  await stubSuggestApi(context);
  const page = await openNewtab(context, extensionId);
  await seedHistory(page, [
    { query: "github actions", commandId: null, timestamp: Date.now() },
  ]);
  await page.reload();
  await page.locator("html[data-ft-ready]").waitFor();

  await page.locator("#search-input").fill("gi");
  const topHit = page.locator(".suggestion-item.suggestion-top-hit");
  await expect(topHit).toHaveCount(1, { timeout: 5000 });
  await expect(topHit).toContainText("github actions");

  // #82: the top hit is a ranking signal, not a selection. It carries an
  // explicit "Top hit" label, nothing is keyboard-selected, and it must not
  // paint the filled background that .active uses — Enter still searches the
  // typed text, and the styling has to say so.
  await expect(topHit.locator(".suggestion-top-hit-badge")).toHaveText("Top hit");
  await expect(page.locator(".suggestion-item.active")).toHaveCount(0);

  // The row must be visually IDENTICAL to a plain row apart from weight and the
  // badge — no background, no border, no accent rule. Anything painted on one
  // edge still reads as "selected".
  // Toggling the class off on the very same row isolates exactly what
  // .suggestion-top-hit paints — immune to hover and theme.
  const paint = await page.evaluate(() => {
    const row = document.querySelector(".suggestion-item.suggestion-top-hit")!;
    const read = () => {
      const cs = getComputedStyle(row);
      return {
        background: cs.backgroundColor,
        boxShadow: cs.boxShadow,
        borderLeft: cs.borderLeftWidth,
        outline: cs.outlineStyle,
      };
    };
    const withClass = read();
    row.classList.remove("suggestion-top-hit");
    const withoutClass = read();
    row.classList.add("suggestion-top-hit");
    row.classList.add("active");
    const activeBackground = getComputedStyle(row).backgroundColor;
    row.classList.remove("active");
    return { withClass, withoutClass, activeBackground };
  });

  // The class contributes no background, border, shadow or accent rule.
  expect(paint.withClass).toEqual(paint.withoutClass);
  expect(paint.withClass.boxShadow).toBe("none");
  expect(paint.withClass.borderLeft).toBe("0px");
  // ...while real keyboard selection still paints a distinct fill.
  expect(paint.activeBackground).not.toBe(paint.withClass.background);
});

test("blend: blendFtHistory=false restores API-only behavior", async ({
  context,
  extensionId,
}) => {
  await stubSuggestApi(context);
  const page = await openNewtab(context, extensionId);
  await seedHistory(page, [
    { query: "gitlab pipelines", commandId: null, timestamp: Date.now() },
  ]);
  await page.evaluate(() =>
    chrome.storage.local.set({
      "fast-travel-suggestions-prefs": { blendFtHistory: false },
    }),
  );
  await page.reload();
  await page.locator("html[data-ft-ready]").waitFor();

  await page.locator("#search-input").fill("gi");
  await expect(page.locator(".suggestion-item.suggestion-api").first()).toBeVisible({
    timeout: 5000,
  });
  await expect(page.locator(".suggestion-item.suggestion-history")).toHaveCount(0);
  await expect(page.locator(".suggestion-item.suggestion-top-hit")).toHaveCount(0);
});

test("blend: Ctrl+ArrowDown jumps to the next section start", async ({
  context,
  extensionId,
}) => {
  await stubSuggestApi(context);
  const page = await openNewtab(context, extensionId);
  await seedHistory(page, [
    { query: "gi one", commandId: null, timestamp: Date.now() - 86_400_000 * 60 },
    { query: "gi two", commandId: null, timestamp: Date.now() - 86_400_000 * 60 },
  ]);
  await page.reload();
  await page.locator("html[data-ft-ready]").waitFor();

  const input = page.locator("#search-input");
  await input.fill("gi");
  await expect(page.locator(".suggestion-item.suggestion-api").first()).toBeVisible({
    timeout: 5000,
  });

  // First Ctrl+ArrowDown → first row (history section start).
  await input.press("Control+ArrowDown");
  await expect(page.locator(".suggestion-item.active")).toHaveClass(/suggestion-history/);
  // Second → skips the rest of the history section to the API section start.
  await input.press("Control+ArrowDown");
  await expect(page.locator(".suggestion-item.active")).toHaveClass(/suggestion-api/);
  // Ctrl+ArrowUp → back to the history section start.
  await input.press("Control+ArrowUp");
  await expect(page.locator(".suggestion-item.active")).toHaveClass(/suggestion-history/);

  // #83: the section cycle wraps through the typed text at both ends.
  // Up from the first section start deselects and restores what was typed.
  await input.press("Control+ArrowUp");
  await expect(page.locator(".suggestion-item.active")).toHaveCount(0);
  await expect(input).toHaveValue("gi");
  // Up again from the typed text wraps around to the LAST section.
  await input.press("Control+ArrowUp");
  const lastSectionRow = page.locator(".suggestion-item.active");
  await expect(lastSectionRow).toHaveCount(1);
  await expect(lastSectionRow).toHaveClass(/suggestion-api/);
  // And down off the bottom returns to the typed text.
  await input.press("Control+ArrowDown");
  await expect(page.locator(".suggestion-item.active")).toHaveCount(0);
  await expect(input).toHaveValue("gi");
});

// On macOS, Ctrl+Arrow is Mission Control / App Expose and never reaches the
// page, so the section jump is bound to Cmd there. Ctrl keeps working as a
// fallback, which is why the test above still passes on a Mac.
test("blend: Cmd+Arrow jumps between sections on macOS", async ({
  context,
  extensionId,
}) => {
  test.skip(process.platform !== "darwin", "Cmd is only bound on macOS");

  await stubSuggestApi(context);
  const page = await openNewtab(context, extensionId);
  await seedHistory(page, [
    { query: "gi one", commandId: null, timestamp: Date.now() - 86_400_000 * 60 },
    { query: "gi two", commandId: null, timestamp: Date.now() - 86_400_000 * 60 },
  ]);
  await page.reload();
  await page.locator("html[data-ft-ready]").waitFor();

  const input = page.locator("#search-input");
  await input.fill("gi");
  await expect(page.locator(".suggestion-item.suggestion-api").first()).toBeVisible({
    timeout: 5000,
  });

  await input.press("Meta+ArrowDown");
  await expect(page.locator(".suggestion-item.active")).toHaveClass(/suggestion-history/);
  await input.press("Meta+ArrowDown");
  await expect(page.locator(".suggestion-item.active")).toHaveClass(/suggestion-api/);
  await input.press("Meta+ArrowUp");
  await expect(page.locator(".suggestion-item.active")).toHaveClass(/suggestion-history/);
  // Wraps through the typed text at both ends, same as Ctrl.
  await input.press("Meta+ArrowUp");
  await expect(page.locator(".suggestion-item.active")).toHaveCount(0);
  await expect(input).toHaveValue("gi");
  await input.press("Meta+ArrowUp");
  await expect(page.locator(".suggestion-item.active")).toHaveClass(/suggestion-api/);
});

test("URL-shaped history rows show the globe icon", async ({ context, extensionId }) => {
  await stubSuggestApi(context);
  const page = await openNewtab(context, extensionId);
  await seedHistory(page, [
    { query: "github.com/foo", commandId: null, timestamp: Date.now() },
    { query: "gitlab pipelines", commandId: null, timestamp: Date.now() - 86_400_000 },
  ]);
  await page.reload();
  await page.locator("html[data-ft-ready]").waitFor();

  await page.locator("#search-input").fill("gi");

  const globeIcons = page.locator(".suggestion-item .suggestion-favicon.globe");
  await expect(globeIcons).toHaveCount(1, { timeout: 5000 });
  await expect(globeIcons).toHaveText("🌐");

  const plainRow = page.locator(".suggestion-item.suggestion-history", {
    hasText: "gitlab pipelines",
  });
  const plainFavicon = plainRow.locator(".suggestion-favicon");
  await expect(plainFavicon).toHaveClass(/monogram/);
  await expect(plainFavicon).not.toHaveClass(/globe/);
});

test("settings: Suggestions screen defaults — FT on, browser history off", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/options.html#/suggestions`);
  const toggles = page.locator(".setting-toggle-row .toggle-input");
  await expect(toggles).toHaveCount(2);
  await expect(toggles.nth(0)).toBeChecked();
  await expect(toggles.nth(1)).not.toBeChecked();
});

test("settings: FT history toggle persists across reload", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/options.html#/suggestions`);
  const ftToggle = page.locator(".setting-toggle-row .toggle-input").first();
  await ftToggle.click();
  await expect(ftToggle).not.toBeChecked();
  await page.reload();
  await expect(
    page.locator(".setting-toggle-row .toggle-input").first(),
  ).not.toBeChecked();
});

test("settings: browser-history toggle stays off when pref is set but permission is missing", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/options.html#/suggestions`);
  // Simulate a pref that survived from another profile/device without the
  // permission: the gated toggle must render unchecked.
  await page.evaluate(() =>
    chrome.storage.local.set({
      "fast-travel-suggestions-prefs": { includeBrowserHistory: true },
    }),
  );
  await page.reload();
  const toggles = page.locator(".setting-toggle-row .toggle-input");
  await expect(toggles.nth(1)).not.toBeChecked();
  // The stale pref must also be repaired in storage, so an out-of-band
  // permission grant can't silently reactivate blending later.
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const v = await chrome.storage.local.get("fast-travel-suggestions-prefs");
        return (v["fast-travel-suggestions-prefs"] as { includeBrowserHistory?: boolean })
          ?.includeBrowserHistory;
      }),
    )
    .toBe(false);
});
