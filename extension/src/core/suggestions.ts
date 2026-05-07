import type { Command, FastTravelConfig } from "./types.js";
import { buildTriggerMap } from "./parser.js";

export interface Suggestion {
  text: string;
  displayText: string;
  commandTrigger?: string;
  commandName?: string;
}

/**
 * Fetch autocomplete suggestions for the given input.
 *
 * Strategy:
 * 1. If the input starts with a "prefix"-type trigger (e.g. `r/ask…`, `$AAPL`),
 *    query the command's suggestionsApi (or the default) with the FULL input so
 *    the upstream engine sees the prefix in context ("r/ask…" autocompletes to
 *    "r/askreddit", not just "ask…"). Suggestions are tagged with the command's
 *    trigger/name so the UI renders the command's favicon.
 * 2. If the first whitespace-separated token matches a "standard" command
 *    AND there are args, query the command's API with just the args and
 *    prepend the trigger on the way out so selection still routes correctly.
 * 3. Otherwise, query the default suggestions API with the full input.
 */
export async function fetchSuggestions(
  input: string,
  config: FastTravelConfig,
): Promise<Suggestion[]> {
  const trimmed = input.trim();
  if (!trimmed) return [];

  const triggerMap = buildTriggerMap(config);

  // 1. Prefix commands: match longest-first so e.g. "ra/" wins over "r/".
  const lowerTrimmed = trimmed.toLowerCase();
  const prefixCommands = Array.from(triggerMap.entries())
    .filter(([, cmd]) => cmd.type === "prefix")
    .sort((a, b) => b[0].length - a[0].length);
  for (const [trigger, cmd] of prefixCommands) {
    if (!lowerTrimmed.startsWith(trigger)) continue;
    // Require something after the prefix before asking an API to complete it;
    // otherwise we'd hammer the API for every user keystroke on just "r/".
    if (trimmed.length <= trigger.length) return [];
    const apiUrl = cmd.suggestionsApi ?? config.defaultSuggestionsApi;
    if (!apiUrl) return [];
    const suggestions = await fetchFromApi(apiUrl, trimmed);
    return suggestions.map((s) => ({
      // Google's autosuggest usually echoes the prefix back (e.g. "r/askreddit").
      // If it ever omits it, stitch it on so selecting the row still routes
      // through the prefix command's parser.
      text: s.toLowerCase().startsWith(trigger) ? s : `${trigger}${stripPrefixLeadingSpace(s)}`,
      displayText: s.toLowerCase().startsWith(trigger) ? s : `${trigger}${stripPrefixLeadingSpace(s)}`,
      commandTrigger: trigger,
      commandName: cmd.name,
    }));
  }

  // 2. Standard commands with args.
  const parts = trimmed.split(/\s+/);
  const firstToken = parts[0].toLowerCase();
  const matchedCommand = triggerMap.get(firstToken);
  if (matchedCommand && matchedCommand.type === "standard" && parts.length > 1) {
    const searchTerms = parts.slice(1).join(" ");
    const apiUrl = matchedCommand.suggestionsApi ?? config.defaultSuggestionsApi;
    if (!apiUrl) return [];

    const suggestions = await fetchFromApi(apiUrl, searchTerms);
    return suggestions.map((s) => ({
      text: `${firstToken} ${s}`,
      displayText: s,
      commandTrigger: firstToken,
      commandName: matchedCommand.name,
    }));
  }

  // 3. Default fallback — attribute to the configured defaultCommand so the
  // UI can show its icon/trigger tag, and prefer its suggestionsApi if set.
  const defaultCmd = config.defaultCommand
    ? triggerMap.get(config.defaultCommand.toLowerCase())
    : undefined;
  const apiUrl = defaultCmd?.suggestionsApi ?? config.defaultSuggestionsApi;
  if (!apiUrl) return [];

  const suggestions = await fetchFromApi(apiUrl, trimmed);
  return suggestions.map((s) => ({
    text: s,
    displayText: s,
    commandTrigger: defaultCmd?.triggers[0],
    commandName: defaultCmd?.name,
  }));
}

function stripPrefixLeadingSpace(s: string): string {
  return s.startsWith(" ") ? s.slice(1) : s;
}

/**
 * Fetch suggestions from an API URL template.
 * Handles common response formats:
 * - OpenSearch/Google: [query, [suggestions]]
 * - DuckDuckGo: [{phrase: "..."}, ...]
 */
const SUGGESTION_TIMEOUT_MS = 1500;

async function fetchFromApi(
  urlTemplate: string,
  query: string,
): Promise<string[]> {
  const url = urlTemplate.replace("{query}", encodeURIComponent(query));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUGGESTION_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return [];

    const data = await response.json();

    // OpenSearch format: [query, [suggestions, ...]]
    if (Array.isArray(data) && data.length >= 2 && Array.isArray(data[1])) {
      return data[1].slice(0, 8).map(String);
    }

    // DuckDuckGo format: [{phrase: "..."}, ...]
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === "object") {
      return data
        .slice(0, 8)
        .map((item: { phrase?: string }) => item.phrase)
        .filter((s): s is string => typeof s === "string");
    }

    // Plain array of strings
    if (Array.isArray(data) && data.every((item) => typeof item === "string")) {
      return data.slice(0, 8);
    }

    return [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
