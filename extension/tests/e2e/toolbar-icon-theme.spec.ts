import { test, expect } from "./fixtures";

// The toolbar icon should follow the selected theme (issue #5): the default
// Night tile on light chrome, and the Paper tile on dark chrome. The service
// worker drives this via chrome.action.setIcon.
test("toolbar icon swaps to the Paper variant on dark and back on light", async ({
  context,
}) => {
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker");

  // Spy on setIcon so we can observe which paths the worker requests.
  await worker.evaluate(() => {
    (globalThis as unknown as { __iconPaths: unknown[] }).__iconPaths = [];
    const orig = chrome.action.setIcon.bind(chrome.action);
    chrome.action.setIcon = ((details: chrome.action.TabIconDetails) => {
      (globalThis as unknown as { __iconPaths: unknown[] }).__iconPaths.push(details.path);
      return orig(details);
    }) as typeof chrome.action.setIcon;
  });

  const lastIcon16 = () =>
    worker!.evaluate(() => {
      const paths = (globalThis as unknown as { __iconPaths: Array<Record<number, string>> })
        .__iconPaths;
      return paths.length ? paths[paths.length - 1][16] : undefined;
    });

  // Explicit Dark → Paper tile. The worker's storage.onChanged handles this
  // directly (no page needed to resolve "system").
  await worker.evaluate(() =>
    chrome.storage.sync.set({
      "fast-travel-appearance": { mode: "dark", variant: "material", shape: "pill" },
    }),
  );
  await expect.poll(lastIcon16).toBe("icons/icon16-paper.png");

  // Explicit Light → Night tile.
  await worker.evaluate(() =>
    chrome.storage.sync.set({
      "fast-travel-appearance": { mode: "light", variant: "material", shape: "pill" },
    }),
  );
  await expect.poll(lastIcon16).toBe("icons/icon16.png");

  // Clean up so the pref doesn't leak into other tests sharing the context.
  await worker.evaluate(() => chrome.storage.sync.remove("fast-travel-appearance"));
});

test("a page in system mode reports the OS theme so the icon follows it", async ({
  context,
  extensionId,
}) => {
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker");
  await worker.evaluate(() => {
    (globalThis as unknown as { __iconPaths: unknown[] }).__iconPaths = [];
    const orig = chrome.action.setIcon.bind(chrome.action);
    chrome.action.setIcon = ((details: chrome.action.TabIconDetails) => {
      (globalThis as unknown as { __iconPaths: unknown[] }).__iconPaths.push(details.path);
      return orig(details);
    }) as typeof chrome.action.setIcon;
  });

  // System mode + emulated dark OS theme → the page resolves dark and reports it.
  await worker.evaluate(() =>
    chrome.storage.sync.set({
      "fast-travel-appearance": { mode: "system", variant: "material", shape: "pill" },
    }),
  );
  const page = await context.newPage();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);
  await page.locator("html[data-ft-ready]").waitFor();

  await expect
    .poll(() =>
      worker!.evaluate(() => {
        const paths = (globalThis as unknown as { __iconPaths: Array<Record<number, string>> })
          .__iconPaths;
        return paths.length ? paths[paths.length - 1][16] : undefined;
      }),
    )
    .toBe("icons/icon16-paper.png");

  await worker.evaluate(() => chrome.storage.sync.remove("fast-travel-appearance"));
});
