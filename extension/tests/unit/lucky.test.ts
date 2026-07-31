import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { buildLuckyUrl } from "../../src/core/lucky.js";
import type { FastTravelConfig } from "../../src/core/types.js";

function makeConfig(defaultLuckyUrl?: string | null, defaultCommand = "g"): FastTravelConfig {
  return {
    version: 2,
    defaultCommand,
    ...(defaultLuckyUrl != null ? { defaultLuckyUrl } : {}),
    groups: [
      {
        id: "grp",
        name: "Group",
        commands: [
          {
            id: "google",
            triggers: ["g"],
            name: "Google",
            type: "standard",
            routes: [{ devices: "*", defaultUrl: "https://www.google.com" }],
          },
        ],
      },
    ],
    ignoreList: [],
  };
}

describe("buildLuckyUrl", () => {
  it("substitutes the encoded query into the top-level defaultLuckyUrl", () => {
    const cfg = makeConfig("https://www.google.com/search?q={query}&btnI");
    expect(buildLuckyUrl(cfg, "hello world")).toEqual({
      url: "https://www.google.com/search?q=hello%20world&btnI",
      commandId: "google",
    });
  });

  it("returns null when the config has no defaultLuckyUrl", () => {
    expect(buildLuckyUrl(makeConfig(), "hello")).toBeNull();
  });

  it("returns null when the default command trigger matches nothing", () => {
    const cfg = makeConfig("https://example.com/?q={query}", "missing");
    expect(buildLuckyUrl(cfg, "hello")).toBeNull();
  });

  it("returns null for an empty or whitespace-only query", () => {
    const cfg = makeConfig("https://example.com/?q={query}");
    expect(buildLuckyUrl(cfg, "")).toBeNull();
    expect(buildLuckyUrl(cfg, "   ")).toBeNull();
  });
});

interface LuckyFixture {
  description: string;
  input: { defaultLuckyUrl: string | null; defaultCommand: string; query: string };
  expected: { url: string; commandId: string } | null;
}

const luckyFixtures: LuckyFixture[] = JSON.parse(
  readFileSync(
    resolve(__dirname, "../../../shared/test-fixtures/lucky.fixtures.json"),
    "utf-8",
  ),
);

describe("buildLuckyUrl — shared fixtures", () => {
  for (const fixture of luckyFixtures) {
    it(fixture.description, () => {
      const cfg = makeConfig(fixture.input.defaultLuckyUrl, fixture.input.defaultCommand);
      const result = buildLuckyUrl(cfg, fixture.input.query);
      expect(result).toEqual(fixture.expected);
    });
  }
});
