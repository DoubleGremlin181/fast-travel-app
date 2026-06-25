import { test, expect } from "./fixtures";

// A typo suggestion appears when the first token is one edit away from a real
// trigger. "scholor" is distance 1 from the default config's "scholar" command.
async function showTypoPrompt(page: import("@playwright/test").Page) {
  await page.locator("html[data-ft-ready]").waitFor();
  const input = page.locator("#search-input");
  await input.fill("scholor");
  await page.keyboard.press("Enter");
  await expect(page.locator("#typo-container")).toBeVisible();
  await expect(page.locator("#typo-message")).toContainText("scholar");
}

test("pressing Y accepts the typo suggestion and navigates to the corrected URL", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);
  await showTypoPrompt(page);

  const [request] = await Promise.all([
    page.waitForRequest(
      (r) =>
        r.isNavigationRequest() &&
        r.frame() === page.mainFrame() &&
        /scholar\.google\.com/.test(r.url()),
      { timeout: 8000 },
    ),
    page.keyboard.press("y"),
  ]);
  expect(request.url()).toMatch(/scholar\.google\.com/);
});

test("pressing I ignores the typo and searches the verbatim query on the default engine", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);
  await showTypoPrompt(page);

  // Ignoring re-runs the search with the trigger ignored, so the literal text
  // "scholor" goes to the default engine (google in the bundled config).
  const [request] = await Promise.all([
    page.waitForRequest(
      (r) =>
        r.isNavigationRequest() &&
        r.frame() === page.mainFrame() &&
        /google\.com\/search\?q=/.test(r.url()),
      { timeout: 8000 },
    ),
    page.keyboard.press("i"),
  ]);
  expect(new URL(request.url()).searchParams.get("q")).toBe("scholor");
});

test("pressing N declines the typo and searches on the default engine (hidden alias)", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);
  await showTypoPrompt(page);

  // "n" ("no") mirrors the "G / Default search" button without permanently
  // ignoring the trigger. Bundled default is google.
  const [request] = await Promise.all([
    page.waitForRequest(
      (r) =>
        r.isNavigationRequest() &&
        r.frame() === page.mainFrame() &&
        /google\.com\/search\?q=/.test(r.url()),
      { timeout: 8000 },
    ),
    page.keyboard.press("n"),
  ]);
  expect(new URL(request.url()).searchParams.get("q")).toBe("scholor");
});

// PS: declining a typo must route to the user's configured default engine, not a
// hard-coded Google. That fallback is pure parser logic (parseCommand →
// makeDefaultSearch using config.defaultCommand), verified deterministically in the
// unit suite — see "default engine independence › dismissing a typo (trigger
// ignored) searches the default engine, not Google" in tests/unit/parser.test.ts.
// The tests above prove the n/g keys reach defaultSearch and navigate; seeding a
// non-Google default through the MV3 storage layer here is flaky (the worker's
// install-time remote fetch resets it).
