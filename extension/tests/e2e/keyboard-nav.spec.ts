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

  // Tab with no explicit selection completes the top suggestion.
  await input.press("Tab");

  await expect(input).toHaveValue(`${trigger} `);
  await expect(page.locator("#suggestions-dropdown")).toHaveClass(/hidden/);
  await expect(input).toBeFocused();
  // Tab must NOT navigate away from the new-tab page.
  expect(page.url()).toContain(`chrome-extension://${extensionId}/newtab/newtab.html`);
});
