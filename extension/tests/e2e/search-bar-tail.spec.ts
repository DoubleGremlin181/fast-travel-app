import { test, expect } from "./fixtures";

// `tail-visible` flips the search input to `direction: rtl` so the END of a
// long value stays readable. It has to track the CURRENT value: it used to be
// re-evaluated only on blur and on resize, so a value that overflowed once kept
// the class while being deleted (a 3-character string rendered right-to-left),
// and an empty field whose placeholder overflows a narrow window mirrored the
// placeholder itself — rendering "…Search or type a command".

const LONG_URL =
  "https://play.google.com/console/u/0/developers/1234567890/app/4567890123/publishing/overview";

async function openNewtab(
  context: import("@playwright/test").BrowserContext,
  extensionId: string,
  width = 560,
) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height: 700 });
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);
  await page.locator("html[data-ft-ready]").waitFor();
  return page;
}

function inputState(input: import("@playwright/test").Locator) {
  return input.evaluate((el) => ({
    tailVisible: el.classList.contains("tail-visible"),
    direction: getComputedStyle(el).direction,
  }));
}

test("the mirrored tail is dropped as soon as the value fits again", async ({
  context,
  extensionId,
}) => {
  const page = await openNewtab(context, extensionId);
  const input = page.locator("#search-input");

  await input.click();
  await input.fill(LONG_URL);
  await input.blur();
  await expect(input).toHaveClass(/tail-visible/);
  expect((await inputState(input)).direction).toBe("rtl");

  // Shrink it with the keyboard — the class must be dropped on the very next
  // edit, not whenever a resize happens to re-evaluate it. Read the state
  // immediately (no polling) so a later ResizeObserver pass can't mask a
  // missing input-time refresh.
  await input.click();
  await input.press("ControlOrMeta+a");
  await input.press("Backspace");
  await page.keyboard.type("gi");
  expect(await inputState(input)).toEqual({ tailVisible: false, direction: "ltr" });
});

test("clearing an autofilled suggestion never mirrors the placeholder", async ({
  context,
  extensionId,
}) => {
  const page = await openNewtab(context, extensionId);
  await page.evaluate(
    (url) =>
      chrome.storage.local.set({
        "fast-travel-history": [{ query: url, commandId: null, timestamp: Date.now() }],
      }),
    LONG_URL,
  );
  await page.reload();
  await page.locator("html[data-ft-ready]").waitFor();

  const input = page.locator("#search-input");
  await input.click();
  await input.fill("play");
  await page.locator(".suggestion-item").first().waitFor({ state: "visible", timeout: 5000 });
  await page.waitForTimeout(400);

  // Arrow onto the long URL, keep typing, then delete it a character at a time.
  await input.press("ArrowDown");
  await expect(input).toHaveValue(LONG_URL);
  await page.keyboard.type("x");
  await page.waitForTimeout(300);

  const len = (await input.inputValue()).length;
  for (let i = 0; i < len; i++) {
    await input.press("Backspace");
    const remaining = await input.inputValue();
    // Once what is left comfortably fits the box it must read left-to-right;
    // the old code kept mirroring it all the way down to a single character.
    if (remaining.length <= 8) {
      expect((await inputState(input)).direction).toBe("ltr");
    }
  }

  // Empty: the placeholder must not be mirrored, even though it overflows
  // this narrow window.
  await expect(input).toHaveValue("");
  expect(await inputState(input)).toEqual({ tailVisible: false, direction: "ltr" });
});
