// Update notice for sideloaded (GitHub-installed) Chromium builds. The Chrome
// build isn't on the Web Store (issue #36), so unpacked installs never
// auto-update; the service worker polls the latest GitHub Release and the new
// tab page shows a one-time, per-version hint. Store builds (Firefox/AMO) are
// excluded — their store handles updates.

export const LATEST_RELEASE_KEY = "fast-travel-latest-release";
export const UPDATE_DISMISSED_KEY = "fast-travel-update-dismissed-version";

export const RELEASES_API_URL =
  "https://api.github.com/repos/DoubleGremlin181/fast-travel-app/releases/latest";
export const RELEASES_PAGE_URL =
  "https://github.com/DoubleGremlin181/fast-travel-app/releases/latest";

export interface LatestRelease {
  version: string;
  url: string;
  checkedAt: number;
}

export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Once-a-day throttle for opportunistic checks (worker startup): a check is
 * due only when none has ever completed or the last one is at least a day
 * old. The daily alarm bypasses this so clock drift can't stack skips.
 */
export function isUpdateCheckDue(latest: LatestRelease | undefined, now: number): boolean {
  if (!latest?.checkedAt) return true;
  return now - latest.checkedAt >= UPDATE_CHECK_INTERVAL_MS;
}

/**
 * Numeric dotted-version compare (an optional leading "v" is stripped; missing
 * segments count as 0, so "2.1.8" === "2.1.8.0" and beta builds like
 * "2.1.8.73" sort above their base release). Returns <0 / 0 / >0.
 * Non-numeric versions compare as unknown: NaN segments make both sides equal
 * so callers fail closed (no prompt).
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v.replace(/^v/, "").split(".").map((s) => Number.parseInt(s, 10));
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (Number.isNaN(na) || Number.isNaN(nb)) return 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

/**
 * Whether the new tab page should show the update hint. Only the single
 * latest release is ever considered — if several versions were skipped they
 * collapse into one prompt — and dismissing records that version so the hint
 * stays gone until something newer ships.
 */
export function shouldPromptUpdate(
  currentVersion: string,
  latest: LatestRelease | undefined,
  dismissedVersion: string | undefined,
): boolean {
  if (!latest?.version) return false;
  if (compareVersions(latest.version, currentVersion) <= 0) return false;
  if (dismissedVersion && compareVersions(latest.version, dismissedVersion) <= 0) return false;
  return true;
}

/**
 * True when this install has no store channel updating it: a Chromium build
 * (the Firefox build ships through AMO) whose manifest has no update_url (the
 * Web Store injects one into items it distributes; unpacked installs have
 * none).
 */
export function isSideloadedChromium(): boolean {
  if (navigator.userAgent.includes("Firefox")) return false;
  return !("update_url" in chrome.runtime.getManifest());
}

/** Parse the GitHub "latest release" API response; null if it isn't usable. */
export function parseLatestRelease(body: unknown, now: number): LatestRelease | null {
  if (!body || typeof body !== "object") return null;
  const tag = (body as { tag_name?: unknown }).tag_name;
  if (typeof tag !== "string" || !/^v?\d+(\.\d+)*$/.test(tag)) return null;
  const htmlUrl = (body as { html_url?: unknown }).html_url;
  return {
    version: tag.replace(/^v/, ""),
    url: typeof htmlUrl === "string" ? htmlUrl : RELEASES_PAGE_URL,
    checkedAt: now,
  };
}
