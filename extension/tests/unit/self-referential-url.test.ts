import { describe, it, expect } from "vitest";
import { isFastTravelRedirectUrl } from "../../src/core/self-referential-url.js";

// Issue #84: Fast Travel's own search-redirect pages must not surface as
// history suggestions — selecting one is a dead round-trip through the
// redirector instead of a real destination.

describe("isFastTravelRedirectUrl - redirect pages", () => {
  const redirects = [
    // v1, self-hosted on its own subdomain (the case in the issue).
    "https://fast-travel.kavi.sh/?q=gh",
    "http://fast-travel.kavi.sh/?q=gh",
    // v1 on GitHub Pages, where "fast-travel" is a path segment.
    "https://someone.github.io/fast-travel/?q=gh",
    "https://someone.github.io/fast-travel?q=gh",
    // The extension's own omnibox sentinel — no `q` requirement, the host
    // alone is conclusive.
    "https://fast-travel-omnibox.invalid/search?q=x",
    "https://fast-travel-omnibox.invalid/",
    // Spelling variant, and `q` alongside other params.
    "https://fasttravel.example.com/?q=gh",
    "https://fast-travel.kavi.sh/?lang=en&q=gh",
  ];

  for (const url of redirects) {
    it(`filters ${url}`, () => {
      expect(isFastTravelRedirectUrl(url)).toBe(true);
    });
  }
});

describe("isFastTravelRedirectUrl - real destinations", () => {
  const keep = [
    // The project's own pages carry no `q`, so they are never filtered.
    "https://kavi.sh/fast-travel-app/",
    "https://kavi.sh/fast-travel-app/privacy-policy/",
    "https://github.com/DoubleGremlin181/fast-travel",
    "https://github.com/DoubleGremlin181/fast-travel-app/issues/84",
    // A genuine search that merely mentions fast travel.
    "https://www.google.com/search?q=fast-travel",
    "https://en.wikipedia.org/wiki/Fast_travel",
    // Ordinary history entries.
    "https://github.com/",
    "https://duckduckgo.com/?q=gh",
  ];

  for (const url of keep) {
    it(`keeps ${url}`, () => {
      expect(isFastTravelRedirectUrl(url)).toBe(false);
    });
  }

  it("returns false for input that isn't a URL", () => {
    expect(isFastTravelRedirectUrl("not a url")).toBe(false);
    expect(isFastTravelRedirectUrl("")).toBe(false);
    // Plain search queries reach this via FT history, which stores raw text.
    expect(isFastTravelRedirectUrl("gh fast-travel ?q=")).toBe(false);
  });
});
