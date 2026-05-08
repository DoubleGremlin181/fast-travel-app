/**
 * Tests whether Chrome keeps the tab in NTP mode (blank address bar) when
 * our extension newtab page loads, and whether history.replaceState breaks it.
 *
 * Key signals:
 *  - page.url() at commit  → what Chrome assigns before page JS runs
 *  - chrome.tabs.getCurrent().url  → what Chrome's tab object reports (NTP = "chrome://newtab/")
 *  - document.activeElement  → confirms search-input is focused
 */
import { chromium } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHROME_EXT = path.resolve(__dirname, "../dist-chrome");

async function runTest(label, disableReplaceState) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ft-ntp-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${CHROME_EXT}`,
      `--load-extension=${CHROME_EXT}`,
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });
  try {
    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 15000 });

    const page = await context.newPage();

    // Intercept the replaceState call before page JS runs (if testing without it)
    if (disableReplaceState) {
      await page.addInitScript(() => {
        const orig = history.replaceState.bind(history);
        history.replaceState = (state, title, url) => {
          if (url === "/") {
            console.log("[test] replaceState to / BLOCKED");
            return;
          }
          orig(state, title, url);
        };
      });
    }

    // Capture URL immediately at commit (before page JS)
    const commitUrlPromise = new Promise(resolve => {
      page.on("framenavigated", frame => {
        if (frame === page.mainFrame()) resolve(frame.url());
      });
    });

    await page.goto("chrome://newtab/", { waitUntil: "commit" });
    const urlAtCommit = await Promise.race([commitUrlPromise, Promise.resolve(page.url())]);

    await page.waitForSelector("#search-input", { timeout: 8000 });
    await page.waitForTimeout(600);

    // Query what Chrome's tab object thinks the URL is
    const tabInfo = await page.evaluate(() =>
      new Promise(resolve => chrome.tabs.getCurrent(tab => resolve(tab)))
    ).catch(() => null);

    const state = await page.evaluate(() => ({
      locationHref: location.href,
      activeId: document.activeElement?.id ?? "(none)",
      hasFocus: document.hasFocus(),
    }));

    console.log(`\n── ${label} ──`);
    console.log(`  url at commit:         ${urlAtCommit}`);
    console.log(`  location.href now:     ${state.locationHref}`);
    console.log(`  chrome.tabs url:       ${tabInfo?.url ?? "(unavailable)"}`);
    console.log(`  chrome.tabs pendingUrl:${tabInfo?.pendingUrl ?? "(none)"}`);
    console.log(`  activeElement:         <${state.activeId}>`);
    console.log(`  hasFocus:              ${state.hasFocus}`);
    console.log(`  search-input focused:  ${state.activeId === "search-input" ? "✓ YES" : "✗ NO"}`);
    console.log(`  NTP mode likely:       ${tabInfo?.url === "chrome://newtab/" ? "✓ YES (blank bar)" : "✗ NO (extension URL visible)"}`);

  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

// Test 1: current behaviour (replaceState runs, changes URL to "/")
await runTest("WITH history.replaceState(null,'','/')", false);

// Test 2: without replaceState — does Chrome keep NTP mode?
await runTest("WITHOUT replaceState (NTP mode preserved?)", true);
