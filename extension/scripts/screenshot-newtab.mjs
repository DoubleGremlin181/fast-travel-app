import { chromium } from "@playwright/test";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHROME_EXT = path.resolve(__dirname, "../dist-chrome");
const OUT = "/tmp/ft-addressbar.png";

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ft-ss-"));
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [
    `--disable-extensions-except=${CHROME_EXT}`,
    `--load-extension=${CHROME_EXT}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1200,768",
    "--window-position=0,0",
  ],
});

try {
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 15000 });

  const page = await context.newPage();
  await page.goto("chrome://newtab/", { waitUntil: "commit" });
  await page.waitForSelector("#search-input", { timeout: 8000 });
  await page.waitForTimeout(1500);

  // Use magick import (ImageMagick 7 CLI) to grab the root X window
  execSync(`DISPLAY=:1 magick import -window root /tmp/ft-full.png`);
  // Crop to just the browser chrome strip at the top (address bar area)
  execSync(`magick /tmp/ft-full.png -crop 1200x80+0+0 +repage ${OUT}`);
  console.log("Screenshot saved:", OUT);
} finally {
  await context.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
}
