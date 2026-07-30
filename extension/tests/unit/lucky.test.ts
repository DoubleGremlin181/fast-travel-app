import { describe, it, expect } from "vitest";
import { buildLuckyUrl } from "../../src/core/lucky.js";
import type { FastTravelConfig } from "../../src/core/types.js";

function makeConfig(luckyUrl?: string, defaultCommand = "g"): FastTravelConfig {
  return {
    version: 2,
    defaultCommand,
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
            ...(luckyUrl !== undefined ? { luckyUrl } : {}),
            routes: [{ devices: "*", defaultUrl: "https://www.google.com" }],
          },
        ],
      },
    ],
    ignoreList: [],
  };
}

describe("buildLuckyUrl", () => {
  it("substitutes the encoded query into the default command's luckyUrl", () => {
    const cfg = makeConfig("https://www.google.com/search?q={query}&btnI");
    expect(buildLuckyUrl(cfg, "hello world")).toEqual({
      url: "https://www.google.com/search?q=hello%20world&btnI",
      commandId: "google",
    });
  });

  it("returns null when the default command has no luckyUrl", () => {
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
