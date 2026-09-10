import { test, expect } from "./fixtures";

// Covers the omnibox-style keyboard model (issue #60): arrowing autofills the
// input with the highlighted suggestion, arrowing back above the top row (or
// Escape) restores the originally-typed text, commands autofill with a trailing
// space so type-ahead continues the command, Tab accepts without searching, and
// Enter acts like a click.

async function openNewtab(context: import("@playwright/test").BrowserContext, extensionId: string) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);
  // Chips only appear once config has loaded; suggestions need config too.
  await page.locator(".quick-chip").first().waitFor({ state: "visible", timeout: 5000 });
  return page;
}

test("ArrowDown autofills the highlighted command with a trailing space (auto-space)", async ({
  context,
  extensionId,
}) => {
  const page = await openNewtab(context, extensionId);
  const input = page.locator("#search-input");

  // "g" prefix matches command triggers like "gh"/"gi" (not "g" itself).
  await input.fill("g");
  const firstItem = page.locator(".suggestion-item.suggestion-command").first();
  await firstItem.waitFor({ state: "visible", timeout: 5000 });
  const trigger = (await firstItem.locator(".suggestion-trigger").textContent())?.trim();
  expect(trigger).toBeTruthy();

  await input.press("ArrowDown");

  // The highlighted command is written into the box with a trailing space.
  await expect(input).toHaveValue(`${trigger} `);
  await expect(page.locator(".suggestion-item.active")).toHaveCount(1);

  // Type-ahead continues the command: "gh " + "react" => "gh react".
  await page.keyboard.type("react");
  await expect(input).toHaveValue(`${trigger} react`);
});

test("ArrowUp above the first row restores the originally-typed text", async ({
  context,
  extensionId,
}) => {
  const page = await openNewtab(context, extensionId);
  const input = page.locator("#search-input");

  await input.fill("g");
  await page.locator(".suggestion-item.suggestion-command").first().waitFor({ state: "visible" });

  await input.press("ArrowDown"); // autofills the first command
  await expect(input).not.toHaveValue("g");
  await input.press("ArrowUp"); // back above the top -> restore typed text

  await expect(input).toHaveValue("g");
  await expect(page.locator(".suggestion-item.active")).toHaveCount(0);
});

test("Escape restores typed text and closes the dropdown", async ({ context, extensionId }) => {
  const page = await openNewtab(context, extensionId);
  const input = page.locator("#search-input");

  await input.fill("g");
  await page.locator(".suggestion-item.suggestion-command").first().waitFor({ state: "visible" });

  await input.press("ArrowDown");
  await expect(input).not.toHaveValue("g");

  await input.press("Escape");
  await expect(input).toHaveValue("g");
  await expect(page.locator("#suggestions-dropdown")).toHaveClass(/hidden/);
});

test("Tab accepts the top suggestion into the box without searching", async ({
  context,
  extensionId,
}) => {
  const page = await openNewtab(context, extensionId);
  const input = page.locator("#search-input");

  await input.fill("g");
  const firstItem = page.locator(".suggestion-item.suggestion-command").first();
  await firstItem.waitFor({ state: "visible" });
  const trigger = (await firstItem.locator(".suggestion-trigger").textContent())?.trim();

  // Tab with no explicit selection completes the top suggestion, appends a
  // trailing space, and keeps the dropdown open (suggestions for the completed
  // query) instead of closing it.
  await input.press("Tab");

  await expect(input).toHaveValue(`${trigger} `);
  await expect(page.locator("#suggestions-dropdown")).not.toHaveClass(/hidden/);
  await expect(input).toBeFocused();
  // Tab must NOT navigate away from the new-tab page.
  expect(page.url()).toContain(`chrome-extension://${extensionId}/newtab/newtab.html`);
});

// Issue #83: the highlight cycles through the typed-text state, so the last
// row is one keystroke away instead of a held ArrowDown.

test("ArrowUp with nothing highlighted wraps to the last suggestion", async ({
  context,
  extensionId,
}) => {
  const page = await openNewtab(context, extensionId);
  const input = page.locator("#search-input");

  await input.fill("g");
  await page.locator(".suggestion-item.suggestion-command").first().waitFor({ state: "visible" });
  // Let the debounced API rows land so the list stops re-rendering under us.
  await page.waitForTimeout(600);
  const rows = page.locator(".suggestion-item");
  const count = await rows.count();
  expect(count).toBeGreaterThan(1);

  await input.press("ArrowUp");

  await expect(page.locator(".suggestion-item.active")).toHaveCount(1);
  await expect(rows.nth(count - 1)).toHaveClass(/active/);
});

test("ArrowDown off the bottom wraps back to the typed text", async ({
  context,
  extensionId,
}) => {
  const page = await openNewtab(context, extensionId);
  const input = page.locator("#search-input");

  await input.fill("g");
  await page.locator(".suggestion-item.suggestion-command").first().waitFor({ state: "visible" });
  await page.waitForTimeout(600);

  // ArrowUp lands on the last row; ArrowDown from there completes the cycle.
  await input.press("ArrowUp");
  await expect(input).not.toHaveValue("g");
  await input.press("ArrowDown");

  await expect(page.locator(".suggestion-item.active")).toHaveCount(0);
  await expect(input).toHaveValue("g");
});

test("ArrowUp then ArrowDown returns to where it started", async ({
  context,
  extensionId,
}) => {
  const page = await openNewtab(context, extensionId);
  const input = page.locator("#search-input");

  await input.fill("g");
  await page.locator(".suggestion-item.suggestion-command").first().waitFor({ state: "visible" });
  await page.waitForTimeout(600);

  // Step down onto the first row, then wrap up through the typed text and back
  // down — the highlight must land on the first row again.
  await input.press("ArrowDown");
  const firstValue = await input.inputValue();
  await input.press("ArrowUp"); // -> typed text
  await expect(input).toHaveValue("g");
  await input.press("ArrowUp"); // -> wraps to the last row
  await input.press("ArrowDown"); // -> back to the typed text
  await expect(input).toHaveValue("g");
  await input.press("ArrowDown"); // -> first row again
  await expect(input).toHaveValue(firstValue);
});
