/**
 * Thin seam over chrome.permissions for the optional "history" permission.
 * Kept separate so unit tests can mock the request/contains flow and UI code
 * never touches chrome.permissions directly (Playwright cannot drive the
 * native permission prompt, so e2e covers UI states while these calls are
 * covered by unit tests).
 */

const HISTORY_PERMISSION = { permissions: ["history"] };

export async function hasHistoryPermission(): Promise<boolean> {
  try {
    return await chrome.permissions.contains(HISTORY_PERMISSION);
  } catch {
    return false;
  }
}

/**
 * Must be called synchronously from a user-gesture handler (no awaits before
 * it), or Chrome rejects the request outright.
 */
export async function requestHistoryPermission(): Promise<boolean> {
  try {
    return await chrome.permissions.request(HISTORY_PERMISSION);
  } catch {
    return false;
  }
}
