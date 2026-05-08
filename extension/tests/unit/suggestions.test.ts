import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchSuggestions, parseSuggestionResponse } from "../../src/core/suggestions.js";
import type { FastTravelConfig } from "../../src/core/types.js";

// Minimal config for testing
const testConfig: FastTravelConfig = {
  version: 2,
  defaultCommand: "g",
  defaultSuggestionsApi:
    "https://suggestqueries.google.com/complete/search?client=firefox&q={query}",
  groups: [
    {
      id: "test",
      name: "Test",
      commands: [
        {
          id: "google",
          triggers: ["g"],
          name: "Google",
          type: "standard",
          suggestionsApi:
            "https://suggestqueries.google.com/complete/search?client=firefox&q={query}",
          routes: [
            {
              devices: "*",
              defaultUrl: "https://www.google.com",
              searchUrl: "https://www.google.com/search?q={query}",
              patterns: [],
            },
          ],
        },
        {
          id: "duckduckgo",
          triggers: ["ddg"],
          name: "DuckDuckGo",
          type: "standard",
          suggestionsApi: "https://duckduckgo.com/ac/?q={query}&type=list",
          routes: [
            {
              devices: "*",
              defaultUrl: "https://duckduckgo.com",
              searchUrl: "https://duckduckgo.com/?q={query}",
              patterns: [],
            },
          ],
        },
        {
          id: "no-api",
          triggers: ["noapi"],
          name: "No API",
          type: "standard",
          routes: [
            {
              devices: "*",
              defaultUrl: "https://example.com",
              searchUrl: "https://example.com/search?q={query}",
              patterns: [],
            },
          ],
        },
        {
          id: "reddit-sub",
          triggers: ["r/"],
          name: "Reddit subreddit",
          type: "prefix",
          suggestionsApi:
            "https://suggestqueries.google.com/complete/search?client=firefox&q={query}",
          routes: [
            {
              devices: "*",
              defaultUrl: "https://reddit.com/r/{term}",
              searchUrl: "https://reddit.com/r/{term}/search?q={query}",
              patterns: [],
            },
          ],
        },
        {
          id: "ticker",
          triggers: ["$"],
          name: "Stock ticker",
          type: "prefix",
          routes: [
            {
              devices: "*",
              defaultUrl: "https://finance.yahoo.com/quote/{term}",
              patterns: [],
            },
          ],
        },
      ],
    },
  ],
  ignoreList: [],
};

// Mock global fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

describe("fetchSuggestions", () => {
  it("returns empty for empty input", async () => {
    const result = await fetchSuggestions("", testConfig);
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("uses command-specific API when command matches", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(["weather", ["weather forecast", "weather today"]]),
    });

    const result = await fetchSuggestions("g weather", testConfig);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://suggestqueries.google.com/complete/search?client=firefox&q=weather",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result).toEqual([
      { text: "g weather forecast", displayText: "weather forecast", commandTrigger: "g", commandName: "Google" },
      { text: "g weather today", displayText: "weather today", commandTrigger: "g", commandName: "Google" },
    ]);
  });

  it("prepends command trigger to suggestions", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(["test", ["result one", "result two"]]),
    });

    const result = await fetchSuggestions("ddg test", testConfig);

    expect(result[0].text).toBe("ddg result one");
    expect(result[1].text).toBe("ddg result two");
  });

  it("falls back to default API when command has no suggestionsApi", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(["test", ["suggestion"]]),
    });

    const result = await fetchSuggestions("noapi test", testConfig);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://suggestqueries.google.com/complete/search?client=firefox&q=test",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result[0].text).toBe("noapi suggestion");
  });

  it("uses default API for unrecognized commands", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(["hello world", ["hello world population"]]),
    });

    const result = await fetchSuggestions("hello world", testConfig);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://suggestqueries.google.com/complete/search?client=firefox&q=hello%20world",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    // No command prefix - suggestions are as-is
    expect(result[0].text).toBe("hello world population");
  });

  it("handles fetch errors gracefully", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await fetchSuggestions("g test", testConfig);
    expect(result).toEqual([]);
  });

  it("handles non-ok responses", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });

    const result = await fetchSuggestions("g test", testConfig);
    expect(result).toEqual([]);
  });

  it("limits to 8 suggestions max", async () => {
    const manySuggestions = Array.from({ length: 15 }, (_, i) => `suggestion ${i}`);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(["q", manySuggestions]),
    });

    const result = await fetchSuggestions("g test", testConfig);
    expect(result.length).toBe(8);
  });

  it("handles DuckDuckGo response format", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          { phrase: "duck typing" },
          { phrase: "ducks" },
        ]),
    });

    const result = await fetchSuggestions("ddg duck", testConfig);
    expect(result[0].text).toBe("ddg duck typing");
    expect(result[1].text).toBe("ddg ducks");
  });

  it("fetches using default API for single-token command without extra args", async () => {
    const result = await fetchSuggestions("g", testConfig);

    // For single token matching a command, uses default API with full input
    expect(mockFetch).toHaveBeenCalled();
  });

  describe("prefix commands", () => {
    it("queries with the full input (prefix included) and tags suggestions", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([
            "r/ask",
            ["r/askreddit", "r/askmen", "r/askscience"],
          ]),
      });

      const result = await fetchSuggestions("r/ask", testConfig);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://suggestqueries.google.com/complete/search?client=firefox&q=r%2Fask",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(result).toEqual([
        { text: "r/askreddit", displayText: "r/askreddit", commandTrigger: "r/", commandName: "Reddit subreddit" },
        { text: "r/askmen", displayText: "r/askmen", commandTrigger: "r/", commandName: "Reddit subreddit" },
        { text: "r/askscience", displayText: "r/askscience", commandTrigger: "r/", commandName: "Reddit subreddit" },
      ]);
    });

    it("stitches the prefix on when upstream omits it", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(["r/ask", ["askreddit", "askmen"]]),
      });

      const result = await fetchSuggestions("r/ask", testConfig);
      expect(result.map((s) => s.text)).toEqual(["r/askreddit", "r/askmen"]);
    });

    it("returns empty when only the prefix is typed (no term yet)", async () => {
      const result = await fetchSuggestions("r/", testConfig);
      expect(result).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("uses the default API when the prefix command has no suggestionsApi", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(["$AAPL", ["$AAPL stock", "$AAPL news"]]),
      });

      const result = await fetchSuggestions("$AAPL", testConfig);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://suggestqueries.google.com/complete/search?client=firefox&q=%24AAPL",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(result[0].commandTrigger).toBe("$");
      expect(result[0].commandName).toBe("Stock ticker");
    });
  });
});

describe("parseSuggestionResponse", () => {
  it("OpenSearch — extracts the suggestions array", () => {
    expect(parseSuggestionResponse(["q", ["a", "b", "c"]])).toEqual(["a", "b", "c"]);
  });

  it("DuckDuckGo — maps each {phrase} to its phrase", () => {
    expect(parseSuggestionResponse([{ phrase: "x" }, { phrase: "y" }])).toEqual(["x", "y"]);
  });

  it("plain string array — passes strings through", () => {
    expect(parseSuggestionResponse(["alpha", "beta"])).toEqual(["alpha", "beta"]);
  });

  it("Lyrics.ovh — formats each track as 'Title — Artist'", () => {
    const data = {
      data: [
        { title: "Hey Jude", artist: { name: "The Beatles" } },
        { title: "Hello", artist: { name: "Adele" } },
      ],
    };
    expect(parseSuggestionResponse(data)).toEqual([
      "Hey Jude — The Beatles",
      "Hello — Adele",
    ]);
  });

  it("Lyrics.ovh — falls back to title-only when artist is missing", () => {
    expect(parseSuggestionResponse({ data: [{ title: "Solo Title" }] })).toEqual(["Solo Title"]);
  });

  it("Lyrics.ovh — empty data array yields empty list", () => {
    expect(parseSuggestionResponse({ data: [] })).toEqual([]);
  });

  it("unknown shape — returns empty list", () => {
    expect(parseSuggestionResponse({ unexpected: true })).toEqual([]);
    expect(parseSuggestionResponse(null)).toEqual([]);
    expect(parseSuggestionResponse("not json")).toEqual([]);
  });
});
