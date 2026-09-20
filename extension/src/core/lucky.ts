import type { FastTravelConfig } from "./types.js";
import { buildTriggerMap } from "./parser.js";

export interface LuckyResult {
  url: string;
  commandId: string;
}

/**
 * Build the Ctrl+Enter "lucky" navigation URL: the top-level defaultLuckyUrl
 * template with {query} substituted. Returns null when the config has no
 * defaultLuckyUrl (callers fall back to a normal search), the default
 * command doesn't resolve, or the query is empty.
 */
export function buildLuckyUrl(
  config: FastTravelConfig,
  query: string,
): LuckyResult | null {
  const trimmed = query.trim();
  if (trimmed === "") return null;

  const luckyUrl = config.defaultLuckyUrl?.trim();
  if (!luckyUrl) return null;

  const defaultCmd = buildTriggerMap(config).get(
    config.defaultCommand.toLowerCase(),
  );
  if (!defaultCmd) return null;

  return {
    url: luckyUrl.replaceAll("{query}", encodeURIComponent(trimmed)),
    commandId: defaultCmd.id,
  };
}

// google.com plus country domains (google.de, google.co.uk, google.com.au).
const GOOGLE_HOST_RE = /^(www\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/i;

function parseGoogleUrl(url: string): URL | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    return GOOGLE_HOST_RE.test(parsed.hostname) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * True for Google search URLs — the only lucky templates whose redirect needs
 * resolving up front (see extractRedirectNoticeTarget).
 */
export function isGoogleSearchUrl(url: string): boolean {
  return parseGoogleUrl(url)?.pathname === "/search";
}

/**
 * Google answers a &btnI search with a 302 to /url?q=<target>, which renders
 * a click-through "Redirect Notice" for any visitor not arriving from a Google
 * page. Given that interstitial's URL, return the http(s) target it points
 * at; null for anything else.
 */
export function extractRedirectNoticeTarget(url: string): string | null {
  const parsed = parseGoogleUrl(url);
  if (!parsed || parsed.pathname !== "/url") return null;
  const target = parsed.searchParams.get("q") ?? parsed.searchParams.get("url");
  if (!target || !/^https?:\/\//i.test(target)) return null;
  try {
    new URL(target);
  } catch {
    return null;
  }
  return target;
}
