import { test, expect } from "./fixtures";

test("newtab loads with search input focused", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);
  await expect(page.locator("#wordmark")).toHaveText("Fast Travel");
  const input = page.locator("#search-input");
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();
});

async function captureFirstNav(page: import("@playwright/test").Page, pattern: RegExp) {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no matching nav")), 5000);
    page.on("framenavigated", (f) => {
      if (f === page.mainFrame() && pattern.test(f.url())) {
        clearTimeout(timer);
        resolve(f.url());
      }
    });
  });
}

test("typing a command with query navigates to the command's search URL", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);
  await page.locator("#search-input").fill("g playwright extension testing");

  const nav = captureFirstNav(page, /google\.com\/search\?q=/);
  await page.keyboard.press("Enter");
  const matchedUrl = await nav;
  const q = new URL(matchedUrl).searchParams.get("q");
  expect(q).toBe("playwright extension testing");
});

test("bare query uses the default command (google)", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);
  await page.locator("#search-input").fill("hello world");
  const nav = captureFirstNav(page, /google\.com\/search\?q=/);
  await page.keyboard.press("Enter");
  const matchedUrl = await nav;
  expect(new URL(matchedUrl).searchParams.get("q")).toBe("hello world");
});

test("gh command routes to GitHub search", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);
  await page.locator("#search-input").fill("gh facebook/react");
  const nav = captureFirstNav(page, /github\.com/);
  await page.keyboard.press("Enter");
  const matchedUrl = await nav;
  expect(matchedUrl).toMatch(/github\.com/);
});

test("search input gets tail-visible class after blur when text overflows", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);
  const input = page.locator("#search-input");
  await expect(input).toBeVisible();

  // 1200 chars is guaranteed to overflow a 640px-wide input.
  await input.fill("abcdefghij".repeat(120));
  // blur by clicking a non-interactive element
  await page.locator("#wordmark").click();

  await expect(input).toHaveClass(/tail-visible/);
});

test("search input does not get tail-visible class when text fits", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);
  const input = page.locator("#search-input");

  await input.fill("g hello");
  await page.locator("#wordmark").click();

  const classes = (await input.getAttribute("class")) ?? "";
  expect(classes).not.toContain("tail-visible");
});

test("search input tail-visible class updates when window is resized", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);
  const input = page.locator("#search-input");
  await expect(input).toBeVisible();

  // 60 chars: fits at 1280px wide, but should overflow at 320px.
  await input.fill("medium-length-query-".repeat(3));
  await page.locator("#wordmark").click();

  // Initial state: no tail-visible (fits in wide viewport).
  let classes = (await input.getAttribute("class")) ?? "";
  expect(classes).not.toContain("tail-visible");

  // Shrink the viewport — ResizeObserver should re-evaluate.
  await page.setViewportSize({ width: 320, height: 800 });
  await expect(input).toHaveClass(/tail-visible/);
});
