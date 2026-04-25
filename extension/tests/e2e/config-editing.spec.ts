import { test, expect } from "./fixtures";

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

test("config: adding a command sets dirty flag", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/options.html#/commands/new`);

  await page.fill('[placeholder="unique-id"]', "test-cmd");
  await page.fill('[placeholder*="name"]', "Test Command");
  const triggerInput = page.locator('input[placeholder*="trigger"]').first();
  await triggerInput.fill("tc");
  await triggerInput.press("Enter");
  await page.fill('[placeholder*="defaultUrl"]', "https://test.com");
  await page.locator("button.primary", { hasText: "Save command" }).click();

  await page.waitForURL(/.*#\/commands$/);

  const dirty = await getDirtyFlag(context);
  expect(dirty).toBe(true);
});

test("config: editing default command sets dirty flag", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/options.html#/configuration`);

  const select = page.locator('select#default-cmd');
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
  const client = await context.newCDPSession(page);

  await client.send("Page.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: "/tmp",
  });

  await page.goto(`chrome-extension://${extensionId}/options/options.html#/import-export`);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("button", { hasText: "Export config" }).click(),
  ]);

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const json = Buffer.concat(chunks).toString("utf-8");
  const exported = JSON.parse(json);

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
  const modified = { ...original, defaultCommand: original.defaultCommand + "-modified-test" };

  await page.evaluate((cfg) => {
    const blob = new Blob([JSON.stringify(cfg)], { type: "application/json" });
    const dt = new DataTransfer();
    const file = new File([blob], "test.json", { type: "application/json" });
    dt.items.add(file);
    (document.getElementById("file-import-input") as HTMLInputElement).files = dt.files;
    (document.getElementById("file-import-input") as HTMLInputElement).dispatchEvent(new Event("change"));
  }, modified);

  await page.waitForTimeout(500);

  const newCfg = await getStoredConfig(context, extensionId);
  expect(newCfg.defaultCommand).toBe(modified.defaultCommand);
});
