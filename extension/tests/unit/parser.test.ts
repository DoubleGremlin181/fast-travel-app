import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseCommand, levenshtein, buildTriggerMap, findRoute, tryUrlDetection } from "../../src/core/parser.js";
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

describe("default engine independence", () => {
  // A config whose default engine is DuckDuckGo, not Google.
  const ddgConfig: FastTravelConfig = {
    version: 2,
    defaultCommand: "ddg",
    groups: [
      {
        id: "engines",
        name: "Engines",
        commands: [
          {
            id: "duckduckgo",
            triggers: ["ddg"],
            name: "DuckDuckGo",
            type: "standard",
            routes: [
              {
                devices: "*",
                defaultUrl: "https://duckduckgo.com",
                searchUrl: "https://duckduckgo.com/?q={query}",
              },
            ],
          },
        ],
      },
    ],
    ignoreList: [],
  };

  it("empty query redirects to the default engine's home, not Google", () => {
    const result = parseCommand({ rawQuery: "", device: "Linux", config: ddgConfig });
    expect(result.type).toBe("redirect");
    expect((result as ParseResult).url).toBe("https://duckduckgo.com");
    expect((result as ParseResult).commandId).toBe("duckduckgo");
  });

  it("an unmatched query searches the default engine, not Google", () => {
    const result = parseCommand({ rawQuery: "some random thing", device: "Linux", config: ddgConfig });
    expect(result.type).toBe("redirect");
    expect((result as ParseResult).url).toBe("https://duckduckgo.com/?q=some%20random%20thing");
    expect((result as ParseResult).commandId).toBe("duckduckgo");
    expect((result as ParseResult).matchType).toBe("default-search");
  });

  it("dismissing a typo (trigger ignored) searches the default engine, not Google", () => {
    // Mirrors newtab.ts defaultSearch(): re-parse with the typo'd trigger forced
    // into the ignore list → a verbatim default-engine search, never Google.
    const result = parseCommand({
      rawQuery: "ddh something",
      device: "Linux",
      config: ddgConfig,
      ignoreList: ["ddh"],
    });
    expect(result.type).toBe("redirect");
    expect((result as ParseResult).url).toBe("https://duckduckgo.com/?q=ddh%20something");
  });

  it("falls back to the default command's home page when it has no searchUrl (not Google)", () => {
    const noSearchConfig: FastTravelConfig = {
      version: 2,
      defaultCommand: "home",
      groups: [
        {
          id: "grp",
          name: "Group",
          commands: [
            {
              id: "home",
              triggers: ["home"],
              name: "Home",
              type: "standard",
              routes: [{ devices: "*", defaultUrl: "https://home.example.com" }],
            },
          ],
        },
      ],
      ignoreList: [],
    };
    const result = parseCommand({ rawQuery: "anything here", device: "Linux", config: noSearchConfig });
    expect(result.type).toBe("redirect");
    expect((result as ParseResult).url).toBe("https://home.example.com");
    expect((result as ParseResult).commandId).toBe("home");
  });
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
    expect(map.has("mp")).toBe(true);
    expect(map.has("gh")).toBe(true);
  });

  it("maps triggers case-insensitively", () => {
    const map = buildTriggerMap(config);
    // Triggers are stored lowercase; callers must lower before lookup.
    expect(map.get("G")).toBeUndefined();
    // Aliases resolve to the same command, and lookups are lowercased.
    expect(map.get("miruro")).toBe(map.get("ANI".toLowerCase()));
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

describe("tryUrlDetection", () => {
  it("detects a bare domain and prepends https", () => {
    expect(tryUrlDetection("gmail.com")).toEqual({
      type: "redirect",
      url: "https://gmail.com",
      commandId: null,
      matchType: "url",
    });
  });

  it("passes an explicit scheme through unchanged, case-insensitively", () => {
    expect(tryUrlDetection("HTTP://EXAMPLE.COM/Path?x=1#y")?.url).toBe(
      "HTTP://EXAMPLE.COM/Path?x=1#y",
    );
  });

  it("rejects a scheme with no host after it", () => {
    expect(tryUrlDetection("http://")).toBeNull();
    expect(tryUrlDetection("https://")).toBeNull();
  });

  it("rejects any input containing whitespace", () => {
    expect(tryUrlDetection("node.js install")).toBeNull();
  });

  it("accepts bare localhost", () => {
    expect(tryUrlDetection("localhost")?.url).toBe("https://localhost");
  });

  it("rejects a bare single label that is not localhost", () => {
    expect(tryUrlDetection("com")).toBeNull();
    expect(tryUrlDetection("gmail")).toBeNull();
  });

  it("accepts ports of 1-5 digits and rejects longer", () => {
    expect(tryUrlDetection("example.com:99999")?.url).toBe(
      "https://example.com:99999",
    );
    expect(tryUrlDetection("example.com:123456")).toBeNull();
    expect(tryUrlDetection("example.com:")).toBeNull();
  });

  it("accepts valid IPv4 and rejects out-of-range octets", () => {
    expect(tryUrlDetection("192.168.1.1")?.url).toBe("https://192.168.1.1");
    expect(tryUrlDetection("255.255.255.255")?.url).toBe(
      "https://255.255.255.255",
    );
    expect(tryUrlDetection("256.1.1.1")).toBeNull();
    expect(tryUrlDetection("999.999.999.999")).toBeNull();
  });

  it("rejects hyphens at label edges but accepts them inside", () => {
    expect(tryUrlDetection("my-site.com")?.url).toBe("https://my-site.com");
    expect(tryUrlDetection("-example.com")).toBeNull();
    expect(tryUrlDetection("example-.com")).toBeNull();
  });

  it("rejects labels with invalid characters", () => {
    expect(tryUrlDetection("foo_bar.com")).toBeNull();
    expect(tryUrlDetection("exa mple.com")).toBeNull();
  });

  it("rejects unknown TLDs and empty labels", () => {
    expect(tryUrlDetection("file.txt")).toBeNull();
    expect(tryUrlDetection("example.com.")).toBeNull();
    expect(tryUrlDetection(".example.com")).toBeNull();
    expect(tryUrlDetection("example..com")).toBeNull();
  });

  it("never treats non-http schemes as URLs", () => {
    expect(tryUrlDetection("javascript:alert(1)")).toBeNull();
    expect(tryUrlDetection("data:text/html,hi")).toBeNull();
  });
});

describe("URL detection precedence", () => {
  it("a configured trigger that looks like a domain beats URL detection", () => {
    const cfg: FastTravelConfig = {
      version: 2,
      defaultCommand: "ex",
      groups: [
        {
          id: "grp",
          name: "Test Group",
          commands: [
            {
              id: "ex",
              triggers: ["example.com"],
              name: "Example Redirect",
              type: "redirect",
              routes: [{ devices: "*", defaultUrl: "https://internal.example/portal" }],
            },
          ],
        },
      ],
      ignoreList: [],
    };
    const result = parseCommand({ rawQuery: "example.com", device: "Linux", config: cfg });
    expect(result.type).toBe("redirect");
    expect((result as ParseResult).url).toBe("https://internal.example/portal");
    expect((result as ParseResult).commandId).toBe("ex");
    expect((result as ParseResult).matchType).toBe("exact");
  });
});
