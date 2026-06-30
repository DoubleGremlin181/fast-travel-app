/**
 * Unit tests for the pure helpers in newtab/local-search-results.ts.
 *
 * Covers:
 *   - shouldInterceptLocalSearch: all guard conditions
 *   - buildSearchRequest: correct field mapping from prefs + query
 *   - navDown / navUp: index arithmetic at all boundary conditions
 *
 * No DOM or chrome.storage interaction — all helpers under test are pure
 * functions that take data and return a value.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  shouldInterceptLocalSearch,
  buildSearchRequest,
  navDown,
  navUp,
  formatDate,
  hasMore,
  nextPage,
  appendResults,
  resetResults,
} from "../../src/newtab/local-search-results.js";
import type { FileResult } from "../../src/core/companion-types.js";
import type { LocalSearchPrefs } from "../../src/core/local-search-store.js";
import type { FastTravelConfig } from "../../src/core/types.js";
import { installMockStorage } from "./helpers/mock-storage.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PREFS_ENABLED: LocalSearchPrefs = {
  enabled: true,
  token: "tok-abc",
  port: 7333,
  queryMode: "simple",
  sort: { field: "relevance", dir: "desc" },
  filters: {},
  view: "list",
};

const PREFS_DISABLED: LocalSearchPrefs = {
  ...PREFS_ENABLED,
  enabled: false,
};

const PREFS_UNPAIRED: LocalSearchPrefs = {
  ...PREFS_ENABLED,
  token: undefined,
};

/** Config with no commands (no "s" trigger). */
function makeConfig(triggers: string[] = []): FastTravelConfig {
  return {
    version: 2,
    defaultCommand: "g",
    groups: [
      {
        id: "g1",
        name: "General",
        commands: triggers.map((t, i) => ({
          id: `cmd-${i}`,
          triggers: [t],
          name: `Command ${t}`,
          type: "standard" as const,
          routes: [],
        })),
      },
    ],
    ignoreList: [],
  };
}

const CONFIG_NO_S = makeConfig(["g", "yt", "gh"]);
const CONFIG_WITH_S = makeConfig(["g", "s", "gh"]);

// ── shouldInterceptLocalSearch ────────────────────────────────────────────────

describe("shouldInterceptLocalSearch", () => {
  beforeEach(() => {
    installMockStorage();
  });

  // -- Positive cases --------------------------------------------------------

  it("intercepts 's' with no query", () => {
    const result = shouldInterceptLocalSearch("s", PREFS_ENABLED, CONFIG_NO_S);
    expect(result.intercept).toBe(true);
    if (result.intercept) expect(result.query).toBe("");
  });

  it("intercepts 's query' and extracts the trimmed query", () => {
    const result = shouldInterceptLocalSearch("s hello world", PREFS_ENABLED, CONFIG_NO_S);
    expect(result.intercept).toBe(true);
    if (result.intercept) expect(result.query).toBe("hello world");
  });

  it("intercepts 's  leading-spaces-in-query' trimming the query", () => {
    const result = shouldInterceptLocalSearch("s   my query  ", PREFS_ENABLED, CONFIG_NO_S);
    expect(result.intercept).toBe(true);
    // The raw match captures "my query  " from after "s   ", then we trim
    if (result.intercept) expect(result.query).toBe("my query");
  });

  it("intercepts 'S query' (case-insensitive trigger matching)", () => {
    const result = shouldInterceptLocalSearch("S report", PREFS_ENABLED, CONFIG_NO_S);
    expect(result.intercept).toBe(true);
    if (result.intercept) expect(result.query).toBe("report");
  });

  // -- Guard: disabled -------------------------------------------------------

  it("does NOT intercept when prefs.enabled is false", () => {
    const result = shouldInterceptLocalSearch("s query", PREFS_DISABLED, CONFIG_NO_S);
    expect(result.intercept).toBe(false);
  });

  // -- Guard: unpaired -------------------------------------------------------

  it("does NOT intercept when prefs.token is absent (unpaired)", () => {
    const result = shouldInterceptLocalSearch("s query", PREFS_UNPAIRED, CONFIG_NO_S);
    expect(result.intercept).toBe(false);
  });

  it("does NOT intercept when prefs.token is empty string (treated as absent via falsy check)", () => {
    const prefs: LocalSearchPrefs = { ...PREFS_ENABLED, token: "" };
    const result = shouldInterceptLocalSearch("s query", prefs, CONFIG_NO_S);
    expect(result.intercept).toBe(false);
  });

  // -- Guard: config has "s" -------------------------------------------------

  it("does NOT intercept when config defines 's' trigger (config command wins)", () => {
    const result = shouldInterceptLocalSearch("s query", PREFS_ENABLED, CONFIG_WITH_S);
    expect(result.intercept).toBe(false);
  });

  it("does NOT intercept when config defines 'S' (uppercase — buildTriggerMap lowercases)", () => {
    const cfg = makeConfig(["g", "gh"]);
    cfg.groups[0].commands!.push({
      id: "cmd-s",
      triggers: ["S"],
      name: "Stack Overflow",
      type: "standard",
      routes: [],
    });
    const result = shouldInterceptLocalSearch("s query", PREFS_ENABLED, cfg);
    expect(result.intercept).toBe(false);
  });

  // -- Guard: input doesn't match "s" command --------------------------------

  it("does NOT intercept for a non-'s' trigger (e.g. 'g query')", () => {
    const result = shouldInterceptLocalSearch("g query", PREFS_ENABLED, CONFIG_NO_S);
    expect(result.intercept).toBe(false);
  });

  it("does NOT intercept for 'search query' (starts with 's' but not the 's' command)", () => {
    const result = shouldInterceptLocalSearch("search docs", PREFS_ENABLED, CONFIG_NO_S);
    expect(result.intercept).toBe(false);
  });

  it("does NOT intercept for empty input", () => {
    const result = shouldInterceptLocalSearch("", PREFS_ENABLED, CONFIG_NO_S);
    expect(result.intercept).toBe(false);
  });

  it("does NOT intercept when all guards fail simultaneously (disabled + no token + config-s)", () => {
    const result = shouldInterceptLocalSearch("s query", PREFS_DISABLED, CONFIG_WITH_S);
    expect(result.intercept).toBe(false);
  });

  it("does NOT intercept for 'st query' (trigger is 'st', not 's')", () => {
    const result = shouldInterceptLocalSearch("st query", PREFS_ENABLED, CONFIG_NO_S);
    expect(result.intercept).toBe(false);
  });
});

// ── buildSearchRequest ────────────────────────────────────────────────────────

describe("buildSearchRequest", () => {
  it("maps query correctly", () => {
    const req = buildSearchRequest(PREFS_ENABLED, "my query", []);
    expect(req.query).toBe("my query");
  });

  it("maps queryMode from prefs", () => {
    const req = buildSearchRequest(PREFS_ENABLED, "q", []);
    expect(req.queryMode).toBe("simple");
  });

  it("maps queryMode wildcard when prefs say wildcard", () => {
    const prefs: LocalSearchPrefs = { ...PREFS_ENABLED, queryMode: "wildcard" };
    const req = buildSearchRequest(prefs, "q", []);
    expect(req.queryMode).toBe("wildcard");
  });

  it("maps sort field and dir from prefs", () => {
    const req = buildSearchRequest(PREFS_ENABLED, "q", []);
    expect(req.sort).toEqual({ field: "relevance", dir: "desc" });
  });

  it("maps non-default sort correctly", () => {
    const prefs: LocalSearchPrefs = {
      ...PREFS_ENABLED,
      sort: { field: "modified", dir: "asc" },
    };
    const req = buildSearchRequest(prefs, "q", []);
    expect(req.sort).toEqual({ field: "modified", dir: "asc" });
  });

  it("maps filters from prefs", () => {
    const prefs: LocalSearchPrefs = {
      ...PREFS_ENABLED,
      filters: { types: ["document", "image"], titleOnly: true },
    };
    const req = buildSearchRequest(prefs, "q", []);
    expect(req.filters).toEqual({ types: ["document", "image"], titleOnly: true });
  });

  it("always sets page=0", () => {
    const req = buildSearchRequest(PREFS_ENABLED, "q", []);
    expect(req.page).toBe(0);
  });

  it("always sets pageSize=50", () => {
    const req = buildSearchRequest(PREFS_ENABLED, "q", []);
    expect(req.pageSize).toBe(50);
  });

  it("omits history field when recentlyOpened is empty", () => {
    const req = buildSearchRequest(PREFS_ENABLED, "q", []);
    expect(req.history).toBeUndefined();
  });

  it("passes recentlyOpened as history when non-empty", () => {
    const recent = ["id-1", "id-2", "id-3"];
    const req = buildSearchRequest(PREFS_ENABLED, "q", recent);
    expect(req.history).toEqual(recent);
  });

  it("uses empty recentlyOpened by default (no third arg)", () => {
    const req = buildSearchRequest(PREFS_ENABLED, "q");
    expect(req.history).toBeUndefined();
  });

  // Extended filter fields (Phase 3b)

  it("carries pathPrefix from prefs.filters when set", () => {
    const prefs: LocalSearchPrefs = {
      ...PREFS_ENABLED,
      filters: { pathPrefix: "/home/user/Documents" },
    };
    const req = buildSearchRequest(prefs, "q", []);
    expect(req.filters.pathPrefix).toBe("/home/user/Documents");
  });

  it("carries modifiedRange from prefs.filters when set (epoch ms)", () => {
    const range = { from: 1_700_000_000_000 };
    const prefs: LocalSearchPrefs = {
      ...PREFS_ENABLED,
      filters: { modifiedRange: range },
    };
    const req = buildSearchRequest(prefs, "q", []);
    expect(req.filters.modifiedRange).toEqual(range);
  });

  it("carries createdRange from prefs.filters when set (epoch ms)", () => {
    const range = { from: 1_680_000_000_000, to: 1_700_000_000_000 };
    const prefs: LocalSearchPrefs = {
      ...PREFS_ENABLED,
      filters: { createdRange: range },
    };
    const req = buildSearchRequest(prefs, "q", []);
    expect(req.filters.createdRange).toEqual(range);
  });

  it("omits pathPrefix from filters when not set in prefs", () => {
    const req = buildSearchRequest(PREFS_ENABLED, "q", []);
    expect(req.filters.pathPrefix).toBeUndefined();
  });

  it("omits modifiedRange from filters when not set in prefs", () => {
    const req = buildSearchRequest(PREFS_ENABLED, "q", []);
    expect(req.filters.modifiedRange).toBeUndefined();
  });

  it("carries all extended filter fields simultaneously", () => {
    const modRange = { from: 1_690_000_000_000 };
    const crRange = { from: 1_680_000_000_000 };
    const prefs: LocalSearchPrefs = {
      ...PREFS_ENABLED,
      filters: {
        types: ["document"],
        pathPrefix: "/home/user",
        modifiedRange: modRange,
        createdRange: crRange,
        titleOnly: true,
      },
    };
    const req = buildSearchRequest(prefs, "q", []);
    expect(req.filters.types).toEqual(["document"]);
    expect(req.filters.pathPrefix).toBe("/home/user");
    expect(req.filters.modifiedRange).toEqual(modRange);
    expect(req.filters.createdRange).toEqual(crRange);
    expect(req.filters.titleOnly).toBe(true);
  });

  // caseSensitive + exactPhrase (Phase 6b)

  it("includes caseSensitive: false when prefs use the default", () => {
    const prefs: LocalSearchPrefs = { ...PREFS_ENABLED, caseSensitive: false, exactPhrase: false };
    const req = buildSearchRequest(prefs, "q", []);
    expect(req.caseSensitive).toBe(false);
  });

  it("includes exactPhrase: false when prefs use the default", () => {
    const prefs: LocalSearchPrefs = { ...PREFS_ENABLED, caseSensitive: false, exactPhrase: false };
    const req = buildSearchRequest(prefs, "q", []);
    expect(req.exactPhrase).toBe(false);
  });

  it("passes caseSensitive: true from prefs", () => {
    const prefs: LocalSearchPrefs = { ...PREFS_ENABLED, caseSensitive: true, exactPhrase: false };
    const req = buildSearchRequest(prefs, "q", []);
    expect(req.caseSensitive).toBe(true);
  });

  it("passes exactPhrase: true from prefs", () => {
    const prefs: LocalSearchPrefs = { ...PREFS_ENABLED, caseSensitive: false, exactPhrase: true };
    const req = buildSearchRequest(prefs, "q", []);
    expect(req.exactPhrase).toBe(true);
  });

  it("passes both caseSensitive and exactPhrase simultaneously", () => {
    const prefs: LocalSearchPrefs = { ...PREFS_ENABLED, caseSensitive: true, exactPhrase: true };
    const req = buildSearchRequest(prefs, "q", []);
    expect(req.caseSensitive).toBe(true);
    expect(req.exactPhrase).toBe(true);
  });
});

// ── navDown ───────────────────────────────────────────────────────────────────

describe("navDown", () => {
  it("returns -1 when total is 0 (nothing to select)", () => {
    expect(navDown(-1, 0)).toBe(-1);
    expect(navDown(0, 0)).toBe(-1);
  });

  it("moves from -1 to 0 (first item) on first down", () => {
    expect(navDown(-1, 5)).toBe(0);
  });

  it("moves from 0 to 1", () => {
    expect(navDown(0, 5)).toBe(1);
  });

  it("moves from middle to next", () => {
    expect(navDown(2, 5)).toBe(3);
  });

  it("clamps at last item (index total-1)", () => {
    expect(navDown(4, 5)).toBe(4);
  });

  it("stays at last item if already there", () => {
    expect(navDown(4, 5)).toBe(4);
    expect(navDown(9, 10)).toBe(9);
  });

  it("works correctly with total=1", () => {
    expect(navDown(-1, 1)).toBe(0);
    expect(navDown(0, 1)).toBe(0); // clamp at 0
  });
});

// ── navUp ─────────────────────────────────────────────────────────────────────

describe("navUp", () => {
  it("returns -1 when total is 0", () => {
    expect(navUp(-1, 0)).toBe(-1);
    expect(navUp(2, 0)).toBe(-1);
  });

  it("moves from 1 to 0", () => {
    expect(navUp(1, 5)).toBe(0);
  });

  it("moves from middle to previous", () => {
    expect(navUp(3, 5)).toBe(2);
  });

  it("moves from 0 to -1 (deselects — above the list)", () => {
    expect(navUp(0, 5)).toBe(-1);
  });

  it("stays at -1 when already deselected", () => {
    expect(navUp(-1, 5)).toBe(-1);
  });

  it("moves from last item upward", () => {
    expect(navUp(4, 5)).toBe(3);
  });

  it("works correctly with total=1", () => {
    expect(navUp(0, 1)).toBe(-1);
    expect(navUp(-1, 1)).toBe(-1);
  });
});

// ── buildSearchRequest — page parameter ───────────────────────────────────────

describe("buildSearchRequest — page parameter", () => {
  it("defaults to page=0 when page arg is omitted", () => {
    const req = buildSearchRequest(PREFS_ENABLED, "q");
    expect(req.page).toBe(0);
  });

  it("passes explicit page=0", () => {
    const req = buildSearchRequest(PREFS_ENABLED, "q", [], 0);
    expect(req.page).toBe(0);
  });

  it("passes explicit page=1 for the second page", () => {
    const req = buildSearchRequest(PREFS_ENABLED, "q", [], 1);
    expect(req.page).toBe(1);
  });

  it("passes explicit page=5", () => {
    const req = buildSearchRequest(PREFS_ENABLED, "q", [], 5);
    expect(req.page).toBe(5);
  });

  it("pageSize is always 50 regardless of page", () => {
    const req = buildSearchRequest(PREFS_ENABLED, "q", [], 3);
    expect(req.pageSize).toBe(50);
  });
});

// ── hasMore ───────────────────────────────────────────────────────────────────

describe("hasMore", () => {
  it("returns false when loaded === total (all loaded)", () => {
    expect(hasMore(50, 50)).toBe(false);
  });

  it("returns false when loaded > total (shouldn't happen, but safe)", () => {
    expect(hasMore(55, 50)).toBe(false);
  });

  it("returns true when loaded < total", () => {
    expect(hasMore(50, 100)).toBe(true);
  });

  it("returns false when both are 0 (no results)", () => {
    expect(hasMore(0, 0)).toBe(false);
  });

  it("returns true when loaded=0 and total>0 (nothing loaded yet)", () => {
    expect(hasMore(0, 1)).toBe(true);
  });

  it("returns true for partial first page (50 of 200)", () => {
    expect(hasMore(50, 200)).toBe(true);
  });

  it("returns false at exact boundary (loaded === total)", () => {
    expect(hasMore(1, 1)).toBe(false);
    expect(hasMore(200, 200)).toBe(false);
  });
});

// ── nextPage ──────────────────────────────────────────────────────────────────

describe("nextPage", () => {
  it("returns 1 when current is 0 (first page → second page)", () => {
    expect(nextPage(0)).toBe(1);
  });

  it("returns 2 when current is 1", () => {
    expect(nextPage(1)).toBe(2);
  });

  it("returns current + 1 for arbitrary pages", () => {
    expect(nextPage(5)).toBe(6);
    expect(nextPage(99)).toBe(100);
  });
});

// ── appendResults ─────────────────────────────────────────────────────────────

function makeFile(id: string): FileResult {
  return {
    id,
    name: `${id}.txt`,
    path: `/files/${id}.txt`,
    dir: "/files",
    ext: "txt",
    mime: "text/plain",
    type: "document",
    size: 1024,
    createdAt: 1_700_000_000_000,
    modifiedAt: 1_700_000_000_000,
    score: 1,
  };
}

describe("appendResults", () => {
  it("appends next results to prev", () => {
    const prev = [makeFile("a"), makeFile("b")];
    const next = [makeFile("c"), makeFile("d")];
    const result = appendResults(prev, next);
    expect(result.map((f) => f.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("does not mutate the prev array", () => {
    const prev = [makeFile("a")];
    const next = [makeFile("b")];
    appendResults(prev, next);
    expect(prev).toHaveLength(1);
  });

  it("handles empty prev", () => {
    const next = [makeFile("a")];
    const result = appendResults([], next);
    expect(result).toEqual(next);
  });

  it("handles empty next", () => {
    const prev = [makeFile("a")];
    const result = appendResults(prev, []);
    expect(result).toEqual(prev);
    // Returns a new array, not the original
    expect(result).not.toBe(prev);
  });

  it("handles both empty", () => {
    expect(appendResults([], [])).toEqual([]);
  });

  it("preserves order: prev items come before next items", () => {
    const prev = [makeFile("x")];
    const next = [makeFile("y"), makeFile("z")];
    const result = appendResults(prev, next);
    expect(result[0].id).toBe("x");
    expect(result[1].id).toBe("y");
    expect(result[2].id).toBe("z");
  });
});

// ── resetResults ──────────────────────────────────────────────────────────────

describe("resetResults", () => {
  it("returns an empty array", () => {
    expect(resetResults()).toEqual([]);
  });

  it("each call returns a new empty array (not the same reference)", () => {
    const a = resetResults();
    const b = resetResults();
    expect(a).not.toBe(b);
  });

  it("return value has length 0", () => {
    expect(resetResults()).toHaveLength(0);
  });
});

// ── formatDate ────────────────────────────────────────────────────────────────

describe("formatDate", () => {
  it("returns '—' for ts=0 (unknown timestamp)", () => {
    expect(formatDate(0)).toBe("—");
  });

  it("returns 'just now' for a timestamp 30 seconds ago (ms)", () => {
    const ts = Date.now() - 30_000;
    expect(formatDate(ts)).toBe("just now");
  });

  it("returns 'Xd ago' for a timestamp a few days ago (ms) — not a 1970 date", () => {
    const threeDaysAgoMs = Date.now() - 3 * 24 * 60 * 60 * 1_000;
    const result = formatDate(threeDaysAgoMs);
    expect(result).toBe("3d ago");
  });

  it("returns a locale date string (not 1/1/1970) for a timestamp older than 7 days (ms)", () => {
    const tenDaysAgoMs = Date.now() - 10 * 24 * 60 * 60 * 1_000;
    const result = formatDate(tenDaysAgoMs);
    expect(result).not.toBe("1/1/1970");
    // Must contain the current year (or last year near year boundaries)
    const currentYear = new Date().getFullYear();
    const containsYear =
      result.includes(String(currentYear)) ||
      result.includes(String(currentYear - 1));
    expect(containsYear).toBe(true);
  });
});
