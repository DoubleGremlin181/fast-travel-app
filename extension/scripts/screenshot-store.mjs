/**
 * Capture store-ready extension screenshots at 1280x800.
 * Saves to scripts/screenshots/store/.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT_DIR = path.resolve(__dirname, "../dist");
const OUT_DIR = path.resolve(__dirname, "screenshots/store");
fs.mkdirSync(OUT_DIR, { recursive: true });

const W = 1280, H = 800;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ft-store-"));
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [
    `--disable-extensions-except=${EXT_DIR}`,
    `--load-extension=${EXT_DIR}`,
    "--no-first-run",
    "--no-default-browser-check",
    `--window-size=${W},${H}`,
  ],
  viewport: { width: W, height: H },
});

let worker = context.serviceWorkers()[0];
if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 15_000 });
const extId = worker.url().split("/")[2];

const shot = async (page, name) => {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file });
  console.log("Saved:", file, `(${W}x${H})`);
};

const page = await context.newPage();

// 1. New tab — idle, command chips visible
await page.goto(`chrome-extension://${extId}/newtab/newtab.html`, { waitUntil: "networkidle" });
await page.waitForSelector("#search-input", { timeout: 8000 });
await page.waitForTimeout(1200);
await shot(page, "01-newtab");

// 2. New tab — command typed + suggestions
await page.click("#search-input");
await page.fill("#search-input", "");
await page.type("#search-input", "yt lofi beats", { delay: 40 });
await page.waitForTimeout(1800); // let suggestions resolve
await shot(page, "02-suggestions");

// 3. Options — commands editor
await page.goto(`chrome-extension://${extId}/options/options.html#/commands`, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await shot(page, "03-commands");

await context.close();
fs.rmSync(userDataDir, { recursive: true, force: true });
console.log("Done.");
