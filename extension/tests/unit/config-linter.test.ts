import { describe, it, expect } from "vitest";
import { lintConfig } from "../../src/core/config-linter.js";
import type { FastTravelConfig } from "../../src/core/types.js";

/** Minimal valid config used as a base for tests. */
function makeConfig(overrides: Partial<FastTravelConfig> = {}): FastTravelConfig {
  return {
    version: 2,
    defaultCommand: "go",
    groups: [
      {
        id: "g1",
        name: "Group One",
        commands: [
          {
            id: "cmd-go",
            name: "Go",
            triggers: ["go"],
            type: "standard",
            routes: [{ devices: "*", defaultUrl: "https://example.com" }],
          },
        ],
      },
    ],
    ignoreList: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// URL scheme validation — defaultUrl
// ---------------------------------------------------------------------------

describe("config-linter: URL scheme validation on defaultUrl", () => {
  it("accepts https:// URLs", () => {
    const errors = lintConfig(makeConfig());
    const schemeErrors = errors.filter((e) => e.message.includes("URL scheme"));
    expect(schemeErrors).toHaveLength(0);
  });

  it("accepts http:// URLs", () => {
    const cfg = makeConfig();
    cfg.groups[0].commands[0].routes[0].defaultUrl = "http://example.com";
    const errors = lintConfig(cfg);
    expect(errors.filter((e) => e.message.includes("URL scheme"))).toHaveLength(0);
  });

  it("accepts mailto: URLs", () => {
    const cfg = makeConfig();
    cfg.groups[0].commands[0].routes[0].defaultUrl = "mailto:user@example.com";
    const errors = lintConfig(cfg);
    expect(errors.filter((e) => e.message.includes("URL scheme"))).toHaveLength(0);
  });

  it("accepts tel: URLs", () => {
    const cfg = makeConfig();
    cfg.groups[0].commands[0].routes[0].defaultUrl = "tel:+15550001234";
    const errors = lintConfig(cfg);
    expect(errors.filter((e) => e.message.includes("URL scheme"))).toHaveLength(0);
  });

  it("accepts file: URLs", () => {
    const cfg = makeConfig();
    cfg.groups[0].commands[0].routes[0].defaultUrl = "file:///home/user/doc.html";
    const errors = lintConfig(cfg);
    expect(errors.filter((e) => e.message.includes("URL scheme"))).toHaveLength(0);
  });

  it("rejects javascript: URLs", () => {
    const cfg = makeConfig();
    cfg.groups[0].commands[0].routes[0].defaultUrl = "javascript:alert(1)";
    const errors = lintConfig(cfg);
    const schemeErrors = errors.filter((e) => e.message.includes("URL scheme"));
    expect(schemeErrors).toHaveLength(1);
    expect(schemeErrors[0].path).toBe("commands.cmd-go.routes.defaultUrl");
    expect(schemeErrors[0].message).toContain("javascript");
  });

  it("rejects data: URLs", () => {
    const cfg = makeConfig();
    cfg.groups[0].commands[0].routes[0].defaultUrl = "data:text/html,x";
    const errors = lintConfig(cfg);
    const schemeErrors = errors.filter((e) => e.message.includes("URL scheme"));
    expect(schemeErrors).toHaveLength(1);
    expect(schemeErrors[0].message).toContain("data");
  });

  it("rejects vbscript: URLs", () => {
    const cfg = makeConfig();
    cfg.groups[0].commands[0].routes[0].defaultUrl = "vbscript:MsgBox(1)";
    const errors = lintConfig(cfg);
    const schemeErrors = errors.filter((e) => e.message.includes("URL scheme"));
    expect(schemeErrors).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// URL scheme validation — searchUrl
// ---------------------------------------------------------------------------

describe("config-linter: URL scheme validation on searchUrl", () => {
  it("accepts a valid searchUrl", () => {
    const cfg = makeConfig();
    cfg.groups[0].commands[0].routes[0].searchUrl =
      "https://example.com/search?q={query}";
    const errors = lintConfig(cfg);
    expect(errors.filter((e) => e.message.includes("URL scheme"))).toHaveLength(0);
  });

  it("rejects javascript: in searchUrl", () => {
    const cfg = makeConfig();
    cfg.groups[0].commands[0].routes[0].searchUrl = "javascript:void(0)";
    const errors = lintConfig(cfg);
    const schemeErrors = errors.filter((e) => e.message.includes("URL scheme"));
    expect(schemeErrors).toHaveLength(1);
    expect(schemeErrors[0].path).toBe("commands.cmd-go.routes.searchUrl");
  });

  it("rejects data: in searchUrl", () => {
    const cfg = makeConfig();
    cfg.groups[0].commands[0].routes[0].searchUrl = "data:text/html,<script>alert(1)</script>";
    const errors = lintConfig(cfg);
    const schemeErrors = errors.filter((e) => e.message.includes("URL scheme"));
    expect(schemeErrors).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// URL scheme validation — pattern url
// ---------------------------------------------------------------------------

describe("config-linter: URL scheme validation on pattern url", () => {
  it("accepts a valid pattern url", () => {
    const cfg = makeConfig();
    cfg.groups[0].commands[0].routes[0].patterns = [
      { match: "{slug}", url: "https://example.com/{slug}" },
    ];
    const errors = lintConfig(cfg);
    expect(errors.filter((e) => e.message.includes("URL scheme"))).toHaveLength(0);
  });

  it("rejects javascript: in pattern url", () => {
    const cfg = makeConfig();
    cfg.groups[0].commands[0].routes[0].patterns = [
      { match: "{slug}", url: "javascript:alert('{slug}')" },
    ];
    const errors = lintConfig(cfg);
    const schemeErrors = errors.filter((e) => e.message.includes("URL scheme"));
    expect(schemeErrors).toHaveLength(1);
    expect(schemeErrors[0].path).toBe("commands.cmd-go.patterns.url");
  });

  it("rejects data: in pattern url", () => {
    const cfg = makeConfig();
    cfg.groups[0].commands[0].routes[0].patterns = [
      { match: "{slug}", url: "data:text/html,{slug}" },
    ];
    const errors = lintConfig(cfg);
    const schemeErrors = errors.filter((e) => e.message.includes("URL scheme"));
    expect(schemeErrors).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Existing linter checks still work after the refactor
// ---------------------------------------------------------------------------

describe("config-linter: existing checks still work", () => {
  it("reports duplicate triggers", () => {
    const cfg = makeConfig();
    cfg.groups[0].commands[0].triggers = ["go", "go"];
    const errors = lintConfig(cfg);
    expect(errors.some((e) => e.message.includes("Duplicate trigger"))).toBe(true);
  });

  it("reports missing defaultCommand", () => {
    const cfg = makeConfig({ defaultCommand: "nonexistent" });
    const errors = lintConfig(cfg);
    expect(errors.some((e) => e.path === "defaultCommand")).toBe(true);
  });

  it("reports empty defaultUrl", () => {
    const cfg = makeConfig();
    cfg.groups[0].commands[0].routes[0].defaultUrl = "   ";
    const errors = lintConfig(cfg);
    expect(errors.some((e) => e.path.includes("defaultUrl"))).toBe(true);
  });
});
