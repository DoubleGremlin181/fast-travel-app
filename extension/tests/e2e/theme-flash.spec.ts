import { test, expect } from "./fixtures";
import type { Page, BrowserContext } from "@playwright/test";

// Theme-FOUC regression tests.
//
// The new tab must paint the *selected* theme on the very first frame — no white
// flash for a dark user, and no reverse (dark) flash for a user who picked light
// while their OS is dark.
//
// We capture the first painted frame by installing, via addInitScript (which runs
// before any of the page's own scripts), a requestAnimationFrame callback that
// records document.body's computed background color. rAF fires right before the
// first paint, so it reflects exactly what the user first sees. The same init
// script seeds localStorage so the render-blocking pre-paint shim can read the
// selected theme synchronously.

const LIGHT_BG = "rgb(245, 242, 236)"; // --bg #f5f2ec
const DARK_BG = "rgb(14, 16, 32)"; //    --bg #0e1020

type Prefs = { mode: string; variant: string; shape: string };

async function firstFrameBg(
  context: BrowserContext,
  extensionId: string,
  prefs: Prefs | null,
  os: "dark" | "light",
): Promise<string> {
  const page: Page = await context.newPage();
  // Isolate the pre-paint shim: block the deferred main bundle so its async
  // re-apply (applyAppearance(await getAppearance()) from chrome.storage.sync)
  // can't race the first-frame capture. In real use sync and the localStorage
  // mirror are written together (setAppearance), so they agree and the shim's
  // first-paint value is also the final value — this isolates exactly that.
  await page.route("**/newtab.js", (route) => route.abort());
  await page.addInitScript((p) => {
    const w = window as unknown as { __bg?: string | null };
    if (p) {
      try {
        localStorage.setItem("fast-travel-appearance", JSON.stringify(p));
      } catch {
        /* ignore */
      }
    }
    w.__bg = null;
    // Record the background of the first frame that actually has a <body> to
    // paint. rAF fires immediately before that paint, so this is what the user
    // first sees. Re-arm until <body> exists, then capture exactly once.
    const capture = () => {
      if (document.body) {
        w.__bg = getComputedStyle(document.body).backgroundColor;
      } else {
        requestAnimationFrame(capture);
      }
    };
    requestAnimationFrame(capture);
  }, prefs);
  await page.emulateMedia({ colorScheme: os });
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);
  await page.waitForFunction(
    () => (window as unknown as { __bg?: string | null }).__bg !== null,
  );
  return page.evaluate(() => (window as unknown as { __bg?: string | null }).__bg ?? "");
}

// System mode resolves from the OS, so this passes regardless of the fix; it is a
// guard against system resolution regressing. The discriminating cases below
// (explicit theme opposite the OS) are what prove the flash/reverse-flash fix.
test("system theme on a dark OS paints dark on the first frame", async ({
  context,
  extensionId,
}) => {
  const bg = await firstFrameBg(
    context,
    extensionId,
    { mode: "system", variant: "material", shape: "pill" },
    "dark",
  );
  expect(bg).toBe(DARK_BG);
});

test("explicit dark theme on a light OS paints dark on the first frame", async ({
  context,
  extensionId,
}) => {
  const bg = await firstFrameBg(
    context,
    extensionId,
    { mode: "dark", variant: "material", shape: "pill" },
    "light",
  );
  expect(bg).toBe(DARK_BG);
});

test("explicit light theme on a dark OS paints light on the first frame (no reverse flash)", async ({
  context,
  extensionId,
}) => {
  const bg = await firstFrameBg(
    context,
    extensionId,
    { mode: "light", variant: "material", shape: "pill" },
    "dark",
  );
  expect(bg).toBe(LIGHT_BG);
});
