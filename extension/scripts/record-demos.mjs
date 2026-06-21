// Records demo GIFs of the new-tab search bar: typing a command, seeing live
// suggestions, then being redirected to the destination. One GIF per scenario.
//
// This is a regeneration tool, NOT a test. It needs network access and live sites,
// so it deliberately lives in scripts/ (not tests/) and is excluded from the e2e run.
//
// Usage:
//   cd extension && npm run build && node scripts/record-demos.mjs
//   (or: npm run record:demos)
//
// Output: docs/demo/<NN>-<name>.gif  (committed)
// Requires: a built extension/dist and the system `ffmpeg`.

import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, "../dist");
const REPO_ROOT = path.resolve(__dirname, "../..");
const OUT_DIR = path.join(REPO_ROOT, "docs/demo");

const VIEWPORT = { width: 1000, height: 720 };
const TYPE_DELAY = 80; // ms per char, so typing is visibly animated
const SETTLE_MS = 2500; // default hold on the destination so the "arrival" is visible

// Light theme, applied before first paint (src/ui/apply-theme.ts reads this key).
const APPEARANCE = { mode: "light", variant: "material", shape: "pill" };

// `removeSelector` — a MutationObserver installed before first paint removes any node
// matching this selector the instant it's inserted, so a cookie/consent banner never
// becomes visible (add one per-scenario if a banner shows up while tuning).
//
// These README GIFs use the same inputs as the store-listing video
// (extension/scripts/record-store-video.mjs), a representative subset of its searches.
/** @type {{ name: string, input: string, navPattern: RegExp, settleMs?: number, removeSelector?: string }[]} */
const SCENARIOS = [
  { name: "01-google", input: "g mechanical keyboards", navPattern: /google\.com\/search\?q=/ },
  { name: "02-reddit-subreddit", input: "r/mechanicalkeyboards", navPattern: /reddit\.com\/r\/mechanicalkeyboards/ },
  { name: "03-youtube", input: "yt lofi hip hop radio", navPattern: /youtube\.com\/results/, settleMs: 3000 },
  { name: "04-wikipedia", input: "w machine learning", navPattern: /en\.wikipedia\.org/ },
  { name: "05-stocks", input: "$TSLA", navPattern: /finance\.yahoo\.com\/quote\/TSLA/, settleMs: 3000 },
];

function assertPreconditions() {
  if (!fs.existsSync(path.join(EXTENSION_PATH, "manifest.json"))) {
    console.error(`No built extension at ${EXTENSION_PATH}. Run \`npm run build\` first.`);
    process.exit(1);
  }
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  } catch {
    console.error("ffmpeg not found on PATH. Install ffmpeg to convert recordings to GIFs.");
    process.exit(1);
  }
}

// Race-free: attach the request listener synchronously, then press Enter. Resolves
// the moment the main-frame navigation is issued (mirrors tests/e2e/newtab.spec.ts).
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

  // Strip a consent banner the instant it's injected, before it can paint. Runs on
  // every navigation of this page (incl. the destination).
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

  // Let the live suggestion dropdown render and linger so it's visible in the GIF.
  await page
    .locator("#suggestions-dropdown:not(.hidden)")
    .waitFor({ state: "visible", timeout: 4000 })
    .catch(() => {}); // some inputs (e.g. exact prefix) may not open the dropdown
  await page.waitForTimeout(700);

  await pressEnterAndWaitNav(page, scenario.navPattern);
  await page.waitForLoadState("load", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(scenario.settleMs ?? SETTLE_MS);

  const video = page.video();
  await page.close(); // flushes the video file
  const webm = video ? await video.path() : null;
  return { ...scenario, webm };
}

function webmToGif(webm, name) {
  const palette = path.join(os.tmpdir(), `ft-palette-${name}.png`);
  const gif = path.join(OUT_DIR, `${name}.gif`);
  // Chromium leaves a grey window-background gutter around the recorded surface:
  // ~23px on the right of every frame, and ~50px below the (shorter-than-viewport)
  // newtab page. Crop both off — a real user never sees them. Then downscale.
  const filters = "crop=in_w-24:in_h-52:0:0,fps=15,scale=860:-1:flags=lanczos";
  execFileSync("ffmpeg", ["-y", "-i", webm, "-vf", `${filters},palettegen`, palette], {
    stdio: "ignore",
  });
  execFileSync(
    "ffmpeg",
    ["-y", "-i", webm, "-i", palette, "-lavfi", `${filters}[x];[x][1:v]paletteuse`, gif],
    { stdio: "ignore" },
  );
  fs.rmSync(palette, { force: true });
  return gif;
}

async function main() {
  assertPreconditions();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Optional CLI arg: only record scenarios whose name contains this substring
  // (e.g. `node scripts/record-demos.mjs flightaware`). Default: all.
  const filter = process.argv[2];
  const scenarios = filter ? SCENARIOS.filter((s) => s.name.includes(filter)) : SCENARIOS;
  if (scenarios.length === 0) {
    console.error(`No scenarios match "${filter}".`);
    process.exit(1);
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ft-demo-"));
  const videoDir = fs.mkdtempSync(path.join(os.tmpdir(), "ft-video-"));

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
      // Window larger than the viewport so the recorded frame is exactly VIEWPORT
      // (no grey letterbox padding).
      "--window-size=1280,900",
      // Drop the navigator.webdriver fingerprint so live sites (esp. Google) don't
      // serve a bot/CAPTCHA wall a real user would never see.
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

    for (const r of recorded) {
      if (!r.webm || !fs.existsSync(r.webm)) {
        console.warn(`  ! no video for ${r.name}, skipping`);
        continue;
      }
      const gif = webmToGif(r.webm, r.name);
      const kb = (fs.statSync(gif).size / 1024).toFixed(0);
      console.log(`  -> ${path.relative(REPO_ROOT, gif)} (${kb} KB)`);
    }
  } finally {
    if (context.browser() || context.serviceWorkers().length) {
      await context.close().catch(() => {});
    }
    fs.rmSync(userDataDir, { recursive: true, force: true });
    fs.rmSync(videoDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
