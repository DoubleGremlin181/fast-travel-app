import { chromium } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHROME_EXT = path.resolve(__dirname, "../dist-chrome");
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ft-dev-"));

console.log("Launching Chrome with Fast Travel extension...");

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [
    `--disable-extensions-except=${CHROME_EXT}`,
    `--load-extension=${CHROME_EXT}`,
    "--no-first-run",
    "--no-default-browser-check",
  ],
});

let worker = context.serviceWorkers()[0];
if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 15000 });
const extId = worker.url().split("/")[2];
console.log(`Extension ID: ${extId}`);
console.log("Browser is open — press Ctrl+C to close.");

// Open one tab for the user to start with
const page = await context.newPage();
await page.goto(`chrome-extension://${extId}/newtab/newtab.html`);

process.on("SIGINT", async () => {
  await context.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
  process.exit(0);
});

await new Promise(() => {});
