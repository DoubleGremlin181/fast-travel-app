import { test, expect } from "./fixtures";

test("settings: sidebar has 6 items in correct order", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/options.html`);
  const links = page.locator(".sidebar-link");
  await expect(links).toHaveCount(6);
  const texts = await links.allTextContents();
  const trimmed = texts.map(t => t.trim());
  expect(trimmed).toEqual(["Appearance", "Configuration", "Ignore list", "History", "Set as default", "About"]);
});

test("settings: Configuration screen shows Commands, Groups, Default command, Import/Export", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/options.html#/configuration`);
  // Nav rows are role="button" divs containing a <span> with the label text
  await expect(page.locator('.nav-list-item span', { hasText: "Commands" })).toBeVisible();
  await expect(page.locator('.nav-list-item span', { hasText: "Groups" })).toBeVisible();
  await expect(page.locator('label[for="default-cmd"]')).toBeVisible();
  await expect(page.locator('.nav-list-item span', { hasText: "Import / Export" })).toBeVisible();
});

test("settings: clicking Commands in Configuration navigates to commands list", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/options.html#/configuration`);
  await page.locator('.nav-list-item', { hasText: "Commands" }).first().click();
  await expect(page).toHaveURL(/.*#\/commands$/);
});

test("settings: Import/Export link navigates to import-export screen", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/options.html#/configuration`);
  await page.locator('.nav-list-item', { hasText: "Import / Export" }).click();
  await expect(page).toHaveURL(/.*#\/import-export$/);
  await expect(page.locator(".card-header", { hasText: "Import from file" })).toBeVisible();
  await expect(page.locator(".card-header", { hasText: "Import from URL" })).toBeVisible();
  await expect(page.locator(".card-header", { hasText: "Export" })).toBeVisible();
});
