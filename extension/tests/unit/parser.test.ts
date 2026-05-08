import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseCommand, levenshtein, buildTriggerMap, findRoute } from "../../src/core/parser.js";
import type { FastTravelConfig, ParseResult, TypoResult, DeviceType } from "../../src/core/types.js";

/** Minimal config factory for pattern-match unit tests. */
function makePatternConfig(matchPattern: string, patternUrl: string): FastTravelConfig {
  return {
    version: 2,
    defaultCommand: "test",
    groups: [
      {
        id: "grp",
        name: "Test Group",
        commands: [
          {
            id: "test",
            triggers: ["test"],
            name: "Test Command",
            type: "standard",
            routes: [
              {
                devices: "*",
                defaultUrl: "https://example.com/default",
                patterns: [{ match: matchPattern, url: patternUrl }],
              },
            ],
          },
        ],
      },
    ],
    ignoreList: [],
  };
}

const config: FastTravelConfig = JSON.parse(
  readFileSync(
    resolve(__dirname, "../../../shared/config/default-config.json"),
    "utf-8",
  ),
);

interface ParseFixture {
  description: string;
  input: { rawQuery: string; device: DeviceType };
  expected: {
    type: string;
    url?: string;
    commandId?: string | null;
    matchType?: string;
    suggestedTrigger?: string;
  };
}

interface TypoFixture {
  description: string;
  input: { rawQuery: string; device: DeviceType; ignoreList: string[] };
  expected: {
    type: string;
    matchType?: string;
    suggestedTrigger?: string;
  };
}

const parseFixtures: ParseFixture[] = JSON.parse(
  readFileSync(
    resolve(__dirname, "../../../shared/test-fixtures/parse-command.fixtures.json"),
    "utf-8",
  ),
);

const typoFixtures: TypoFixture[] = JSON.parse(
  readFileSync(
    resolve(__dirname, "../../../shared/test-fixtures/typo-detection.fixtures.json"),
    "utf-8",
  ),
);

describe("parseCommand - shared fixtures", () => {
  for (const fixture of parseFixtures) {
    it(fixture.description, () => {
      const result = parseCommand({
        rawQuery: fixture.input.rawQuery,
        device: fixture.input.device,
        config,
      });

      expect(result.type).toBe(fixture.expected.type);

      if (fixture.expected.type === "redirect") {
        const r = result as ParseResult;
        if (fixture.expected.url !== undefined) {
          expect(r.url).toBe(fixture.expected.url);
        }
        if (fixture.expected.commandId !== undefined) {
          expect(r.commandId).toBe(fixture.expected.commandId);
        }
        if (fixture.expected.matchType !== undefined) {
          expect(r.matchType).toBe(fixture.expected.matchType);
        }
      }

      if (fixture.expected.type === "typo") {
        const t = result as TypoResult;
        if (fixture.expected.suggestedTrigger !== undefined) {
          expect(t.suggestedTrigger).toBe(fixture.expected.suggestedTrigger);
        }
      }
    });
  }
});

describe("typo detection - shared fixtures", () => {
  for (const fixture of typoFixtures) {
    it(fixture.description, () => {
      const result = parseCommand({
        rawQuery: fixture.input.rawQuery,
        device: fixture.input.device,
        config,
        ignoreList: fixture.input.ignoreList,
      });

      expect(result.type).toBe(fixture.expected.type);

      if (fixture.expected.type === "redirect") {
        const r = result as ParseResult;
        if (fixture.expected.matchType) {
          expect(r.matchType).toBe(fixture.expected.matchType);
        }
      }

      if (fixture.expected.type === "typo") {
        const t = result as TypoResult;
        if (fixture.expected.suggestedTrigger) {
          expect(t.suggestedTrigger).toBe(fixture.expected.suggestedTrigger);
        }
      }
    });
  }
});

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("abc", "abc")).toBe(0);
  });

  it("returns length for empty vs non-empty", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
  });

  it("handles single character substitution", () => {
    expect(levenshtein("cat", "car")).toBe(1);
  });

  it("handles insertion", () => {
    expect(levenshtein("abc", "abcd")).toBe(1);
  });

  it("handles deletion", () => {
    expect(levenshtein("abcd", "abc")).toBe(1);
  });
});

describe("buildTriggerMap", () => {
  it("flattens all triggers from nested groups", () => {
    const map = buildTriggerMap(config);
    expect(map.has("g")).toBe(true);
    expect(map.has("ddg")).toBe(true);
    expect(map.has("$")).toBe(true);
    expect(map.has("r/")).toBe(true);
    expect(map.has("maps")).toBe(true);
    expect(map.has("gh")).toBe(true);
  });

  it("maps triggers case-insensitively", () => {
    const map = buildTriggerMap(config);
    // Triggers are stored lowercase; callers must lower before lookup.
    expect(map.get("G")).toBeUndefined();
    expect(map.get("g")).toBe(map.get("GOOGLE".toLowerCase()));
  });
});

describe("findRoute", () => {
  const routes = [
    { devices: ["Android"] as DeviceType[], defaultUrl: "https://android.example.com" },
    { devices: ["iOS"] as DeviceType[], defaultUrl: "https://ios.example.com" },
    { devices: "*" as const, defaultUrl: "https://wildcard.example.com" },
  ];

  it("returns exact device match", () => {
    const route = findRoute(routes, "Android");
    expect(route?.defaultUrl).toBe("https://android.example.com");
  });

  it("falls back to wildcard when no exact match", () => {
    const route = findRoute(routes, "Linux");
    expect(route?.defaultUrl).toBe("https://wildcard.example.com");
  });

  it("returns null when no match at all", () => {
    const noWildcard = [
      { devices: ["Android"] as DeviceType[], defaultUrl: "https://android.example.com" },
    ];
    const route = findRoute(noWildcard, "Linux");
    expect(route).toBeNull();
  });
});

describe("compilePattern — literal regex metacharacter escaping", () => {
  // Pattern: {id}?foo=bar
  // The '?' is a literal query-string separator, NOT a regex quantifier.
  // Before the fix, '?' made the preceding capture group optional, so
  // 'foo=bar' alone (no id) would match. After the fix it must not.
  const cfg = makePatternConfig(
    "{id}?foo=bar",
    "https://example.com/item/{id}?foo=bar",
  );

  it("matches when the literal '?' and suffix are present", () => {
    const result = parseCommand({ rawQuery: "test abc123?foo=bar", device: "Linux", config: cfg });
    expect(result.type).toBe("redirect");
    expect((result as ParseResult).matchType).toBe("pattern");
    expect((result as ParseResult).url).toBe(
      "https://example.com/item/abc123?foo=bar",
    );
  });

  it("does NOT match when the literal '?' is absent (suffix-only input)", () => {
    // Without escaping, '?' makes the capture optional and 'foo=bar' alone
    // would satisfy the regex — the bug. With escaping it must not match.
    const result = parseCommand({ rawQuery: "test foo=bar", device: "Linux", config: cfg });
    // Falls through to search (no pattern match, no searchUrl → default)
    expect((result as ParseResult).matchType).not.toBe("pattern");
  });

  it("treats '.' in literal text as a literal dot, not a wildcard", () => {
    const dotCfg = makePatternConfig(
      "{version}.zip",
      "https://example.com/dl/{version}.zip",
    );
    // "1x2zip" contains no literal '.' — should not match the pattern.
    const noMatch = parseCommand({ rawQuery: "test 1x2zip", device: "Linux", config: dotCfg });
    expect((noMatch as ParseResult).matchType).not.toBe("pattern");

    // "1.2.zip" has a literal '.' — should match.
    const match = parseCommand({ rawQuery: "test 1.2.zip", device: "Linux", config: dotCfg });
    expect(match.type).toBe("redirect");
    expect((match as ParseResult).matchType).toBe("pattern");
    expect((match as ParseResult).url).toBe("https://example.com/dl/1.2.zip");
  });

  it("treats '+' in literal text as a literal plus, not a regex quantifier", () => {
    const plusCfg = makePatternConfig(
      "{a}+{b}",
      "https://example.com/add?a={a}&b={b}",
    );
    // "3+4" should match with a="3", b="4"
    const match = parseCommand({ rawQuery: "test 3+4", device: "Linux", config: plusCfg });
    expect(match.type).toBe("redirect");
    expect((match as ParseResult).matchType).toBe("pattern");
    expect((match as ParseResult).url).toBe(
      "https://example.com/add?a=3&b=4",
    );
    // "34" (no literal '+') should NOT match
    const noMatch = parseCommand({ rawQuery: "test 34", device: "Linux", config: plusCfg });
    expect((noMatch as ParseResult).matchType).not.toBe("pattern");
  });
});

describe("repeated placeholder substitution", () => {
  it("replaces all occurrences of a pattern placeholder when it appears more than once in the URL", () => {
    // Pattern URL: https://example.com/{id}/edit/{id}
    // The {id} placeholder appears twice; both must be substituted.
    const cfg = makePatternConfig(
      "{id}",
      "https://example.com/{id}/edit/{id}",
    );
    const result = parseCommand({ rawQuery: "test abc123", device: "Linux", config: cfg });
    expect(result.type).toBe("redirect");
    expect((result as ParseResult).matchType).toBe("pattern");
    expect((result as ParseResult).url).toBe(
      "https://example.com/abc123/edit/abc123",
    );
  });

  it("replaces all occurrences of {query} when it appears more than once in a standard command searchUrl", () => {
    // Build a config with a standard command whose searchUrl contains {query} twice.
    const cfg: FastTravelConfig = {
      version: 2,
      defaultCommand: "dupe",
      groups: [
        {
          id: "grp",
          name: "Test Group",
          commands: [
            {
              id: "dupe",
              triggers: ["dupe"],
              name: "Dupe Query",
              type: "standard",
              routes: [
                {
                  devices: "*",
                  defaultUrl: "https://example.com/",
                  searchUrl: "https://example.com/search?q={query}&fallback={query}",
                },
              ],
            },
          ],
        },
      ],
      ignoreList: [],
    };
    const result = parseCommand({ rawQuery: "dupe hello world", device: "Linux", config: cfg });
    expect(result.type).toBe("redirect");
    expect((result as ParseResult).matchType).toBe("search");
    expect((result as ParseResult).url).toBe(
      "https://example.com/search?q=hello%20world&fallback=hello%20world",
    );
  });

  it("replaces all occurrences of {term} when it appears more than once in a prefix command URL", () => {
    const cfg: FastTravelConfig = {
      version: 2,
      defaultCommand: "pfx",
      groups: [
        {
          id: "grp",
          name: "Test Group",
          commands: [
            {
              id: "pfx",
              triggers: ["pfx/"],
              name: "Prefix Dupe",
              type: "prefix",
              routes: [
                {
                  devices: "*",
                  defaultUrl: "https://example.com/{term}/view/{term}",
                },
              ],
            },
          ],
        },
      ],
      ignoreList: [],
    };
    const result = parseCommand({ rawQuery: "pfx/myrepo", device: "Linux", config: cfg });
    expect(result.type).toBe("redirect");
    expect((result as ParseResult).url).toBe(
      "https://example.com/myrepo/view/myrepo",
    );
  });
});
