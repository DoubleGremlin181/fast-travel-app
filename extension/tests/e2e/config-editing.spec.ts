import { test, expect } from "./fixtures";
import fs from "node:fs";

async function getStoredConfig(context: import("@playwright/test").BrowserContext, extensionId: string) {
  const sw = context.serviceWorkers()[0];
  return sw.evaluate(() =>
    chrome.storage.local.get("fast-travel-config").then(v => v["fast-travel-config"])
  );
}

async function getDirtyFlag(context: import("@playwright/test").BrowserContext) {
  const sw = context.serviceWorkers()[0];
  return sw.evaluate(() =>
    chrome.storage.local.get("fast-travel-config-dirty").then(v => v["fast-travel-config-dirty"] ?? false)
  );
}

/**
 * Locate the input inside the form-row whose <label> text matches `label`
 * exactly. The form-row markup is `<div class="form-row"><label>X</label>
 * <input/></div>` with no `for=` attribute, so getByLabel doesn't bind.
 */
function inputByLabel(page: import("@playwright/test").Page, label: string) {
  return page.locator(`.form-row:has(> label:text-is("${label}")) > input`);
}

test("config: adding a command sets dirty flag", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/options.html#/commands/new`);

  await inputByLabel(page, "ID").fill("test-cmd");
  await inputByLabel(page, "Name").fill("Test Command");
  await inputByLabel(page, "Triggers (comma-separated)").fill("tc");
  await inputByLabel(page, "Default URL").first().fill("https://test.com");
  await page.locator("button.primary", { hasText: "Save command" }).click();

  await page.waitForURL(/.*#\/commands$/);

  const dirty = await getDirtyFlag(context);
  expect(dirty).toBe(true);
});

test("config: editing default command sets dirty flag", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/options.html#/configuration`);

  const select = page.locator('select#default-cmd');
  // Wait for the async config load to populate the dropdown before asserting.
  await expect.poll(() => select.locator("option").count()).toBeGreaterThan(1);
  const options = await select.locator("option").allTextContents();
  expect(options.length).toBeGreaterThan(1);

  const current = await select.inputValue();
  const other = await select.locator(`option:not([value="${current}"])`).first().getAttribute("value");
  await select.selectOption(other!);

  await page.waitForTimeout(300);
  const dirty = await getDirtyFlag(context);
  expect(dirty).toBe(true);
});

test("config: export produces valid JSON matching stored config", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/options.html#/import-export`);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("button", { hasText: "Export config" }).click(),
  ]);

  // Use Playwright's own download dir + path() instead of CDP setDownloadBehavior:
  // the latter routes the file outside Playwright's bookkeeping, which makes
  // download.createReadStream() resolve to an empty stream.
  const path = await download.path();
  const exported = JSON.parse(fs.readFileSync(path, "utf-8"));

  const stored = await getStoredConfig(context, extensionId);
  expect(exported).toEqual(stored);
});

test("config: importing a valid file replaces config", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/options.html#/import-export`);

  const sw = context.serviceWorkers()[0];
  const original = await sw.evaluate(() =>
    chrome.storage.local.get("fast-travel-config").then(v => v["fast-travel-config"])
  );
  // Append a sentinel to ignoreList rather than mutating defaultCommand, which
  // would dangle (lintConfig rejects a defaultCommand that no command matches)
  // and the import would be refused before reaching storage.
  const sentinel = "test-import-marker.example";
  const modified = { ...original, ignoreList: [...(original.ignoreList ?? []), sentinel] };

  await page.evaluate((cfg) => {
    const blob = new Blob([JSON.stringify(cfg)], { type: "application/json" });
    const dt = new DataTransfer();
    const file = new File([blob], "test.json", { type: "application/json" });
    dt.items.add(file);
    (document.getElementById("file-import-input") as HTMLInputElement).files = dt.files;
    (document.getElementById("file-import-input") as HTMLInputElement).dispatchEvent(new Event("change"));
  }, modified);

  // The change handler is async (file.text → lintConfig → setConfig over the
  // message bus); a fixed sleep races on slower runners. Poll the stored
  // config until the import lands.
  await expect.poll(
    async () => (await getStoredConfig(context, extensionId)).ignoreList ?? [],
    { timeout: 5000 },
  ).toContain(sentinel);
});
