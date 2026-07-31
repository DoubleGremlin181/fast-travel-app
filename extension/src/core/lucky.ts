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
