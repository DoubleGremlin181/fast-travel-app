/**
 * Launch a persistent Chromium window with the extension loaded for manual testing.
 * Navigates directly to the options page and leaves the browser open.
 *
 * Usage: node scripts/launch-browser.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT_DIR = path.resolve(__dirname, "../dist");

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ft-manual-"));

console.log("Launching Chromium with extension:", EXT_DIR);

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [
    `--disable-extensions-except=${EXT_DIR}`,
    `--load-extension=${EXT_DIR}`,
    "--no-first-run",
    "--no-default-browser-check",
  ],
});

// Wait for the service worker to register so we can get the extension ID.
let worker = context.serviceWorkers()[0];
if (!worker) {
  worker = await context.waitForEvent("serviceworker", { timeout: 15_000 });
}
const extId = worker.url().split("/")[2];
const optionsUrl = `chrome-extension://${extId}/options/options.html`;

const page = await context.newPage();
await page.goto(optionsUrl);
console.log("Opened:", optionsUrl);
console.log("Browser is open — close the window when done.");

// Keep the process alive until the browser is closed.
await context.waitForEvent("close", { timeout: 0 });
fs.rmSync(userDataDir, { recursive: true, force: true });
