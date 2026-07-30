import type {
  Command,
  DeviceType,
  FastTravelConfig,
  MatchType,
  NormalizeStep,
  ParseInput,
  ParseOutput,
  ParseResult,
  Route,
  TypoResult,
} from "./types.js";
import commonWordsData from "../../../shared/config/common-words.json";
import tldsData from "../../../shared/config/tlds.json";

const COMMON_WORDS = new Set(
  (commonWordsData as string[]).map((w) => w.toLowerCase()),
);

const TLDS = new Set(tldsData as string[]);

/**
 * Apply an ordered list of normalize transforms to the args string.
 * Exported so fixtures can exercise the pipeline in isolation.
 */
export function normalizeArgs(
  argsStr: string,
  steps: NormalizeStep[] | undefined,
): string {
  if (!steps || steps.length === 0) return argsStr;
  let out = argsStr;
  for (const step of steps) {
    switch (step) {
      case "trim":
        out = out.trim();
        break;
      case "collapseSpaces":
        out = out.replace(/\s+/g, " ");
        break;
      case "stripSpaces":
        out = out.replace(/\s+/g, "");
        break;
      case "lower":
        out = out.toLowerCase();
        break;
      case "upper":
        out = out.toUpperCase();
        break;
      case "snake":
        out = out.replace(/\s+/g, "_").toLowerCase();
        break;
      case "camel": {
        const parts = out.split(/\s+/).filter((p) => p.length > 0);
        if (parts.length === 0) {
          out = "";
        } else {
          const [first, ...rest] = parts;
          out =
            first.toLowerCase() +
            rest
              .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
              .join("");
        }
        break;
      }
    }
  }
  return out;
}

/**
 * Build a flat trigger-to-command lookup map from all groups (recursively).
 * Nesting is display-only; parsing uses flat trigger lookup.
 */
export function buildTriggerMap(
  config: FastTravelConfig,
): Map<string, Command> {
  const map = new Map<string, Command>();

  for (const group of config.groups) {
    if (group.commands) {
      for (const cmd of group.commands) {
        for (const trigger of cmd.triggers) {
          map.set(trigger.toLowerCase(), cmd);
        }
      }
    }
  }
  return map;
}

/**
 * Find the best matching route for a device.
 * Fallback chain: (1) exact device match -> (2) wildcard "*" -> (3) "Unknown"
 */
export function findRoute(
  routes: Route[],
  device: DeviceType,
): Route | null {
  // 1. Exact device match
  const exact = routes.find(
    (r) =>
      Array.isArray(r.devices) &&
      r.devices.includes(device),
  );
  if (exact) return exact;

  // 2. Wildcard
  const wildcard = routes.find((r) => r.devices === "*");
  if (wildcard) return wildcard;

  // 3. "Unknown" fallback
  const unknown = routes.find(
    (r) =>
      Array.isArray(r.devices) &&
      r.devices.includes("Unknown"),
  );
  return unknown ?? null;
}

/**
 * Compile a pattern match string into a regex with positional capture groups,
 * and return the ordered list of placeholder names. Mirrors the Kotlin
 * implementation in CommandParser.kt — placeholder names that repeat (e.g. two
 * `{username}` markers) collide under named groups, so we use positional groups
 * and map them back by index.
 */
const PLACEHOLDER_RE = /\{(\w+)(?::(\d+)(?:-(\d+))?)?\}/g;

function escapeRegex(literal: string): string {
  return literal.replace(/[[\\\^$.|?*+(){}]/g, '\\$&');
}

function compilePattern(matchStr: string): { regex: RegExp; placeholders: string[] } {
  const placeholders: string[] = [];
  PLACEHOLDER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PLACEHOLDER_RE.exec(matchStr)) !== null) placeholders.push(m[1]);
  PLACEHOLDER_RE.lastIndex = 0;
  let regexStr = "";
  let lastIndex = 0;
  PLACEHOLDER_RE.lastIndex = 0;
  while ((m = PLACEHOLDER_RE.exec(matchStr)) !== null) {
    regexStr += escapeRegex(matchStr.slice(lastIndex, m.index));
    const [, , lo, hi] = m;
    if (lo === undefined) {
      regexStr += "([^/]+)";
    } else if (hi === undefined) {
      regexStr += `([^\\s/]{${lo}})`;
    } else {
      regexStr += `([^\\s/]{${lo},${hi}})`;
    }
    lastIndex = m.index + m[0].length;
  }
  regexStr += escapeRegex(matchStr.slice(lastIndex));
  PLACEHOLDER_RE.lastIndex = 0;
  return { regex: new RegExp(`^${regexStr}$`, "i"), placeholders };
}

/**
 * Try to match args against a route's patterns.
 * Returns the resolved URL if a pattern matches, null otherwise.
 */
function tryPatternMatch(
  route: Route,
  argsStr: string,
): { url: string } | null {
  if (!route.patterns || route.patterns.length === 0) return null;

  for (const pattern of route.patterns) {
    const { regex, placeholders } = compilePattern(pattern.match);
    const match = argsStr.match(regex);
    if (match) {
      let url = pattern.url;
      placeholders.forEach((key, i) => {
        const value = match[i + 1];
        if (value !== undefined) {
          url = url.replaceAll(`{${key}}`, encodeURIComponent(value));
        }
      });
      return { url };
    }
  }

  return null;
}

/**
 * Compute Levenshtein distance between two strings.
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[m][n];
}

/**
 * Find the closest typo suggestion for an unmatched trigger.
 * Threshold: <=5 char triggers use distance 1, >5 use distance 2.
 */
function findTypoSuggestion(
  input: string,
  triggerMap: Map<string, Command>,
  ignoreList: string[],
): { trigger: string; command: Command } | null {
  const lowerInput = input.toLowerCase();

  // Skip common English words - they're almost never typos of commands
  if (COMMON_WORDS.has(lowerInput)) {
    return null;
  }

  // Check if this input is in the ignore list
  if (ignoreList.some((ignored) => ignored.toLowerCase() === lowerInput)) {
    return null;
  }

  const threshold = lowerInput.length <= 5 ? 1 : 2;
  let bestMatch: { trigger: string; command: Command; distance: number } | null =
    null;

  for (const [trigger, command] of triggerMap) {
    // Skip prefix commands for typo detection
    if (command.type === "prefix") continue;

    const distance = levenshtein(lowerInput, trigger);
    if (
      distance <= threshold &&
      distance > 0 &&
      (bestMatch === null || distance < bestMatch.distance)
    ) {
      bestMatch = { trigger, command, distance };
    }
  }

  return bestMatch ? { trigger: bestMatch.trigger, command: bestMatch.command } : null;
}

/**
 * Substitute {query} in a URL template with the encoded value.
 */
function substituteQuery(urlTemplate: string, query: string): string {
  return urlTemplate.replaceAll("{query}", encodeURIComponent(query));
}

/**
 * Substitute {term} and optionally {query} in prefix command URLs.
 */
function substitutePrefixUrl(
  urlTemplate: string,
  term: string,
  query?: string,
): string {
  let url = urlTemplate.replaceAll("{term}", encodeURIComponent(term));
  if (query !== undefined) {
    url = url.replaceAll("{query}", encodeURIComponent(query));
  }
  return url;
}

/**
 * Parse a raw query string and return a redirect URL or typo suggestion.
 */
export function parseCommand(input: ParseInput): ParseOutput {
  const { rawQuery, device, config, ignoreList = [] } = input;
  const query = rawQuery.trim();

  if (query === "") {
    return makeDefaultRedirect(config, device);
  }

  const triggerMap = buildTriggerMap(config);

  // 1. Check prefix commands first
  const prefixResult = tryPrefixCommands(
    query,
    triggerMap,
    device,
  );
  if (prefixResult) return prefixResult;

  // 2. Try standard command
  const parts = query.split(/\s+/);
  const trigger = parts[0].toLowerCase();
  const args = parts.slice(1);
  const argsStr = args.join(" ");

  const command = triggerMap.get(trigger);

  // 2a. Redirect-type: hard match only. No args -> defaultUrl. Args -> default search.
  if (command && command.type === "redirect" && args.length === 0) {
    const route = findRoute(command.routes, device);
    if (!route) return makeDefaultSearch(config, device, query);
    return {
      type: "redirect",
      url: route.defaultUrl,
      commandId: command.id,
      matchType: "exact",
    };
  }
  if (command && command.type === "redirect" && args.length > 0) {
    return makeDefaultSearch(config, device, query);
  }

  if (command && command.type === "standard") {
    const route = findRoute(command.routes, device);
    if (!route) {
      return makeDefaultSearch(config, device, query);
    }

    // No args -> defaultUrl
    if (args.length === 0) {
      return {
        type: "redirect",
        url: route.defaultUrl,
        commandId: command.id,
        matchType: "exact",
      };
    }

    const normalizedArgs = normalizeArgs(argsStr, command.normalize);

    // Try pattern match
    const patternResult = tryPatternMatch(route, normalizedArgs);
    if (patternResult) {
      return {
        type: "redirect",
        url: patternResult.url,
        commandId: command.id,
        matchType: "pattern",
      };
    }

    // Fall back to searchUrl
    if (route.searchUrl) {
      return {
        type: "redirect",
        url: substituteQuery(route.searchUrl, normalizedArgs),
        commandId: command.id,
        matchType: "search",
      };
    }

    // No searchUrl, use defaultUrl
    return {
      type: "redirect",
      url: route.defaultUrl,
      commandId: command.id,
      matchType: "exact",
    };
  }

  // 2b. Single-token URL? Navigate directly. Runs after command matching so a
  // configured trigger always wins, and before typo detection so domain-like
  // tokens are never "corrected" into a command.
  const urlResult = tryUrlDetection(query);
  if (urlResult) return urlResult;

  // 3. No command match - check for typo. Redirect-type typo only applies on hard match.
  const mergedIgnoreList = [
    ...config.ignoreList,
    ...ignoreList,
  ];
  const rawTypo = findTypoSuggestion(trigger, triggerMap, mergedIgnoreList);
  const typo =
    rawTypo && rawTypo.command.type === "redirect" && args.length > 0
      ? null
      : rawTypo;
  if (typo) {
    // Build the corrected URL using the suggested command
    const correctedQuery =
      args.length > 0 ? `${typo.trigger} ${argsStr}` : typo.trigger;
    const correctedResult = parseCommand({
      rawQuery: correctedQuery,
      device,
      config,
      ignoreList,
    });

    const correctedUrl =
      correctedResult.type === "redirect"
        ? correctedResult.url
        : (correctedResult as TypoResult).correctedUrl;

    return {
      type: "typo",
      originalQuery: query,
      suggestedTrigger: typo.trigger,
      suggestedCommand: typo.command,
      correctedUrl,
    } satisfies TypoResult;
  }

  // 4. Fall through to default command
  return makeDefaultSearch(config, device, query);
}

const LABEL_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const PORT_RE = /^\d{1,5}$/;
const OCTET_RE = /^\d{1,3}$/;

function isIPv4(host: string): boolean {
  const octets = host.split(".");
  if (octets.length !== 4) return false;
  return octets.every((o) => OCTET_RE.test(o) && parseInt(o, 10) <= 255);
}

/**
 * Detect a single-token URL: an explicit http(s) URL, or a bare
 * hostname[:port][/path...] whose host is "localhost", an IPv4 address, or a
 * domain whose final label is a known TLD (shared/config/tlds.json).
 *
 * Deliberately string/regex based (no URL API) so the Android CommandParser
 * port can mirror it line for line. Returns null when the query is not a URL.
 */
export function tryUrlDetection(query: string): ParseResult | null {
  if (query === "" || /\s/.test(query)) return null;

  const asUrl = (url: string): ParseResult => ({
    type: "redirect",
    url,
    commandId: null,
    matchType: "url",
  });

  // Explicit scheme: pass through verbatim (must have something after //).
  if (/^https?:\/\//i.test(query)) {
    return /^https?:\/\/./i.test(query) ? asUrl(query) : null;
  }

  // Split authority from path/query/hash.
  const cutIdx = query.search(/[/?#]/);
  const authority = cutIdx === -1 ? query : query.slice(0, cutIdx);

  // Split optional :port.
  let host = authority;
  const colonIdx = authority.indexOf(":");
  if (colonIdx !== -1) {
    host = authority.slice(0, colonIdx);
    if (!PORT_RE.test(authority.slice(colonIdx + 1))) return null;
  }
  if (host === "") return null;

  const hostLower = host.toLowerCase();
  if (hostLower === "localhost" || isIPv4(hostLower)) {
    return asUrl("https://" + query);
  }

  const labels = hostLower.split(".");
  if (labels.length < 2) return null;
  if (!labels.every((label) => LABEL_RE.test(label))) return null;
  if (!TLDS.has(labels[labels.length - 1])) return null;

  return asUrl("https://" + query);
}

/**
 * Try all prefix commands against the query.
 */
function tryPrefixCommands(
  query: string,
  triggerMap: Map<string, Command>,
  device: DeviceType,
): ParseResult | null {
  // Collect prefix commands and sort by trigger length (longest first)
  const prefixCommands: [string, Command][] = [];
  for (const [trigger, command] of triggerMap) {
    if (command.type === "prefix") {
      prefixCommands.push([trigger, command]);
    }
  }
  prefixCommands.sort((a, b) => b[0].length - a[0].length);

  for (const [trigger, command] of prefixCommands) {
    const lowerQuery = query.toLowerCase();
    if (!lowerQuery.startsWith(trigger)) continue;

    const rest = query.slice(trigger.length).trim();
    const route = findRoute(command.routes, device);
    if (!route) continue;

    if (rest === "") {
      // Prefix with no term - go to defaultUrl (without substitution)
      return {
        type: "redirect",
        url: route.defaultUrl,
        commandId: command.id,
        matchType: "prefix",
      };
    }

    // Split rest into term and optional extra args
    const restParts = rest.split(/\s+/);
    const term = restParts[0];
    const extraArgs = restParts.slice(1).join(" ");

    if (extraArgs) {
      // Has extra args -> use searchUrl with {term} and {query}
      if (route.searchUrl) {
        return {
          type: "redirect",
          url: substitutePrefixUrl(route.searchUrl, term, extraArgs),
          commandId: command.id,
          matchType: "prefix",
        };
      }
    }

    // No extra args or no searchUrl -> use defaultUrl with {term}
    return {
      type: "redirect",
      url: substitutePrefixUrl(route.defaultUrl, term),
      commandId: command.id,
      matchType: "prefix",
    };
  }

  return null;
}

/**
 * Build a default redirect (empty query -> default command's defaultUrl).
 */
function makeDefaultRedirect(
  config: FastTravelConfig,
  device: DeviceType,
): ParseResult {
  const triggerMap = buildTriggerMap(config);
  const defaultCmd = triggerMap.get(config.defaultCommand.toLowerCase());
  if (defaultCmd) {
    const route = findRoute(defaultCmd.routes, device);
    if (route) {
      return {
        type: "redirect",
        url: route.defaultUrl,
        commandId: defaultCmd.id,
        matchType: "exact",
      };
    }
  }
  // Unreachable with a valid config: defaultCommand could not be resolved.
  return {
    type: "redirect",
    url: "https://www.google.com",
    commandId: null,
    matchType: "default-search",
  };
}

/**
 * Build a default search redirect (no matching command -> search with default command).
 */
function makeDefaultSearch(
  config: FastTravelConfig,
  device: DeviceType,
  query: string,
): ParseResult {
  const triggerMap = buildTriggerMap(config);
  const defaultCmd = triggerMap.get(config.defaultCommand.toLowerCase());
  if (defaultCmd) {
    const route = findRoute(defaultCmd.routes, device);
    if (route?.searchUrl) {
      return {
        type: "redirect",
        url: substituteQuery(route.searchUrl, query),
        commandId: defaultCmd.id,
        matchType: "default-search",
      };
    }
    // Default command resolves but has no searchUrl for this device — land on
    // its home page rather than assuming a specific engine.
    if (route) {
      return {
        type: "redirect",
        url: route.defaultUrl,
        commandId: defaultCmd.id,
        matchType: "default-search",
      };
    }
  }
  // Unreachable with a valid config: defaultCommand could not be resolved.
  return {
    type: "redirect",
    url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
    commandId: null,
    matchType: "default-search",
  };
}
