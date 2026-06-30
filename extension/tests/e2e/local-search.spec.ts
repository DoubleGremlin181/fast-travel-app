/**
 * E2E test: Local Search feature (stub companion on 127.0.0.1:7333).
 *
 * Step A — Pairing + enable: opens the Local Search settings screen, waits
 *   for the companion to be detected, pairs, then enables the toggle.
 * Step B — Search: opens newtab, types "s report", presses Enter, verifies
 *   the three canned result files render.
 * Step C — Interactions: toggles grid view, changes sort (fires a new search),
 *   clicks a result to open a file.
 *
 * Steps B and C inject prefs directly via chrome.storage.local to avoid
 * repeating the full pairing UI flow (Step A covers that thoroughly).
 */

import path from "node:path";
import { test, expect } from "./fixtures";
import {
  start,
  stop,
  getLastSearchBody,
  getLastOpenPath,
  getOpenCallCount,
  getSearchCallCount,
} from "./local-search-stub";

const SCREENSHOTS = path.resolve(__dirname, "screenshots");
// ── Pre-paired prefs injected into chrome.storage to skip UI pairing in B/C ──

const PAIRED_PREFS = {
  "fast-travel-local-search-prefs": {
    enabled: true,
    token: "e2e-test-token",
    port: 7333,
    queryMode: "simple",
    sort: { field: "relevance", dir: "desc" },
    filters: {},
    view: "list",
  },
};

// ── Shared helper: inject prefs into a loaded extension page ─────────────────

async function injectPrefs(
  page: import("@playwright/test").Page,
  prefs: Record<string, unknown>,
): Promise<void> {
  await page.evaluate(async (p) => {
    await chrome.storage.local.set(p);
  }, prefs);
}

// ── Stub lifecycle ────────────────────────────────────────────────────────────

test.beforeAll(async () => {
  await start();
});

test.afterAll(async () => {
  await stop();
});

// ── Step A: Pairing + enable ──────────────────────────────────────────────────

test("Step A: pair companion and enable local search", async ({ context, extensionId }) => {
  const page = await context.newPage();

  await page.goto(`chrome-extension://${extensionId}/options/options.html#/local-search`);

  // Wait for the screen to finish loading (spinner → status card).
  // discover() will hit 127.0.0.1:7333 — our stub. Paired=false on first call.
  await expect(
    page.locator(".status", { hasText: "Companion detected" }),
  ).toBeVisible({ timeout: 15_000 });

  await page.screenshot({ path: `${SCREENSHOTS}/local-search-a1-detected.png` });

  // Click "Pair now".
  const pairBtn = page.getByRole("button", { name: "Pair now" });
  await expect(pairBtn).toBeVisible({ timeout: 5_000 });
  await pairBtn.click();

  // After pairing, loadAndRender() re-runs discover(). The stub now returns
  // paired:true and the token is in prefs → status "Connected ✓".
  await expect(
    page.locator(".status.success", { hasText: "Connected" }),
  ).toBeVisible({ timeout: 15_000 });

  await page.screenshot({ path: `${SCREENSHOTS}/local-search-a2-connected.png` });

  // Enable local search via the toggle switch label (the <input> checkbox is
  // hidden with CSS; click the wrapping <label class="toggle-switch"> instead).
  const toggleLabel = page.locator("label.toggle-switch:has(#ls-enable)");
  await expect(toggleLabel).toBeVisible({ timeout: 5_000 });

  // Verify the underlying checkbox is enabled but not yet checked.
  const enableChk = page.locator("#ls-enable");
  await expect(enableChk).toBeEnabled({ timeout: 5_000 });
  await expect(enableChk).not.toBeChecked();

  await toggleLabel.click();
  await expect(enableChk).toBeChecked({ timeout: 3_000 });

  await page.screenshot({ path: `${SCREENSHOTS}/local-search-a3-enabled.png` });

  await page.close();
});

// ── Step B: Search ────────────────────────────────────────────────────────────

test("Step B: type 's report' in newtab and verify results render", async ({ context, extensionId }) => {
  // Inject paired prefs via an extension page before opening newtab.
  const prePage = await context.newPage();
  await prePage.goto(`chrome-extension://${extensionId}/options/options.html`);
  await injectPrefs(prePage, PAIRED_PREFS);
  await prePage.close();

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);

  // Wait for the newtab to finish init() — essential before pressing Enter
  // (handleSearch no-ops while config is null or localSearchPrefs is null).
  await page.locator("html[data-ft-ready]").waitFor({ timeout: 10_000 });

  const searchInput = page.locator("#search-input");
  await searchInput.fill("s report");
  await page.keyboard.press("Enter");

  // The local-search container is lazily created + made visible on openLocalSearch().
  // Wait for it to appear in the DOM and not have the "hidden" class.
  await page.waitForSelector("#ls-container:not(.hidden)", { timeout: 15_000 });

  // The results list should contain the three canned file names.
  const list = page.locator("#ls-list");
  await expect(list).toBeVisible({ timeout: 10_000 });

  const primaryItems = list.locator(".ls-result-primary");
  await expect(primaryItems).toHaveCount(3, { timeout: 10_000 });

  const names = await primaryItems.allTextContents();
  expect(names).toContain("report-2024.pdf");
  expect(names).toContain("report-draft.docx");
  expect(names).toContain("quarterly-report.xlsx");

  // Toolbar must be present.
  const toolbar = page.locator("#ls-toolbar");
  await expect(toolbar).toBeVisible();

  // Footer shows result count.
  const footer = page.locator("#ls-footer");
  await expect(footer).toBeVisible();
  await expect(footer).toContainText("3 results");

  await page.screenshot({ path: `${SCREENSHOTS}/local-search-b1-results.png` });
  await page.close();
});

// ── Step C: Interactions ──────────────────────────────────────────────────────

test("Step C: view toggle, sort change, and file open", async ({ context, extensionId }) => {
  // Inject paired prefs.
  const prePage = await context.newPage();
  await prePage.goto(`chrome-extension://${extensionId}/options/options.html`);
  await injectPrefs(prePage, PAIRED_PREFS);
  await prePage.close();

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);
  await page.locator("html[data-ft-ready]").waitFor({ timeout: 10_000 });

  // Trigger local search.
  await page.locator("#search-input").fill("s report");
  await page.keyboard.press("Enter");

  await page.waitForSelector("#ls-container:not(.hidden)", { timeout: 15_000 });

  // Wait for results.
  const list = page.locator("#ls-list");
  await expect(list.locator(".ls-result-primary")).toHaveCount(3, { timeout: 10_000 });

  const searchCountBefore = getSearchCallCount();

  // ── View toggle: list → grid ─────────────────────────────────────────────

  const gridBtn = page.locator('[data-view="grid"]');
  await expect(gridBtn).toBeVisible();
  await gridBtn.click();

  // The list's data-view attribute should update to "grid".
  await expect(list).toHaveAttribute("data-view", "grid", { timeout: 5_000 });

  // Results should still be present (re-render without a new search request).
  await expect(list.locator(".ls-result-primary")).toHaveCount(3);

  await page.screenshot({ path: `${SCREENSHOTS}/local-search-c1-grid.png` });

  // ── Sort change: triggers a new search ───────────────────────────────────

  const sortField = page.locator(".ls-sort-field");
  await expect(sortField).toBeVisible();
  await sortField.selectOption("modified");

  // Wait for a new search request to fire.
  await expect
    .poll(() => getSearchCallCount(), { timeout: 8_000, intervals: [200] })
    .toBeGreaterThan(searchCountBefore);

  // Results repopulate.
  await expect(list.locator(".ls-result-primary")).toHaveCount(3, { timeout: 8_000 });

  const lastSearch = getLastSearchBody() as Record<string, unknown>;
  expect(lastSearch?.sort).toMatchObject({ field: "modified" });

  await page.screenshot({ path: `${SCREENSHOTS}/local-search-c2-sort.png` });

  // ── File open: clicking a row calls /v1/open ──────────────────────────────

  const openCountBefore = getOpenCallCount();

  const firstRow = list.locator(".ls-result-row").first();
  await expect(firstRow).toBeVisible();
  await firstRow.click();

  // Wait for the open RPC to fire.
  await expect
    .poll(() => getOpenCallCount(), { timeout: 8_000, intervals: [200] })
    .toBeGreaterThan(openCountBefore);

  expect(getLastOpenPath()).toBe("/home/user/docs/report-2024.pdf");

  await page.screenshot({ path: `${SCREENSHOTS}/local-search-c3-open.png` });

  await page.close();
});
