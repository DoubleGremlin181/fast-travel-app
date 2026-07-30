import { hasHistoryPermission } from "./permissions.js";

/** A browser-history match, normalized for the blend pipeline. */
export interface BrowserHistoryItem {
  url: string;
  title: string;
  lastVisitTime: number;
  visitCount: number;
}

const MAX_RESULTS = 10;
const LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

/**
 * Query the browser's history for entries matching `query`. Purely local —
 * results never leave the device. Returns [] whenever the optional "history"
 * permission is missing or the API is unavailable, so callers can blend
 * unconditionally.
 */
export async function searchBrowserHistory(
  query: string,
): Promise<BrowserHistoryItem[]> {
  if (!(await hasHistoryPermission())) return [];
  if (!chrome.history?.search) return [];

  try {
    const results = await chrome.history.search({
      text: query,
      maxResults: MAX_RESULTS,
      startTime: Date.now() - LOOKBACK_MS,
    });
    return results
      .filter((r) => typeof r.url === "string" && r.url.length > 0)
      .map((r) => ({
        url: r.url as string,
        title: r.title ?? "",
        lastVisitTime: r.lastVisitTime ?? 0,
        visitCount: r.visitCount ?? 0,
      }));
  } catch {
    return [];
  }
}
