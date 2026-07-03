import { test, expect } from "./fixtures";

// The toolbar icon should follow the selected theme (issue #5): the Night tile
// on light chrome, the Paper tile on dark chrome. The service worker drives this
// via chrome.action.setIcon({imageData}) — {path} fails ("Failed to fetch") in
// an MV3 service worker, so these tests assert the call SUCCEEDS and carries the
// correct variant (Paper ~ light pixels, Night ~ dark pixels), not just that a
// path was requested.

type IconCall = { hasImageData: boolean; ok: boolean; lum: number | null };

async function installIconSpy(worker: import("@playwright/test").Worker): Promise<void> {
  await worker.evaluate(() => {
    const g = globalThis as unknown as { __iconCalls: IconCall[] };
    g.__iconCalls = [];
    const orig = chrome.action.setIcon.bind(chrome.action);
    chrome.action.setIcon = (async (details: chrome.action.TabIconDetails) => {
      const imgs = (details as { imageData?: Record<number, ImageData> }).imageData;
      const img = imgs && (imgs[16] ?? imgs[48] ?? imgs[128]);
      let lum: number | null = null;
      if (img) {
        const d = img.data;
        let sum = 0;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] > 10) {
            sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
            n++;
          }
        }
        lum = n ? sum / n / 255 : null;
      }
      let ok = true;
      try {
        await orig(details);
      } catch {
        ok = false;
      }
      g.__iconCalls.push({ hasImageData: !!imgs, ok, lum });
    }) as typeof chrome.action.setIcon;
  });
}

const lastCall = (worker: import("@playwright/test").Worker): Promise<IconCall | null> =>
  worker.evaluate(() => {
    const c = (globalThis as unknown as { __iconCalls: IconCall[] }).__iconCalls;
    return c.length ? c[c.length - 1] : null;
  });

test("toolbar icon renders the Paper tile on dark and Night on light (setIcon succeeds)", async ({
  context,
}) => {
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker");
  await installIconSpy(worker);

  // Explicit Dark → Paper (light) tile. Worker's storage.onChanged handles this.
  await worker.evaluate(() =>
    chrome.storage.sync.set({
      "fast-travel-appearance": { mode: "dark", variant: "material", shape: "pill" },
    }),
  );
  await expect.poll(() => lastCall(worker!)).toMatchObject({ hasImageData: true, ok: true });
  expect((await lastCall(worker))!.lum!).toBeGreaterThan(0.5);

  // Explicit Light → Night (dark) tile.
  await worker.evaluate(() =>
    chrome.storage.sync.set({
      "fast-travel-appearance": { mode: "light", variant: "material", shape: "pill" },
    }),
  );
  await expect.poll(async () => (await lastCall(worker!))!.lum!).toBeLessThan(0.5);
  expect((await lastCall(worker))!).toMatchObject({ hasImageData: true, ok: true });

  await worker.evaluate(() => chrome.storage.sync.remove("fast-travel-appearance"));
});

test("a page in system mode reports the OS theme so the icon follows it", async ({
  context,
  extensionId,
}) => {
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker");
  await installIconSpy(worker);

  // System mode + emulated dark OS → the page resolves dark and reports it, so
  // the worker renders the Paper (light) tile.
  await worker.evaluate(() =>
    chrome.storage.sync.set({
      "fast-travel-appearance": { mode: "system", variant: "material", shape: "pill" },
    }),
  );
  const page = await context.newPage();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);
  await page.locator("html[data-ft-ready]").waitFor();

  await expect.poll(async () => (await lastCall(worker!))?.lum ?? -1).toBeGreaterThan(0.5);
  expect((await lastCall(worker))!).toMatchObject({ hasImageData: true, ok: true });

  await worker.evaluate(() => chrome.storage.sync.remove("fast-travel-appearance"));
});
