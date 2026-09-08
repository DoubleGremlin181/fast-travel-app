import { test as base, chromium, type BrowserContext } from "@playwright/test";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const EXTENSION_PATH = path.resolve(__dirname, "../../dist");

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  context: async ({}, use) => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ft-pw-"));
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        "--no-first-run",
        "--no-default-browser-check",
      ],
    });
    // onInstalled kicks off a non-blocking fetch of the remote default config
    // (see fetchAndStoreConfig in service-worker.ts). When it lands — typically
    // ~500ms after launch — it replaces the entire config key, silently wiping
    // anything a test wrote to storage before then. That made tests fail or pass
    // depending on network latency. Block it here, before the worker starts, so
    // every test runs deterministically against the bundled config.
    await context.route("https://raw.githubusercontent.com/**", (route) => route.abort());
    await use(context);
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  },
  extensionId: async ({ context }, use) => {
    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent("serviceworker");
    const id = worker.url().split("/")[2];
    await use(id);
  },
});

export const expect = test.expect;
