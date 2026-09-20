import { describe, it, expect, vi, beforeEach } from "vitest";
import { charsetFromContentType, fetchSuggestions } from "../../src/core/suggestions.js";
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

/**
 * Build a fetch Response stand-in. `body` is either a value serialised as UTF-8
 * JSON, or raw bytes for tests that need a specific encoding on the wire.
 */
function jsonResponse(
  body: unknown,
  contentType: string | null = "application/json; charset=utf-8",
) {
  const bytes =
    body instanceof Uint8Array ? body : new TextEncoder().encode(JSON.stringify(body));
  const headers = new Headers();
  if (contentType !== null) headers.set("content-type", contentType);
  return {
    ok: true,
    headers,
    arrayBuffer: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
  };
}

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
    mockFetch.mockResolvedValueOnce(jsonResponse(["weather", ["weather forecast", "weather today"]]));

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
    mockFetch.mockResolvedValueOnce(jsonResponse(["test", ["result one", "result two"]]));

    const result = await fetchSuggestions("ddg test", testConfig);

    expect(result[0].text).toBe("ddg result one");
    expect(result[1].text).toBe("ddg result two");
  });

  it("falls back to default API when command has no suggestionsApi", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(["test", ["suggestion"]]));

    const result = await fetchSuggestions("noapi test", testConfig);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://suggestqueries.google.com/complete/search?client=firefox&q=test",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result[0].text).toBe("noapi suggestion");
  });

  it("uses default API for unrecognized commands", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(["hello world", ["hello world population"]]));

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
    mockFetch.mockResolvedValueOnce(jsonResponse(["q", manySuggestions]));

    const result = await fetchSuggestions("g test", testConfig);
    expect(result.length).toBe(8);
  });

  it("handles DuckDuckGo response format", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([
          { phrase: "duck typing" },
          { phrase: "ducks" },
        ]));

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
      mockFetch.mockResolvedValueOnce(jsonResponse([
            "r/ask",
            ["r/askreddit", "r/askmen", "r/askscience"],
          ]));

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
      mockFetch.mockResolvedValueOnce(jsonResponse(["r/ask", ["askreddit", "askmen"]]));

      const result = await fetchSuggestions("r/ask", testConfig);
      expect(result.map((s) => s.text)).toEqual(["r/askreddit", "r/askmen"]);
    });

    it("returns empty when only the prefix is typed (no term yet)", async () => {
      const result = await fetchSuggestions("r/", testConfig);
      expect(result).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("uses the default API when the prefix command has no suggestionsApi", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(["$AAPL", ["$AAPL stock", "$AAPL news"]]));

      const result = await fetchSuggestions("$AAPL", testConfig);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://suggestqueries.google.com/complete/search?client=firefox&q=%24AAPL",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(result[0].commandTrigger).toBe("$");
      expect(result[0].commandName).toBe("Stock ticker");
    });
  });

  describe("response charset handling", () => {
    // "pokémon" as ISO-8859-1 bytes: é is the single byte 0xE9.
    const latin1Body = new Uint8Array([
      ...new TextEncoder().encode('["pok'), 0xe9, ...new TextEncoder().encode('mon",["pok'),
      0xe9, ...new TextEncoder().encode('mon","pok'), 0xe9, ...new TextEncoder().encode('mon go"]]'),
    ]);

    it("decodes an ISO-8859-1 body using the declared charset", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(latin1Body, "text/javascript; charset=ISO-8859-1"),
      );

      const result = await fetchSuggestions("g poké", testConfig);

      expect(result.map((s) => s.displayText)).toEqual(["pokémon", "pokémon go"]);
      expect(result[0].text).toBe("g pokémon");
    });

    it("decodes a UTF-8 body with an explicit charset", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(["poké", ["pokémon", "日本語"]], "text/javascript; charset=UTF-8"),
      );

      const result = await fetchSuggestions("g poké", testConfig);
      expect(result.map((s) => s.displayText)).toEqual(["pokémon", "日本語"]);
    });

    it("treats a missing charset parameter as UTF-8", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(["poké", ["pokémon"]], "application/json"));

      const result = await fetchSuggestions("g poké", testConfig);
      expect(result.map((s) => s.displayText)).toEqual(["pokémon"]);
    });

    it("treats a missing Content-Type header as UTF-8", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(["poké", ["pokémon"]], null));

      const result = await fetchSuggestions("g poké", testConfig);
      expect(result.map((s) => s.displayText)).toEqual(["pokémon"]);
    });

    it("falls back to UTF-8 for an unknown charset label", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(["poké", ["pokémon"]], "application/json; charset=not-a-real-charset"),
      );

      const result = await fetchSuggestions("g poké", testConfig);
      expect(result.map((s) => s.displayText)).toEqual(["pokémon"]);
    });

    it("returns empty when the body is not valid JSON", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(new TextEncoder().encode("not json"), "text/plain"),
      );

      const result = await fetchSuggestions("g test", testConfig);
      expect(result).toEqual([]);
    });
  });

  describe("charsetFromContentType", () => {
    it("parses header variants and defaults to utf-8", () => {
      expect(charsetFromContentType("text/javascript; charset=ISO-8859-1")).toBe("ISO-8859-1");
      expect(charsetFromContentType("application/json;charset=\"UTF-8\"")).toBe("UTF-8");
      expect(charsetFromContentType("text/plain; CHARSET=iso-8859-1; foo=bar")).toBe("iso-8859-1");
      expect(charsetFromContentType("application/json")).toBe("utf-8");
      expect(charsetFromContentType(null)).toBe("utf-8");
      expect(charsetFromContentType(undefined)).toBe("utf-8");
    });
  });
});
