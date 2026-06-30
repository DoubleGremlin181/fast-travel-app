/**
 * Shared capability helpers derived from the companion ping response.
 *
 * Imported by both the options screen (settings defaults UI) and the local-search
 * results view (toolbar capability gating) so the logic stays DRY.
 */

import type { PingResponse } from "./companion-types.js";

/**
 * Returns true if at least one *available* indexer in the ping response
 * advertises `capabilities.regex === true`.
 */
export function regexAvailable(ping: PingResponse): boolean {
  return ping.indexers.some((idx) => idx.available && idx.capabilities.regex);
}

/**
 * Returns true if the *default* indexer is available and supports content
 * search.
 */
export function contentAvailable(ping: PingResponse): boolean {
  const def = ping.indexers.find((idx) => idx.id === ping.defaultIndexer);
  return def !== undefined && def.available && def.capabilities.content;
}
