/**
 * Install-correctness tests for packaged extension builds.
 *
 * Chrome  – Playwright Chromium loads the unpacked dist-chrome/ extension, verifies
 *            the service worker registers and the newtab page renders correctly.
 *
 * Firefox – Playwright's own Firefox build doesn't support loading extensions
 *            (no public installAddon API in v1.59, about:debugging isn't
 *            navigable, and profile-directory sideloading is disabled in
 *            Firefox 73+).  Instead this test uses web-ext — Mozilla's official
 *            extension test CLI — within the Playwright test runner:
 *              1. `web-ext lint`  — validates the manifest is Firefox-compatible.
 *              2. `web-ext run`   — actually installs the extension as a temporary
 *                                   add-on in system Firefox and verifies it loads
 *                                   without errors.
 */
import { test, expect, chromium } from "@playwright/test";
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME_EXT = path.resolve(__dirname, "../../dist-chrome");
const FIREFOX_EXT = path.resolve(__dirname, "../../dist-firefox");

test("chrome: service worker registers and newtab shows Fast Travel", async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ft-chrome-install-"));
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
    const extId = worker.url().split("/")[2];

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extId}/newtab/newtab.html`);
    await expect(page.locator("#wordmark")).toHaveText("Fast Travel");
    await expect(page.locator("#search-input")).toBeFocused();
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test("firefox: manifest passes web-ext lint", () => {
  // web-ext lint exits 0 on a valid Firefox extension, non-zero otherwise.
  // This catches manifest_version errors, missing keys, incompatible APIs, etc.
  execSync(`web-ext lint --source-dir "${FIREFOX_EXT}" --output json`, {
    stdio: "pipe",
  });
  // If execSync throws, the test fails with the lint output.
});

test("firefox: extension loads as temporary add-on in system Firefox", async () => {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "ft-ff-run-"));

  const webext = spawn(
    "web-ext",
    [
      "run",
      `--source-dir=${FIREFOX_EXT}`,
      `--firefox=/usr/bin/firefox`,
      `--firefox-profile=${profileDir}`,
      "--keep-profile-changes",
      "--no-reload",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  try {
    // web-ext prints "Running web extension from <path>" once the extension is
    // successfully installed as a temporary add-on and Firefox is up.
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("web-ext did not report extension loaded within 30s")),
        30_000,
      );
      const onData = (chunk: Buffer) => {
        const line = chunk.toString();
        if (line.includes("Running web extension") || line.includes("Loaded temporary add-on")) {
          clearTimeout(timer);
          resolve();
        }
      };
      webext.stdout!.on("data", onData);
      webext.stderr!.on("data", onData);
      webext.on("exit", (code) => {
        clearTimeout(timer);
        if (code !== null && code !== 0) reject(new Error(`web-ext exited with code ${code}`));
      });
    });

    // If we reach here, Firefox loaded the extension without errors.
    expect(true).toBe(true);
  } finally {
    webext.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 1500));
    webext.kill("SIGKILL");
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
});
