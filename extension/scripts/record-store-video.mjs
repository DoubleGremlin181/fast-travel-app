// Records a fast-paced store-listing demo video of the new-tab search bar: for
// each scenario it types a command, lets the live suggestions dropdown render,
// then navigates to the real destination. Each scenario is recorded as its own
// WebM (Playwright `recordVideo`), then ffmpeg crops/pan-zooms each clip and
// concatenates them into a single 16:9 montage.
//
// This is a regeneration tool, NOT a test. It needs network access and live
// sites, so it lives in scripts/ (not tests/) and is excluded from the e2e run.
// It deliberately mirrors record-demos.mjs — same launch flags, light-theme
// injection, race-free navigation wait, and per-page WebM capture.
//
// Usage:
//   cd extension && npm run record:store-video
//   (or: npm run build && node scripts/record-store-video.mjs [name-filter])
//
// Output: docs/store-video/browser.mp4  (committed)
// Requires: a built extension/dist, the system `ffmpeg`, and Playwright's chromium.

import { chromium } from "@playwright/test";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { assertFfmpeg, normalizeClip, concatClips } from "./lib/montage.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, "../dist");
const REPO_ROOT = path.resolve(__dirname, "../..");
const OUT_DIR = path.join(REPO_ROOT, "docs/store-video");
const OUT_FILE = path.join(OUT_DIR, "browser.mp4");

const VIEWPORT = { width: 1000, height: 720 };
const TYPE_DELAY = 55; // ms per char — tighter than record-demos for a fast-paced feel
const DROPDOWN_LINGER_MS = 500; // hold on the live suggestions dropdown
const SETTLE_MS = 1200; // default hold on the destination so the "arrival" reads

// Light theme, applied before first paint (src/ui/apply-theme.ts reads this key).
const APPEARANCE = { mode: "light", variant: "material", shape: "pill" };

// Montage order = narrative: same topic via several routes (g → ddg → r/ → r/ search),
// then varied commands across media / dev / reference / finance / AI.
// `removeSelector` strips a late-injected consent banner before it can paint
// (see record-demos.mjs); add one per-scenario if a banner shows up while tuning.
/** @type {{ name: string, input: string, navPattern: RegExp, settleMs?: number, removeSelector?: string }[]} */
const SCENARIOS = [
  { name: "01-google", input: "g mechanical keyboards", navPattern: /google\.com\/search\?q=/ },
  { name: "02-duckduckgo", input: "ddg mechanical keyboards", navPattern: /duckduckgo\.com/ },
  { name: "03-reddit-subreddit", input: "r/mechanicalkeyboards", navPattern: /reddit\.com\/r\/mechanicalkeyboards/ },
  { name: "04-reddit-search", input: "r/mechanicalkeyboard best keyboard under $250", navPattern: /google\.com\/search/ },
  { name: "05-youtube", input: "yt lofi hip hop radio", navPattern: /youtube\.com\/results/ },
  { name: "06-github", input: "gh facebook/react", navPattern: /github\.com\/facebook\/react/ },
  { name: "07-wikipedia", input: "w machine learning", navPattern: /en\.wikipedia\.org/ },
  { name: "08-stocks", input: "$TSLA", navPattern: /finance\.yahoo\.com\/quote\/TSLA/ },
  { name: "09-chatgpt", input: "qq best mechanical keyboard switches", navPattern: /(chat\.openai\.com|chatgpt\.com)/ },
];

function assertPreconditions() {
  if (!fs.existsSync(path.join(EXTENSION_PATH, "manifest.json"))) {
    console.error(`No built extension at ${EXTENSION_PATH}. Run \`npm run build\` first.`);
    process.exit(1);
  }
  assertFfmpeg();
}

// Race-free: attach the request listener synchronously, then press Enter. Resolves
// the moment the main-frame navigation is issued (mirrors record-demos.mjs).
async function pressEnterAndWaitNav(page, pattern) {
  await Promise.all([
    page.waitForRequest(
      (r) => r.isNavigationRequest() && r.frame() === page.mainFrame() && pattern.test(r.url()),
      { timeout: 15000 },
    ),
    page.keyboard.press("Enter"),
  ]);
}

async function recordScenario(context, extensionId, scenario) {
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

  await pressEnterAndWaitNav(page, scenario.navPattern);
  await page.waitForLoadState("load", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(scenario.settleMs ?? SETTLE_MS);

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

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
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
      recorded.push(await recordScenario(context, extensionId, scenario));
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
