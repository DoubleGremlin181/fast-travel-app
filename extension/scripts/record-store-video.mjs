// Records a fast-paced store-listing demo video of the new-tab search bar: for
// each scenario it types a command, lets the live suggestions dropdown render,
// then navigates to the real destination. Each scenario is recorded as its own
// WebM (Playwright `recordVideo`), then ffmpeg crops/pan-zooms each clip and
// concatenates them into a single 16:9 montage.
//
// This is a regeneration tool, NOT a test. It needs network access and live
// sites, so it lives in scripts/ (not tests/) and is excluded from the e2e run.
// It reuses the e2e fixtures' approach — same launch flags, light-theme
// injection, race-free navigation wait, and per-page WebM capture.
//
// Usage:
//   cd extension && npm run record:store-video
//   (or: npm run build && node scripts/record-store-video.mjs [name-filter])
//
// Output: docs/store-assets/chrome/promo-video.mp4  (committed)
//         docs/demo/browser-demo.gif  (downscaled montage GIF for the README)
// Requires: a built extension/dist, the system `ffmpeg`, and Playwright's chromium.

import { chromium } from "@playwright/test";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { assertFfmpeg, normalizeClip, concatClips, writeGif } from "./lib/montage.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, "../dist");
const REPO_ROOT = path.resolve(__dirname, "../..");
const OUT_DIR = path.join(REPO_ROOT, "docs/store-assets/chrome");
const OUT_FILE = path.join(OUT_DIR, "promo-video.mp4");
// README montage GIF (a downscaled, optimised copy of the same montage).
const GIF_FILE = path.join(REPO_ROOT, "docs/demo/browser-demo.gif");

const VIEWPORT = { width: 1000, height: 720 };
const TYPE_DELAY = 55; // ms per char — tight typing for a fast-paced feel
const DROPDOWN_LINGER_MS = 500; // hold on the live suggestions dropdown
const SETTLE_MS = 1600; // default hold on the destination so the loaded page (+favicon) reads

// Light theme, applied before first paint (src/ui/apply-theme.ts reads this key).
const APPEARANCE = { mode: "light", variant: "material", shape: "pill" };

// Montage order = narrative: same lookup via several routes (g → ddg → r/ → r/ search),
// then varied commands across media / reference / dev / maps / finance, closing on the
// in-app "Did you mean?" typo card. This list is kept in sync with the Android driver
// (android/.../StoreVideoDriverTest.kt) so both store videos show the same searches.
// `typo: true` scenarios don't navigate — they wait for the typo card instead.
// `removeSelector` strips a late-injected consent banner before it can paint;
// add one per-scenario if a banner shows up while tuning.
/** @type {{ name: string, input: string, navPattern?: RegExp, typo?: boolean, settleMs?: number, removeSelector?: string }[]} */
const SCENARIOS = [
  { name: "01-google", input: "g mechanical keyboards", navPattern: /google\.com\/search\?q=/ },
  { name: "02-duckduckgo", input: "ddg mechanical keyboards", navPattern: /duckduckgo\.com/ },
  { name: "03-reddit-subreddit", input: "r/mechanicalkeyboards", navPattern: /reddit\.com\/r\/mechanicalkeyboards/ },
  { name: "04-reddit-search", input: "r/mechanicalkeyboards best keyboard under $250", navPattern: /reddit\.com|google\.com\/search/, settleMs: 2000 },
  { name: "05-youtube", input: "yt lofi hip hop radio", navPattern: /youtube\.com\/results/, settleMs: 2000 },
  { name: "06-wikipedia", input: "w machine learning", navPattern: /en\.wikipedia\.org/ },
  { name: "07-github", input: "gh facebook/react", navPattern: /github\.com\/facebook\/react/, settleMs: 2000 },
  { name: "08-maps", input: "mp coffee near me", navPattern: /maps\.google\.com|google\.com\/maps/, settleMs: 2000 },
  { name: "09-stocks", input: "$TSLA", navPattern: /finance\.yahoo\.com\/quote\/TSLA/, settleMs: 2500 },
  { name: "10-typo", input: "ddh mechanical keyboards", typo: true, settleMs: 2800 },
];

function assertPreconditions() {
  if (!fs.existsSync(path.join(EXTENSION_PATH, "manifest.json"))) {
    console.error(`No built extension at ${EXTENSION_PATH}. Run \`npm run build\` first.`);
    process.exit(1);
  }
  assertFfmpeg();
}

// Race-free: attach the request listener synchronously, then press Enter. Resolves
// the moment the main-frame navigation is issued (same pattern as the e2e specs).
async function pressEnterAndWaitNav(page, pattern) {
  await Promise.all([
    page.waitForRequest(
      (r) => r.isNavigationRequest() && r.frame() === page.mainFrame() && pattern.test(r.url()),
      { timeout: 15000 },
    ),
    page.keyboard.press("Enter"),
  ]);
}

async function recordScenario(context, extensionId, worker, scenario) {
  // Clear search history before each scenario so the focused-empty state never shows
  // "Recent" entries from earlier scenarios (or a previous recording run).
  await worker
    .evaluate(() => chrome.storage.local.set({ "fast-travel-history": [] }))
    .catch(() => {});

  const page = await context.newPage();
  await page.setViewportSize(VIEWPORT);

  // Strip a consent banner the instant it's injected, before it can paint. Runs
  // on every navigation of this page (incl. the destination).
  if (scenario.removeSelector) {
    await page.addInitScript((selector) => {
      const kill = () => document.querySelectorAll(selector).forEach((el) => el.remove());
      const observe = () => {
        kill();
        new MutationObserver(kill).observe(document.documentElement, {
          childList: true,
          subtree: true,
        });
      };
      if (document.documentElement) observe();
      else document.addEventListener("DOMContentLoaded", observe);
    }, scenario.removeSelector);
  }

  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);

  const input = page.locator("#search-input");
  await input.waitFor({ state: "visible" });
  await page.waitForTimeout(500); // settle on a clean newtab before typing

  await input.type(scenario.input, { delay: TYPE_DELAY });

  // Let the live suggestion dropdown render and linger so it's visible.
  await page
    .locator("#suggestions-dropdown:not(.hidden)")
    .waitFor({ state: "visible", timeout: 4000 })
    .catch(() => {}); // some inputs (e.g. exact prefix) may not open the dropdown
  await page.waitForTimeout(DROPDOWN_LINGER_MS);

  if (scenario.typo) {
    // Typo commands don't navigate — Enter surfaces the in-app "Did you mean?" card.
    await page.keyboard.press("Enter");
    await page
      .locator("#typo-container:not(.hidden)")
      .waitFor({ state: "visible", timeout: 5000 })
      .catch(() => {});
    await page.waitForTimeout(scenario.settleMs ?? SETTLE_MS);
  } else {
    await pressEnterAndWaitNav(page, scenario.navPattern);
    await page.waitForLoadState("load", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(scenario.settleMs ?? SETTLE_MS);
  }

  const video = page.video();
  await page.close(); // flushes the video file
  const webm = video ? await video.path() : null;
  return { ...scenario, webm };
}

async function main() {
  assertPreconditions();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Optional CLI arg: only record scenarios whose name contains this substring.
  const filter = process.argv[2];
  const scenarios = filter ? SCENARIOS.filter((s) => s.name.includes(filter)) : SCENARIOS;
  if (scenarios.length === 0) {
    console.error(`No scenarios match "${filter}".`);
    process.exit(1);
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ft-store-"));
  const videoDir = fs.mkdtempSync(path.join(os.tmpdir(), "ft-store-video-"));
  const clipDir = fs.mkdtempSync(path.join(os.tmpdir(), "ft-store-clips-"));

  // Use Playwright's bundled chromium (default). `channel: "chromium"`/`"chrome"` either
  // fail to install on newer distros or won't register the MV3 service worker via
  // --load-extension; the default download loads the unpacked extension reliably.
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: VIEWPORT,
    recordVideo: { dir: videoDir, size: VIEWPORT },
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      "--no-first-run",
      "--no-default-browser-check",
      // Window larger than the viewport so the recorded frame is exactly VIEWPORT.
      "--window-size=1280,900",
      // Drop the navigator.webdriver fingerprint so live sites don't serve a bot wall.
      "--disable-blink-features=AutomationControlled",
    ],
  });

  try {
    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent("serviceworker");
    const extensionId = worker.url().split("/")[2];

    // Force light theme before any newtab paints.
    await worker.evaluate((appearance) => {
      return chrome.storage.session.set({ "fast-travel-appearance": appearance });
    }, APPEARANCE);

    const recorded = [];
    for (const scenario of scenarios) {
      console.log(`Recording ${scenario.name}: "${scenario.input}"`);
      recorded.push(await recordScenario(context, extensionId, worker, scenario));
    }

    await context.close(); // ensure all videos are written

    // Normalise each clip (crop + pan/zoom + 16:9 pad), then concat into the montage.
    const clips = [];
    for (const r of recorded) {
      if (!r.webm || !fs.existsSync(r.webm)) {
        console.warn(`  ! no video for ${r.name}, skipping`);
        continue;
      }
      const clip = path.join(clipDir, `${r.name}.mp4`);
      console.log(`  normalising ${r.name}`);
      normalizeClip(r.webm, clip);
      clips.push(clip);
    }

    if (clips.length === 0) {
      console.error("No clips were recorded — nothing to concatenate.");
      process.exit(1);
    }

    concatClips(clips, OUT_FILE);
    const kb = (fs.statSync(OUT_FILE).size / 1024).toFixed(0);
    console.log(`-> ${path.relative(REPO_ROOT, OUT_FILE)} (${kb} KB, ${clips.length} clips)`);

    // Also render the README montage GIF from the finished MP4.
    fs.mkdirSync(path.dirname(GIF_FILE), { recursive: true });
    writeGif(OUT_FILE, GIF_FILE);
    const gifKb = (fs.statSync(GIF_FILE).size / 1024).toFixed(0);
    console.log(`-> ${path.relative(REPO_ROOT, GIF_FILE)} (${gifKb} KB)`);
  } finally {
    if (context.browser() || context.serviceWorkers().length) {
      await context.close().catch(() => {});
    }
    fs.rmSync(userDataDir, { recursive: true, force: true });
    fs.rmSync(videoDir, { recursive: true, force: true });
    fs.rmSync(clipDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
