import type { FastTravelConfig } from "./types.js";
import { buildTriggerMap } from "./parser.js";

export interface LuckyResult {
  url: string;
  commandId: string;
}

/**
 * Build the Ctrl+Enter "lucky" navigation URL: the default command's
 * luckyUrl template with {query} substituted. Returns null when the default
 * command has no luckyUrl (callers fall back to a normal search) or the
 * query is empty.
 */
export function buildLuckyUrl(
  config: FastTravelConfig,
  query: string,
): LuckyResult | null {
  const trimmed = query.trim();
  if (trimmed === "") return null;

  const defaultCmd = buildTriggerMap(config).get(
    config.defaultCommand.toLowerCase(),
  );
  if (!defaultCmd?.luckyUrl) return null;

  return {
    url: defaultCmd.luckyUrl.replaceAll("{query}", encodeURIComponent(trimmed)),
    commandId: defaultCmd.id,
  };
}
