/**
 * E2E test verifying fix for issue #21 — drag handle mousedown left rows
 * permanently draggable after a plain click.
 *
 * The bug: in commands.ts and groups.ts the `.reorder-handle` mousedown
 * listener set `row.draggable = true`, but there was no matching mouseup
 * listener to reset it.  Any row that received a mousedown (even a plain
 * click with no drag) became permanently draggable, which caused accidental
 * drag behaviour on subsequent interactions.
 *
 * The fix: a `mouseup` listener alongside each `mousedown` resets
 * `row.draggable = false` so draggable is only active while the mouse
 * button is held.
 *
 * This test verifies the fix on the Commands screen:
 *   1. Load the Commands screen in the options page.
 *   2. Find the drag handle for the first command row.
 *   3. Fire mousedown on the handle — draggable must become true.
 *   4. Fire mouseup on the handle — draggable must reset to false.
 *   5. Take a screenshot of the Commands screen.
 */

import * as path from "node:path";
import { test, expect } from "./fixtures";

const SCREENSHOT_DIR = path.resolve(__dirname, "screenshots");

test("issue #21: drag handle mouseup resets row.draggable to false after a click-without-drag", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();

  // Step 1 — Load the Commands screen.
  await page.goto(`chrome-extension://${extensionId}/options/options.html#/commands`);

  // Wait until at least one command row drag handle is visible.
  const handle = page.locator(".reorder-handle").first();
  await expect(handle).toBeVisible({ timeout: 5000 });

  // Step 2 — Confirm draggable starts as false (before any interaction).
  const draggableBefore = await handle.evaluate((el) => {
    const row = el.closest<HTMLElement>("[data-id]") ?? (el as HTMLElement);
    return row.draggable;
  });
  expect(draggableBefore).toBe(false);

  // Step 3 — Fire mousedown on the handle. draggable must become true.
  await handle.dispatchEvent("mousedown");
  const draggableDuringHold = await handle.evaluate((el) => {
    const row = el.closest<HTMLElement>("[data-id]") ?? (el as HTMLElement);
    return row.draggable;
  });
  expect(draggableDuringHold).toBe(true);

  // Step 4 — Fire mouseup on the handle. draggable must reset to false.
  await handle.dispatchEvent("mouseup");
  const draggableAfterRelease = await handle.evaluate((el) => {
    const row = el.closest<HTMLElement>("[data-id]") ?? (el as HTMLElement);
    return row.draggable;
  });
  expect(draggableAfterRelease).toBe(false);

  // Step 5 — Repeat with a second mousedown + mouseup to confirm the reset is
  // stable across multiple clicks (not a one-shot fix).
  await handle.dispatchEvent("mousedown");
  const draggableSecondHold = await handle.evaluate((el) => {
    const row = el.closest<HTMLElement>("[data-id]") ?? (el as HTMLElement);
    return row.draggable;
  });
  expect(draggableSecondHold).toBe(true);

  await handle.dispatchEvent("mouseup");
  const draggableSecondRelease = await handle.evaluate((el) => {
    const row = el.closest<HTMLElement>("[data-id]") ?? (el as HTMLElement);
    return row.draggable;
  });
  expect(draggableSecondRelease).toBe(false);

  // Step 6 — Screenshot of the Commands screen.
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, "issue21-commands-drag-handle.png"),
    fullPage: false,
  });
});
