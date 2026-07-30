import { test, expect } from "./fixtures";

// The update hint for sideloaded installs: the service worker caches the
// latest GitHub Release in storage; the NTP shows a one-time per-version
// banner. Tests seed the cache directly (no network) — the loaded dist/ is
// unpacked, so isSideloadedChromium() is genuinely true here.

// onInstalled fires a real update check against the GitHub API; if it resolved
// after we seed, it would overwrite the fake release and flake the test. Wait
// for it to settle (populate the key or fail) before seeding.
async function settleOrganicUpdateCheck(context: import("@playwright/test").BrowserContext) {
  const sw = context.serviceWorkers()[0];
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const stored = await sw.evaluate(() =>
      chrome.storage.local.get("fast-travel-latest-release").then((v) => v["fast-travel-latest-release"]),
    );
    if (stored) return;
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function seedLatestRelease(
  context: import("@playwright/test").BrowserContext,
  version: string,
) {
  await settleOrganicUpdateCheck(context);
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(
    (v) =>
      chrome.storage.local.set({
        "fast-travel-latest-release": {
          version: v,
          url: `https://github.com/DoubleGremlin181/fast-travel-app/releases/tag/v${v}`,
          checkedAt: Date.now(),
        },
      }),
    version,
  );
}

async function getDismissedVersion(context: import("@playwright/test").BrowserContext) {
  const sw = context.serviceWorkers()[0];
  return sw.evaluate(() =>
    chrome.storage.local
      .get("fast-travel-update-dismissed-version")
      .then((v) => v["fast-travel-update-dismissed-version"]),
  );
}

test("update hint: shows for a newer release and dismisses per version", async ({
  context,
  extensionId,
}) => {
  await seedLatestRelease(context, "99.0.0");

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);

  const hint = page.locator("#update-hint");
  await expect(hint).toBeVisible();
  await expect(page.locator("#update-hint-version")).toHaveText("v99.0.0");
  await expect(page.locator("#update-hint-link")).toHaveAttribute(
    "href",
    "https://github.com/DoubleGremlin181/fast-travel-app/releases/tag/v99.0.0",
  );

  await page.locator("#update-hint-dismiss").click();
  await expect(hint).toBeHidden();
  await expect.poll(() => getDismissedVersion(context)).toBe("99.0.0");

  // Reload: same version stays dismissed — the prompt is one-time.
  await page.reload();
  await expect(hint).toBeHidden();

  // An even newer release prompts again, exactly once.
  await seedLatestRelease(context, "99.1.0");
  await page.reload();
  await expect(hint).toBeVisible();
  await expect(page.locator("#update-hint-version")).toHaveText("v99.1.0");
});

test("update hint: absent when the cached release is not newer", async ({
  context,
  extensionId,
}) => {
  const sw = context.serviceWorkers()[0];
  const currentVersion = await sw.evaluate(() => chrome.runtime.getManifest().version);
  await seedLatestRelease(context, currentVersion);

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);

  await expect(page.locator("#update-hint")).toBeHidden();
  // With no update pending, the onboarding hint keeps its slot.
  await expect(page.locator("#onboarding-hint")).toBeVisible();
});
