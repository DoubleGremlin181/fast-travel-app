import type { FastTravelConfig } from "./types.js";
import { buildTriggerMap } from "./parser.js";

/**
 * Build the Ctrl+Enter "lucky" navigation URL: the default command's
 * luckyUrl template with {query} substituted. Returns null when the default
 * command has no luckyUrl (callers fall back to a normal search) or the
 * query is empty.
 */
export function buildLuckyUrl(
  config: FastTravelConfig,
  query: string,
): string | null {
  const trimmed = query.trim();
  if (trimmed === "") return null;

  const defaultCmd = buildTriggerMap(config).get(
    config.defaultCommand.toLowerCase(),
  );
  if (!defaultCmd?.luckyUrl) return null;

  return defaultCmd.luckyUrl.replaceAll("{query}", encodeURIComponent(trimmed));
}
