import { describe, it, expect } from "vitest";
import {
  blendSuggestions,
  sectionStarts,
  nextSectionStart,
  type BlendInput,
  type BlendedItem,
} from "../../src/core/blend.js";

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

const PREFS_ALL = { blendFtHistory: true, includeBrowserHistory: true };

function ft(query: string, daysAgo = 0, commandId: string | null = null) {
  return { query, commandId, timestamp: NOW - daysAgo * DAY };
}

function bh(url: string, opts: { title?: string; daysAgo?: number; visits?: number } = {}) {
  return {
    url,
    title: opts.title ?? "",
    lastVisitTime: NOW - (opts.daysAgo ?? 0) * DAY,
    visitCount: opts.visits ?? 1,
  };
}

function makeInput(overrides: Partial<BlendInput> = {}): BlendInput {
  return {
    query: "gi",
    api: [],
    ftHistory: [],
    browserHistory: [],
    prefs: PREFS_ALL,
    now: NOW,
    ...overrides,
  };
}

function kinds(items: BlendedItem[]): string[] {
  return items.map((i) => i.kind);
}

function texts(items: BlendedItem[]): string[] {
  return items.map((i) =>
    i.kind === "api" ? i.text : i.kind === "history" ? i.entry.query : i.entry.url,
  );
}

describe("blendSuggestions - sections and caps", () => {
  it("returns [] for an empty query", () => {
    const out = blendSuggestions(makeInput({ query: "", api: ["a"] }));
    expect(out).toEqual([]);
  });

  it("API-only input passes through capped at 4, in server order", () => {
    const out = blendSuggestions(
      makeInput({ api: ["giants game", "github", "gif maker", "girl names", "give"] }),
    );
    expect(kinds(out)).toEqual(["api", "api", "api", "api"]);
    expect(texts(out)).toEqual(["giants game", "github", "gif maker", "girl names"]);
  });

  it("orders sections: FT history, then API, then browser history", () => {
    const out = blendSuggestions(
      makeInput({
        // old entries so nothing clears the top-hit score floor
        ftHistory: [ft("gitlab pipelines", 60)],
        api: ["giants game"],
        browserHistory: [bh("https://gitlab.com/ci-docs", { daysAgo: 80, visits: 1 })],
      }),
    );
    expect(kinds(out)).toEqual(["history", "api", "browser"]);
  });

  it("caps FT history at 2 (newest first) and browser history at 2", () => {
    const out = blendSuggestions(
      makeInput({
        ftHistory: [ft("gi one", 70), ft("gi two", 60), ft("gi three", 80)],
        browserHistory: [
          bh("https://a.gi.example", { daysAgo: 70 }),
          bh("https://b.gi.example", { daysAgo: 70 }),
          bh("https://c.gi.example", { daysAgo: 70 }),
        ],
      }),
    );
    const history = out.filter((i) => i.kind === "history");
    const browser = out.filter((i) => i.kind === "browser");
    expect(history).toHaveLength(2);
    expect(
      history.map((i) => (i.kind === "history" ? i.entry.query : "")),
    ).toEqual(["gi two", "gi one"]);
    expect(browser).toHaveLength(2);
  });

  it("only FT entries matching the query as a substring are included", () => {
    const out = blendSuggestions(
      makeInput({
        query: "git",
        ftHistory: [ft("github actions", 60), ft("weather tomorrow", 60), ft("digital git", 60)],
      }),
    );
    expect(texts(out)).toEqual(["github actions", "digital git"]);
  });

  it("caps total output at 8", () => {
    const out = blendSuggestions(
      makeInput({
        ftHistory: [ft("gi a", 1), ft("gi b", 2), ft("gi c", 3)],
        api: ["g1", "g2", "g3", "g4", "g5"],
        browserHistory: [
          bh("https://x.gi.example", { daysAgo: 1, visits: 9 }),
          bh("https://y.gi.example", { daysAgo: 1, visits: 9 }),
          bh("https://z.gi.example", { daysAgo: 1, visits: 9 }),
        ],
      }),
    );
    expect(out.length).toBeLessThanOrEqual(8);
  });
});

describe("blendSuggestions - top hit promotion", () => {
  it("promotes a strong recent prefix-matching browser entry above everything", () => {
    const out = blendSuggestions(
      makeInput({
        query: "gi",
        ftHistory: [ft("gitlab pipelines", 40)],
        api: ["giants game", "github"],
        browserHistory: [
          bh("https://github.com/", { title: "GitHub", daysAgo: 1, visits: 50 }),
          bh("https://gitlab.com/ci-docs", { daysAgo: 21, visits: 2 }),
        ],
      }),
    );
    expect(out[0].kind).toBe("browser");
    expect(out[0].topHit).toBe(true);
    expect(texts([out[0]])).toEqual(["https://github.com/"]);
  });

  it("a promoted entry is excluded from its own section", () => {
    const out = blendSuggestions(
      makeInput({
        query: "gi",
        browserHistory: [bh("https://github.com/", { title: "GitHub", daysAgo: 1, visits: 50 })],
      }),
    );
    expect(out.filter((i) => texts([i])[0] === "https://github.com/")).toHaveLength(1);
  });

  it("promotes a strong recent FT history entry when it beats browser entries", () => {
    const out = blendSuggestions(
      makeInput({
        query: "git",
        ftHistory: [ft("github actions", 0)],
        browserHistory: [bh("https://gitlab.com/x", { daysAgo: 30, visits: 1 })],
      }),
    );
    expect(out[0].kind).toBe("history");
    expect(out[0].topHit).toBe(true);
  });

  it("does not promote when the best match is below the score floor", () => {
    const out = blendSuggestions(
      makeInput({
        query: "gi",
        ftHistory: [ft("gitlab pipelines", 90)],
        browserHistory: [bh("https://github.com/", { daysAgo: 85, visits: 1 })],
      }),
    );
    expect(out.every((i) => !i.topHit)).toBe(true);
  });

  it("does not promote a substring-only (non-prefix) match", () => {
    const out = blendSuggestions(
      makeInput({
        query: "hub",
        ftHistory: [ft("github actions", 0)],
      }),
    );
    expect(out.every((i) => !i.topHit)).toBe(true);
  });
});

describe("blendSuggestions - dedup", () => {
  it("an FT history entry beats an identical API suggestion (normalized text)", () => {
    const out = blendSuggestions(
      makeInput({
        query: "news",
        ftHistory: [ft("  News ", 60)],
        api: ["news", "news today"],
      }),
    );
    expect(kinds(out)).toEqual(["history", "api"]);
    expect(texts(out)).toEqual(["  News ", "news today"]);
  });

  it("browser entries with the same URL are deduped keeping the first", () => {
    const out = blendSuggestions(
      makeInput({
        browserHistory: [
          bh("https://github.com/", { daysAgo: 70 }),
          bh("https://github.com/", { daysAgo: 80 }),
        ],
      }),
    );
    expect(out).toHaveLength(1);
  });

  it("an API text matching a browser URL is NOT deduped (different destinations)", () => {
    const out = blendSuggestions(
      makeInput({
        api: ["github"],
        browserHistory: [bh("https://github.com/", { daysAgo: 70 })],
      }),
    );
    expect(kinds(out)).toEqual(["api", "browser"]);
  });
});

describe("blendSuggestions - degradation", () => {
  it("blendFtHistory=false drops FT entries entirely (no section, no top hit)", () => {
    const out = blendSuggestions(
      makeInput({
        ftHistory: [ft("gi fresh", 0)],
        api: ["giants"],
        prefs: { blendFtHistory: false, includeBrowserHistory: true },
      }),
    );
    expect(kinds(out)).toEqual(["api"]);
  });

  it("includeBrowserHistory=false drops browser entries even if passed", () => {
    const out = blendSuggestions(
      makeInput({
        browserHistory: [bh("https://github.com/", { daysAgo: 0, visits: 50 })],
        api: ["giants"],
        prefs: { blendFtHistory: true, includeBrowserHistory: false },
      }),
    );
    expect(kinds(out)).toEqual(["api"]);
  });

  it("no history sources → API only, exactly today's behavior", () => {
    const out = blendSuggestions(makeInput({ api: ["a", "b"] }));
    expect(kinds(out)).toEqual(["api", "api"]);
  });
});

describe("section navigation helpers", () => {
  it("sectionStarts returns the first index of each kind run", () => {
    expect(sectionStarts(["command", "history", "history", "api", "api", "browser"]))
      .toEqual([0, 1, 3, 5]);
    expect(sectionStarts([])).toEqual([]);
  });

  it("nextSectionStart moves down to the next section start", () => {
    const kindsArr = ["command", "history", "history", "api", "api"];
    expect(nextSectionStart(kindsArr, -1, 1)).toBe(0);
    expect(nextSectionStart(kindsArr, 0, 1)).toBe(1);
    expect(nextSectionStart(kindsArr, 1, 1)).toBe(3);
    expect(nextSectionStart(kindsArr, 2, 1)).toBe(3);
    // already in the last section: stay put
    expect(nextSectionStart(kindsArr, 3, 1)).toBe(3);
    expect(nextSectionStart(kindsArr, 4, 1)).toBe(4);
  });

  it("nextSectionStart moves up to the previous section start", () => {
    const kindsArr = ["command", "history", "history", "api", "api"];
    expect(nextSectionStart(kindsArr, 4, -1)).toBe(3);
    expect(nextSectionStart(kindsArr, 3, -1)).toBe(1);
    // mid-section jumps to its own section start first
    expect(nextSectionStart(kindsArr, 2, -1)).toBe(1);
    expect(nextSectionStart(kindsArr, 1, -1)).toBe(0);
    expect(nextSectionStart(kindsArr, 0, -1)).toBe(0);
  });
});
