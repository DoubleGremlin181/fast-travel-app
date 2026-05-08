/**
 * Capture screenshots of every options screen for visual comparison.
 * Saves to scripts/screenshots/.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT_DIR = path.resolve(__dirname, "../dist");
const OUT_DIR = path.resolve(__dirname, "screenshots");
fs.mkdirSync(OUT_DIR, { recursive: true });

const SCREENS = [
  { hash: "", name: "appearance" },
  { hash: "#/configuration", name: "configuration" },
  { hash: "#/commands", name: "commands" },
  { hash: "#/groups", name: "groups" },
  { hash: "#/ignore-list", name: "ignore-list" },
  { hash: "#/import-export", name: "import-export" },
  { hash: "#/about", name: "about" },
];

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ft-ss-"));
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [
    `--disable-extensions-except=${EXT_DIR}`,
    `--load-extension=${EXT_DIR}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1280,900",
  ],
  viewport: { width: 1280, height: 900 },
});

let worker = context.serviceWorkers()[0];
if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 15_000 });
const extId = worker.url().split("/")[2];
const base = `chrome-extension://${extId}/options/options.html`;

const page = await context.newPage();
for (const { hash, name } of SCREENS) {
  await page.goto(base + hash);
  await page.waitForTimeout(600);
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log("Saved:", file);
}

await context.close();
fs.rmSync(userDataDir, { recursive: true, force: true });
console.log("Done.");
