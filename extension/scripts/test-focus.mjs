import { chromium } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHROME_EXT = path.resolve(__dirname, "../dist-chrome");

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ft-focus-test-"));
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [
    `--disable-extensions-except=${CHROME_EXT}`,
    `--load-extension=${CHROME_EXT}`,
    "--no-first-run",
    "--no-default-browser-check",
  ],
});

async function check(page, label) {
  // Sample at 100 ms, 300 ms, 800 ms to capture focus race behaviour
  const samples = [];
  for (const delay of [100, 300, 800]) {
    await page.waitForTimeout(delay === 100 ? 100 : delay - samples.at(-1)?._delay ?? 0);
    const snap = await page.evaluate(() => ({
      url:       location.href,
      hasFocus:  document.hasFocus(),
      activeId:  document.activeElement?.id   ?? "(none)",
      activeTag: document.activeElement?.tagName?.toLowerCase() ?? "(none)",
    }));
    snap._delay = delay;
    samples.push(snap);
  }

  console.log(`\n── ${label} ──`);
  for (const s of samples) {
    const focused = s.activeId === "search-input";
    console.log(`  @${s._delay}ms  hasFocus=${s.hasFocus}  active=<${s.activeTag}#${s.activeId}>  url=${s.url}`);
    console.log(`         search-input focused: ${focused ? "✓ YES" : "✗ NO"}`);
  }
  return samples.at(-1);
}

try {
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 15000 });
  const extId = worker.url().split("/")[2];
  console.log("Extension ID:", extId);
  console.log("Chrome build:", (await context.browser().version()));

  // ── Test 1: chrome://newtab/ ── real new-tab trigger ──────────────────────
  {
    const page = await context.newPage();
    await page.goto("chrome://newtab/", { waitUntil: "commit" });
    await page.waitForSelector("#search-input", { timeout: 8000 });
    const final = await check(page, "chrome://newtab/ (real NTP trigger)");
    console.log(`  → URL bar shows: ${final.url}`);
    await page.close();
  }

  // ── Test 2: direct extension URL ──────────────────────────────────────────
  {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extId}/newtab/newtab.html`);
    await page.waitForSelector("#search-input", { timeout: 8000 });
    const final = await check(page, "direct chrome-extension:// URL");
    console.log(`  → URL bar shows: ${final.url}`);
    await page.close();
  }

  // ── Test 3: open multiple new tabs in quick succession ────────────────────
  console.log("\n── Rapid tab test (3 tabs opened back-to-back) ──");
  const rapidPages = [];
  for (let i = 0; i < 3; i++) {
    const p = await context.newPage();
    await p.goto("chrome://newtab/", { waitUntil: "commit" });
    rapidPages.push(p);
  }
  for (let i = 0; i < rapidPages.length; i++) {
    const p = rapidPages[i];
    await p.waitForSelector("#search-input", { timeout: 8000 });
    await p.waitForTimeout(500);
    const s = await p.evaluate(() => ({
      activeId: document.activeElement?.id ?? "(none)",
      hasFocus: document.hasFocus(),
      url: location.href,
    }));
    console.log(`  tab ${i + 1}: focused=${s.activeId === "search-input" ? "✓" : "✗"} hasFocus=${s.hasFocus} url=${s.url}`);
    await p.close();
  }

} finally {
  await context.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
}
